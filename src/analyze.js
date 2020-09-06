import {
    signature,
    NEVER,
    NULL,
    BOOL,
    NUMBER,
    STRING,
    union,
    array,
    apply,
    reduce,
    resolve,
    isValid,
    TypeVar,
    FuncType,
    TypeMapping,
    UnresolvedType,
    stdlibTypes,
} from './types';

/// Possible errors returned by an analyze function.
export const Errors = {
    /// An identifier has a leading @ sign. This is invalid because these are reserved for form
    /// parameters.
    LEADING_AT_IDENT: 'leading @ in identifier',
    /// A referenced identifier couldn’t be resolved.
    NOT_IN_SCOPE: 'definition not in scope',
    /// The data contains an object with an unknown type.
    UNKNOWN_DEF_TYPE: 'unknown definition type',
    /// The data has an invalid format.
    INVALID_FORMAT: 'invalid format',
    /// A type error; e.g. mismatch in argument count.
    TYPE_ERROR: 'type error',
};

const VM_FN_PARAM = Symbol('fn-param');

/// Creates an analysis context.
///
/// # Parameters
/// - formValues: map of form variables to their types
function buildContext (formValues) {
    const cache = new WeakMap();
    // put standard library types in the cache
    const stdDefs = {};
    for (const k in stdlibTypes) {
        const def = {};
        cache.set(def, {
            valid: true,
            type: stdlibTypes[k],
            defTypes: new Set(),
            stdUsage: new Set([k]),
        });
        stdDefs[k] = def;
    }
    const getFormValueType = id => typeof formValues === 'function'
        ? formValues(id)
        : formValues[id];
    return [
        stdDefs,
        {
            // cache so items don’t have to be analyzed twice
            cache,
            // the current path in the data (kind of like a syntactical stack trace?)
            path: [],
            // list of locked data. This is required for recursive functions
            locks: new WeakMap(),
            // a list of UnresolvedType instances
            unresolved: new Set(),
            // a map from UnresolvedType to partially resolved types that will replace them
            resolveMap: new Map(),
            // a function that returns the type of a form variable
            getFormValueType,
        },
    ];
}

/// Analyzes the given definitions. Returns an object with a `valid` key.
/// If the result is valid, will also have a `type` key, else an `error` key.
///
/// Keep in mind that it is not entirely possible to rule out a stack overflow with untrusted data,
/// so it might be best to wrap this in a try/catch.
///
/// # Parameters
/// - definitions: definitions object
/// - id: name of the definition to analyze
/// - formValues: one of the following:
///   - an object mapping form values to their types. If a referenced form value is not in
///     this object, it will be considered not in scope.
///   - a function that maps ids to their types, or null.
export function analyze (definitions, id, formValues) {
    const [stdDefs, context] = buildContext(formValues);
    const defs = { ...stdDefs, ...definitions };
    const item = analyzeScoped(defs, id, context);
    if (item.type) {
        // resolve unresolved types
        for (const [k, v] of context.resolveMap) {
            item.type = resolve(item.type, k, v);
        }
    }
    return item;
}

/// Analyzes all of the given definitions. Returns an object of results keyed by definition name.
///
/// # Parameters
// See `analyze(...)`
export function analyzeAll (definitions, formValues) {
    const [stdDefs, context] = buildContext(formValues);
    const data = {};
    const defs = { ...stdDefs, ...definitions };
    for (const k in definitions) data[k] = analyzeScoped(defs, k, context);
    // resolve unresolved types
    for (const k in data) {
        const item = data[k];
        if (item.type) {
            for (const [k, v] of context.resolveMap) {
                item.type = resolve(item.type, k, v);
            }
        }
    }
    return data;
}

