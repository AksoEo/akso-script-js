import { TopType, UnionType, ConcreteType, stdlibTypes } from './types';

// TODO: detect non-primitive recursion

export const Errors = {
    LEADING_AT_IDENT: 'leading @ in identifier',
    NOT_IN_SCOPE: 'definition not in scope',
    UNKNOWN_DEF_TYPE: 'unknown definition type',
    INVALID_FORMAT: 'invalid format',
};

const Types = ConcreteType.types;
const VM_FN_PARAM = Symbol('fn-param');

function buildContext (formValues) {
    const cache = new WeakMap();
    const stdDefs = {};
    for (const k in stdlibTypes) {
        const def = {};
        cache.set(def, { valid: true, type: stdlibTypes[k] });
        stdDefs[k] = def;
    }
    const getFormValueType = id => typeof formValues === 'function'
        ? formValues(id)
        : formValues[id];
    return [stdDefs, { cache, path: [], locks: new WeakMap(), getFormValueType }];
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
    if (typeof id !== 'string') {
        return {
            valid: false,
            error: Error.INVALID_FORMAT,
            path: context.path.concat(['' + id]),
        }
    }

    if (id.startsWith('@')) {
        const ty = context.getFormValueType(id);
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

    if (id.startsWith('@')) {
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

    if (context.locks.has(item)) return { valid: true, type: new TopType() };
    context.locks.set(item, 1);

    let type = new TopType();

    if (item.t === 'u') {
        type = new ConcreteType(Types.NULL);
    } else if (item.t === 'b') {
        if (typeof item.v !== 'boolean') return invalidFormatError;
        type = new ConcreteType(Types.BOOL);
    } else if (item.t === 'n') {
        if (typeof item.v !== 'number') return invalidFormatError;
        type = new ConcreteType(Types.NUMBER);
    } else if (item.t === 's') {
        if (typeof item.v !== 'string') return invalidFormatError;
        type = new ConcreteType(Types.STRING);
    } else if (item.t === 'm') {
        if (!Array.isArray(item.v)) return invalidFormatError;
        let innerType;
        try {
            innerType = getInnerArrayType(item.v);
        } catch {
            return invalidFormatError;
        }
        type = new ConcreteType(Types.ARRAY, innerType);
    } else if (item.t === 'l') {
        if (!Array.isArray(item.v)) return invalidFormatError;
        const refTypes = [];
        for (const ref of item.v) {
            const node = analyzeScoped(definitions, ref, context);
            if (!node.valid) return node;
            refTypes.push(node.type);
        }
        const union = new UnionType(refTypes);
        if (union.isConcrete) type = new ConcreteType(Type.ARRAY, union.types[0]);
        else type = new ConcreteType(Types.ARRAY, union);
    } else if (item.t === 'c') {
        if (typeof item.f !== 'string') return invalidFormatError;
        if (!Array.isArray(item.a)) return invalidFormatError;
        const fnNode = analyzeScoped(definitions, item.f, context);
        if (!fnNode.valid) return fnNode;
        const argTypes = [];
        for (const arg of item.a) {
            const node = analyzeScoped(definitions, arg, context);
            if (!node.valid) return node;
            argTypes.push(node.type);
        }
        let currentTy = fnNode.type;
        for (const t of argTypes) currentTy = currentTy.fnmap(t);
        type = currentTy;
    } else if (item.t === 'f') {
        if (!Array.isArray(item.p)) return invalidFormatError;
        if (typeof item.b !== 'object' || item.b === null) return invalidFormatError;
        const params = {};
        for (const p of item.p) {
            if (typeof p !== 'string') return invalidFormatError;
            params[p] = { t: VM_FN_PARAM, type: new TopType() }; // TODO: type inference
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
        type = retNode.type;
        for (const p in params) {
            type = new ConcreteType(Types.FUNC, params[p].type, type);
        }
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
        type,
    };
    context.cache.set(item, value);
    context.locks.delete(item);
    return value;
}

function getInnerArrayType (value) {
    if (value.length) {
        const unionTypes = [];
        for (const x of value) {
            const t = typeof x;
            if (x === null) unionTypes.push(new ConcreteType(Types.NULL));
            else if (t === 'boolean') unionTypes.push(new ConcreteType(Types.BOOL));
            else if (t === 'number') unionTypes.push(new ConcreteType(Types.NUMBER));
            else if (t === 'string') unionTypes.push(new ConcreteType(Types.STRING));
            else if (Array.isArray(x)) {
                const union = new UnionType(x.map(getInnerArrayType));
                if (union.isConcrete) unionTypes.push(new ConcreteType(Types.ARRAY, union.types[0]));
                else unionTypes.push(new ConcreteType(Types.ARRAY, union));
            } else {
                throw new Error('invalid type');
            }
        }

        const union = new UnionType(unionTypes);
        if (union.isConcrete) return union.types[0];
        else return union;
    }
    return new TopType();
}
