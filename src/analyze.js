import { signature, NEVER, NULL, BOOL, NUMBER, STRING, union, array, apply, reduce, TypeVar, CondType, FuncType, UnresolvedType, stdlibTypes } from './types';

// TODO: detect non-primitive recursion

export const Errors = {
    LEADING_AT_IDENT: 'leading @ in identifier',
    NOT_IN_SCOPE: 'definition not in scope',
    UNKNOWN_DEF_TYPE: 'unknown definition type',
    INVALID_FORMAT: 'invalid format',
};

const VM_FN_PARAM = Symbol('fn-param');

function buildContext (formValues) {
    const cache = new WeakMap();
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
            cache,
            path: [],
            locks: new WeakMap(),
            unresolved: new Set(),
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
    return analyzeScoped(defs, id, context);
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
    return data;
}

/// Analyzes the given definitions.
/// Assumes they are in a valid format.
///
/// # Parameters
/// - definitions: definitions object
/// - id: id to analyze
/// - context: object of { cache: WeakMap, path: string[] }
export function analyzeScoped (definitions, id, context) {
    if (typeof id !== 'string' && typeof id !== 'symbol') {
        return {
            valid: false,
            error: Error.INVALID_FORMAT,
            path: context.path.concat(['' + id]),
        }
    }

    if (typeof id === 'string' && id.startsWith('@')) {
        const ty = context.getFormValueType(id.substr(1));
        if (ty) return { valid: true, type: ty };
    }

    const item = definitions[id];
    if (!item) {
        return {
            valid: false,
            error: {
                type: Errors.NOT_IN_SCOPE,
                path: context.path.concat([id]),
            },
        };
    };

    if (typeof id === 'string' && id.startsWith('@')) {
        return {
            valid: false,
            error: {
                type: Errors.LEADING_AT_IDENT,
                path: context.path.concat([id]),
            },
        };
    }

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
        const lock = context.locks.get(item);
        if (!lock.unresolved) {
            lock.unresolved = new UnresolvedType(item);
            context.unresolved.add(lock.unresolved);
        }
        return { valid: true, type: lock.unresolved };
    }
    context.locks.set(item, { unresolved: null });

    let type;
    const defTypes = new Set();
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
        if (typeof item.f !== 'string') return invalidFormatError;
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
        let currentTy = fnNode.type;
        for (const t of argTypes) currentTy = apply(currentTy, t);
        type = currentTy;
    } else if (item.t === 'f') {
        if (!Array.isArray(item.p)) return invalidFormatError;
        if (typeof item.b !== 'object' || item.b === null) return invalidFormatError;
        defTypes.add('f');
        const params = {};
        for (const p of item.p) {
            if (typeof p !== 'string') return invalidFormatError;
            params[p] = { t: VM_FN_PARAM, type: new TypeVar() };
        }
        const retNode = analyzeScoped({
            ...definitions,
            ...params,
            ...item.b,
        }, '=', {
            ...context,
            path: context.path.concat([id]),
        });

        if (!retNode.valid) return retNode;
        addDefTypes(retNode.defTypes);
        addStdUsage(retNode.stdUsage);

        type = retNode.type;
        for (const p in params) type = new FuncType(params[p].type, type);

        // TODO: try resolve unresolved types
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

    const value = {
        valid: true,
        type: reduce(type),
        defTypes,
        stdUsage,
    };
    context.cache.set(item, value);
    const lock = context.locks.get(item);
    if (lock.unresolved) {
        // TODO: resolve type
    }
    context.locks.delete(item);
    return value;
}

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