/// Analyzes the given definitions. Try using `analyze` or `analyzeAll` instead, though.
///
/// # Parameters
/// - definitions: definitions object
/// - id: id to analyze
/// - context: context object. See buildContext
export function analyzeScoped (definitions, id, context) {
    if (typeof id !== 'string' && typeof id !== 'symbol') {
        // identifiers must be strings or symbols
        return {
            valid: false,
            error: Errors.INVALID_FORMAT,
            path: context.path.concat(['' + id]),
        }
    }

    if (typeof id === 'string' && id.startsWith('@')) {
        // if the identifier is a form variable, return that
        const ty = context.getFormValueType(id.substr(1));
        if (ty) return { valid: true, type: ty, defTypes: new Set(), stdUsage: new Set() };
    }

    const item = definitions[id];
    if (!item) {
        // identifier couldn’t be resolved
        return {
            valid: false,
            error: {
                type: Errors.NOT_IN_SCOPE,
                path: context.path.concat([id]),
            },
        };
    };

    if (typeof id === 'string' && id.startsWith('@')) {
        // invalid identifier name
        return {
            valid: false,
            error: {
                type: Errors.LEADING_AT_IDENT,
                path: context.path.concat([id]),
            },
        };
    }

    // a precomputed invalid format error because it’s used a lot
    const invalidFormatError = {
        valid: false,
        error: {
            type: Errors.INVALID_FORMAT,
            path: context.path.concat([id]),
        },
    };

    if (typeof item !== 'object' || item === null) {
        return invalidFormatError;
    }

    // return cached if it exists
    if (context.cache.has(item)) return context.cache.get(item);

    if (context.locks.has(item)) {
        // this definition’s type is currently still being analyzed and depends on itself (as
        // evidenced by the lock being present). This is most likely a recursive definition.
        // return an unresolved type
        const lock = context.locks.get(item);
        if (!lock.unresolved) {
            lock.unresolved = new UnresolvedType(item);
            context.unresolved.add(lock.unresolved);
        }
        return { valid: true, type: lock.unresolved, defTypes: new Set(), stdUsage: new Set() };
    }

    // lock the current definition
    context.locks.set(item, { unresolved: null });

    // output definition type
    let type;
    // types of definitions used
    const defTypes = new Set();
    // standard library functions used
    const stdUsage = new Set();

    const addDefTypes = list => {
        for (const item of list) defTypes.add(item);
    };
    const addStdUsage = list => {
        for (const item of list) stdUsage.add(item);
    };

    if (item.t === 'u') {
        type = NULL;
        defTypes.add('u');
    } else if (item.t === 'b') {
        if (typeof item.v !== 'boolean') return invalidFormatError;
        type = BOOL;
        defTypes.add('b');
    } else if (item.t === 'n') {
        if (typeof item.v !== 'number' || !Number.isFinite(item.v)) return invalidFormatError;
        type = NUMBER;
        defTypes.add('n');
    } else if (item.t === 's') {
        if (typeof item.v !== 'string') return invalidFormatError;
        type = STRING;
        defTypes.add('s');
    } else if (item.t === 'm') {
        if (!Array.isArray(item.v)) return invalidFormatError;
        defTypes.add('m');
        let innerType;
        try {
            innerType = getInnerArrayType(item.v);
        } catch {
            return invalidFormatError;
        }
        type = array(innerType);
    } else if (item.t === 'l') {
        if (!Array.isArray(item.v)) return invalidFormatError;
        defTypes.add('l');
        const refTypes = [];
        for (const ref of item.v) {
            const node = analyzeScoped(definitions, ref, context);
            if (!node.valid) return node;
            addDefTypes(node.defTypes);
            addStdUsage(node.stdUsage);
            refTypes.push(node.type);
        }
        type = array(union(refTypes));
    } else if (item.t === 'c') {
        if (typeof item.f !== 'string' && typeof item.f !== 'symbol') return invalidFormatError;
        if (('a' in item) && !Array.isArray(item.a)) return invalidFormatError;
        defTypes.add('c');
        const fnNode = analyzeScoped(definitions, item.f, context);
        if (!fnNode.valid) return fnNode;
        addDefTypes(fnNode.defTypes);
        addStdUsage(fnNode.stdUsage);
        const argTypes = [];
        for (const arg of (item.a || [])) {
            const node = analyzeScoped(definitions, arg, context);
            if (!node.valid) return node;
            addDefTypes(node.defTypes);
            addStdUsage(node.stdUsage);
            argTypes.push(node.type);
        }
        type = apply(fnNode.type, argTypes);
    } else if (item.t === 'f') {
        if (!Array.isArray(item.p)) return invalidFormatError;
        if (typeof item.b !== 'object' || item.b === null) return invalidFormatError;
        defTypes.add('f');
        const bindings = [];
        const patterns = [];
        const params = {}; // defs
        for (const p of item.p) {
            if (typeof p !== 'string') return invalidFormatError;
            const pv = new TypeVar();
            bindings.push(pv);
            patterns.push(pv);
            params[p] = { t: VM_FN_PARAM, type: pv };
        }

        // only allow definitions that do not start with an _ to be referenced in the child scope
        const allowedParentScopeDefs = {};
        for (const n in definitions) {
            if (typeof n === 'symbol' || !n.startsWith('_')) {
                allowedParentScopeDefs[n] = definitions[n];
            }
        }

        const retNode = analyzeScoped({
            ...allowedParentScopeDefs,
            ...params,
            ...item.b,
        }, '=', {
            ...context,
            path: context.path.concat([id]),
        });

        if (!retNode.valid) return retNode;
        addDefTypes(retNode.defTypes);
        addStdUsage(retNode.stdUsage);

        type = new FuncType([new TypeMapping(bindings, patterns, retNode.type)]);
    } else if (item.t === 'w') {
        if (!Array.isArray(item.m)) return invalidFormatError;

        const cases = [];

        for (const xcase of item.m) {
            if (typeof xcase !== 'object') return invalidFormatError;
            if (typeof xcase.c === 'string' || typeof xcase.c === 'symbol') {
                const condNode = analyzeScoped(definitions, xcase.c, context);
                if (!condNode.valid) return condNode;
            }
            const valNode = analyzeScoped(definitions, xcase.v, context);
            if (!valNode.valid) return valNode;
            cases.push(valNode.type);
        }

        type = union(cases);
    } else if (item.t === VM_FN_PARAM) {
        type = item.type;
    } else {
        return {
            valid: false,
            error: {
                type: Errors.UNKNOWN_DEF_TYPE,
                path: context.path.concat([id]),
                item,
            },
        };
    }

    if (!isValid(type)) {
        return {
            valid: false,
            error: {
                type: Errors.TYPE_ERROR,
                path: context.path.concat([id]),
                item,
                error: type,
            },
        };
    }

    const value = {
        valid: true,
        type: reduce(type),
        defTypes,
        stdUsage,
    };
    context.cache.set(item, value);
    const lock = context.locks.get(item);
    if (lock.unresolved) {
        context.resolveMap.set(lock.unresolved, value.type);
    }
    context.locks.delete(item);
    return value;
}

/// Determines the type of a hetereogenous array of values.
///
/// If multiple types are present, returns a union. If no values are present, returns a type var.
function getInnerArrayType (value) {
    if (value.length) {
        const unionTypes = [];
        for (const x of value) {
            const t = typeof x;
            if (x === null) unionTypes.push(NULL);
            else if (t === 'boolean') unionTypes.push(BOOL);
            else if (t === 'number') unionTypes.push(NUMBER);
            else if (t === 'string') unionTypes.push(STRING);
            else if (Array.isArray(x)) unionTypes.push(array(union(x.map(getInnerArrayType))));
            else throw new Error('invalid type in array');
        }

        return union(unionTypes);
    }

    return new TypeVar();
}
