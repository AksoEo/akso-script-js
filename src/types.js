/// The never type. An empty set.
/// This type indicates that the definition which has this type will never return a value, such as
/// by getting stuck in an infinite loop.
/// For correct programs, this type will most likely appear in a union with other types as a return
/// type of a function to indicate that a function *might* not halt.
export const NEVER = Symbol('⊥');
/// The null type. Has a single value: null itself.
export const NULL = Symbol('null');
/// The boolean type. Has two values: true and false.
export const BOOL = Symbol('bool');
/// The number type. Represents a finite Javascript number and must not be NaN, Infinity, or
/// -Infinity.
export const NUMBER = Symbol('num');
/// The string type. Can be any sort of Javascript string.
export const STRING = Symbol('str');
/// The array type. This should not be used directly but should instead be considered an irreducible
/// type function. Apply a type to this to indicate an actual array (such as apply(ARRAY, NUMBER)),
/// or just use the array(…) convenience function.
export const ARRAY = Symbol('array');

/// Converts a type to a string, deterministically. Can be used for comparison of identical types.
///
/// (However, types may still be equal since they can be reduced)
export function signature (type) {
    if (type === NEVER) return '!';
    else if (type === NULL) return '()';
    else if (type === BOOL) return 'bool';
    else if (type === NUMBER) return 'num';
    else if (type === STRING) return 'str';
    else if (type === ARRAY) return '[]';
    else return type.signature;
}

/// Applies an ordered set of types to another type. May create a reducible type.
/// If the number of arguments is incorrect, will return an abnormal type.
export function apply (recv, args) {
    if (!Array.isArray(args)) throw new Error('args must be an array');
    for (const arg of args) if (doesHalt(arg) === false) return NEVER; // never is poison
    if (recv === NEVER) return NEVER;
    if (typeof recv === 'symbol') return new AppliedType(recv, args, SECRET);
    return recv.apply(args);
}

/// Substitutes a type [variable] for another (alpha?).
export function subst (type, key, value) {
    if (typeof type === 'symbol') return key === type ? value : type;
    return type.subst(key, value);
}

/// Reduces a type (beta?).
export function reduce (type) {
    if (typeof type === 'symbol') return type;
    return type.reduce();
}

/// Matches a type on a pattern.
function match (pattern, type) {
    if (type instanceof UnionType) {
        // when matching a union type, we need to cheat
        // say e.g. we have a function that takes a string and outputs a string, and for any other
        // type outputs null. Then if we have a union of (string | number) as an argument, we want
        // it to still match the string case.
        // Hence, we need to match each union item individually.
        const maps = [...type.signatures.values()].map(t => match(pattern, t)).filter(x => x);
        if (!maps.length) return null;
        return mergeMaps(maps);
    }
    if (typeof pattern === 'symbol') return type === NEVER || type === pattern ? new Map() : null;
    return pattern.match(type);
}

/// Returns whether the given type is a concrete type.
export function isConcrete (type) {
    if (typeof type === 'symbol') return true;
    return type.isConcrete;
}

/// Resolves all instances of the given unresolved type with the given partially resolved type.
export function resolve (type, unresolved, resolved) {
    return reduce(subst(type, unresolved, NEVER));
}

/// Returns true if an expression of the given type will always halt.
/// Returns false if an expression of the given type will never halt.
/// Returns null if it *might* halt.
export function doesHalt (type) {
    if (type === NEVER) return false;
    if (typeof type === 'symbol') return true;
    return type.doesHalt;
}

/// Returns false if the type is not valid.
export function isValid (type) {
    if (typeof type === 'symbol') return true;
    return type.isValid;
}

/// Merges multiple Maps by key. Will pick one of the available options if keys overlap.
const mergeMaps = maps => new Map(maps.flatMap(map => [...map]));

/// Creates a union of types, with two exceptions:
///
/// - a union of zero types is the never type.
/// - a union of one type is the one type itself and won’t be put into a UnionType wrapper
///
/// # Parameters
/// - types: an array of types
export function union (types) {
    const union = new UnionType(types, SECRET);
    if (union.isNever) return NEVER;
    if (union.isSingular) return [...union.signatures.values()][0];
    return union;
}

/// Creates an array type.
export function array (type) {
    return apply(ARRAY, [type]);
}

const SECRET = Symbol('secret');

/// A union of types.
/// Use the `union` function to construct a valid union.
export class UnionType {
    constructor (types, secret) {
        if (secret !== SECRET) console.trace('Warning: private constructor; use union()');
        this.signatures = new Map();

        for (const ty of types) this.add(ty);
    }
    add (ty) {
        const ts = signature(ty);
        if (this.signatures.has(ts)) return;
        this.signatures.set(ts, ty);
    }
    delete (ty) {
        this.signatures.delete(signature(ty));
    }
    intersect (union) {
        const intersection = [];
        for (const [k, v] of this.signatures) {
            if (!union.signatures.has(k)) continue;
            intersection.push(v);
        }
        return union(intersection);
    }
    get isNever () {
        return this.signatures.size === 0;
    }
    get isSingular () {
        return this.signatures.size === 1;
    }
    get signature () {
        return '(' + [...this.signatures.keys()].sort().join(' | ') + ')';
    }
    get isConcrete () {
        return [...this.signatures.values()].map(isConcrete).reduce((a, b) => a && b, true);
    }
    get doesHalt () {
        return [...this.signatures.values()].map(doesHalt).reduce((a, b) => {
            if (b === false) return null;
            if (a === null || b === null) return null;
            return true;
        }, true);
    }
    get isValid () {
        return [...this.signatures.values()].map(isValid).reduce((a, b) => a && b, true);
    }
    subst (k, v) {
        return union([...this.signatures.values()].map(x => subst(x, k, v)));
    }
    apply (ty) {
        return union([...this.signatures.values()].map(x => apply(x, ty)));
    }
    reduce () {
        return union([...this.signatures.values()].map(reduce).flatMap(item => {
            if (item instanceof UnionType) return [...item.signatures.values()];
            return [item];
        }));
    }
}

let typeVarCounter = 0;
/// A type variable.
export class TypeVar {
    constructor () {
        this.name = '';
        let remaining = typeVarCounter++;
        do {
            this.name += String.fromCharCode((remaining % 26) + 0x61);
            remaining = Math.floor(remaining / 26);
        } while (remaining);
    }
    get signature () {
        return '$' + this.name;
    }
    get isConcrete () {
        return false;
    }
    get doesHalt () {
        return true;
    }
    get isValid () {
        return true;
    }
    subst (k, v) {
        return k === this ? v : this;
    }
    apply (tys) {
        return new AppliedType(this, tys, SECRET);
    }
    reduce () {
        return this;
    }
}

/// Type application on a type variable.
export class AppliedType {
    constructor (recv, args, secret) {
        if (secret !== SECRET) console.trace('Warning: private constructor; use apply()');
        this.recv = recv;
        this.args = args;
    }
    get signature () {
        return '(' + signature(this.recv) + ' ' + this.args.map(signature).join(' ') + ')';
    }
    get isConcrete () {
        return isConcrete(this.recv) && this.args.map(isConcrete).reduce((a, b) => a && b, true);
    }
    get doesHalt () {
        const a = [doesHalt(this.recv)];
        for (const arg of this.args) a.push(doesHalt(arg));
        for (const item of a) if (item === false) return false;
        for (const item of a) if (item === null) return null;
        return true;
    }
    get isValid () {
        return isValid(this.recv) && this.args.map(isValid).reduce((a, b) => a && b, true);
    }
    subst (k, v) {
        return new AppliedType(subst(this.recv, k, v), this.args.map(arg => subst(arg, k, v)), SECRET);
    }
    apply (tys) {
        return new AppliedType(this, tys, SECRET);
    }
    reduce () {
        const args = this.args.map(reduce);
        const recv = reduce(this.recv);
        return apply(recv, args);
    }
}

/// The type of a function.
export class FuncType {
    constructor (mappings) {
        if (!Array.isArray(mappings)) throw new Error('mappings must be an array');
        if (!mappings.length) throw new Error('Function can’t have zero mappings')
        const arity = mappings[0].arity;
        for (const mapping of mappings) {
            if (mapping.arity !== arity) throw new Error('Function can’t have mappings with different arity');
        }
        this.mappings = mappings;
    }
    get arity () {
        return this.mappings[0].arity;
    }
    get signature () {
        return 'f(' + this.mappings.map(m => m.signature).join(',') + ')';
    }
    get isConcrete () {
        for (const mapping of this.mappings) {
            if (!mapping.isConcrete) return false;
            if (mapping.isTautology) break;
        }
        return true;
    }
    get doesHalt () {
        for (const mapping of this.mappings) {
            if (!mapping.doesHalt) return false;
            if (mapping.isTautology) break;
        }
        return true;
    }
    get isValid () {
        for (const mapping of this.mappings) {
            if (!mapping.isValid) return false;
            if (mapping.isTautology) break;
        }
        return true;
    }
    subst (k, v) {
        if (k instanceof UnresolvedType) {
            const newMappings = [];
            for (const mapping of this.mappings) {
                newMappings.push(mapping.subst(k, v));
            }
            return new FuncType(newMappings);
        }

        // substitutions can't touch the function body, because:
        // (1) type reductions will never need to use this since they will always apply beforehand
        // (2) this would cause namespacing issues with type variables
        return this;
    }
    apply (tys) {
        // TODO: handle case where there's union type args
        // (need to match each combination individually and union at the end)

        // substitute bindings for the concrete values that were passed
        for (const mapping of this.mappings) {
            const applied = mapping.matchApply(tys);
            if (applied) return reduce(reduce(applied)); // reducing twice gives better results
            else if (applied === null) return new AppliedType(this, tys, SECRET); // can't apply type var
        }

        // no applicable mapping could be found; the function is undefined at these inputs
        return new ErrorType('undefined');
    }
    reduce () {
        const newMappings = [];
        for (const mapping of this.mappings) {
            newMappings.push(mapping.reduce());
        }
        // TODO: flatten function in case a -> (fn) a by matching a against inner fn and extracting
        // cases
        return new FuncType(newMappings);
    }
}

/// A function pattern. Matches any function of the given arity and associates it with the given
/// binding.
export class FunctionPattern {
    constructor (binding, arity) {
        this.binding = binding;
        this.arity = arity;
    }
    get signature () {
        return `${signature(this.binding)}:(${[...new Array(this.arity)].map(x => '·').join(',')})->·`;
    }
}

/// Maps a pattern to a type. May bind type variables.
///
/// Patterns may be one of:
/// - primitive types
/// - apply(pattern, pattern)
/// - a function pattern
/// - a type variable binding
///
/// All variable bindings in patterns must be present in the bindings set.
export class TypeMapping {
    constructor (bindings, patterns, type) {
        this.bindings = bindings;
        this.patterns = patterns;
        this.type = type;
    }
    get arity () {
        return this.patterns.length;
    }
    get signature () {
        return '(' + this.patterns.map(signature).join(',') + ')->' + signature(this.type);
    }
    get isTautology () {
        for (const pat of this.patterns) {
            if (!(pat instanceof TypeVar)) return false;
        }
        return true;
    }
    get isConcrete () {
        let constBody = this.type;
        for (const b of this.bindings) constBody = subst(constBody, b, NEVER);
        return isConcrete(constBody);
    }
    get doesHalt () {
        return doesHalt(this.type);
    }
    get isValid () {
        return isValid(this.type);
    }
    subst (k, v) {
        return new TypeMapping(this.bindings, this.patterns, subst(this.type, k, v));
    }
    /// Tries to match and apply the given arguments to this mapping.
    ///
    /// - returns a type if successful
    /// - returns null if there is a type variable argument
    /// - returns false if it doesn't match
    matchApply (tys) {
        if (tys.length !== this.patterns.length) return new ErrorType('argc');

        let hasVarArg = false;

        // Bindings. Mapping our own type variables (found in this.bindings) to types from `tys`.
        const bindings = new Map();
        // Matches a type pattern.
        const matchPattern = (pat, ty) => {
            if (ty instanceof TypeVar) {
                hasVarArg = true;
                return false;
            }
            // concrete types can just be matched directly
            if (typeof pat === 'symbol') return pat === ty;
            else if (pat instanceof AppliedType) {
                // applications must match their receiver and their arguments
                if (!(ty instanceof AppliedType)) return false;
                if (pat.args.length !== ty.args.length) return false;
                if (!matchPattern(pat.recv, ty.recv)) return false;
                for (let i = 0; i < pat.args.length; i++) {
                    if (!matchPattern(pat.args[i], ty.args[i])) return false;
                }
                return true;
            } else if (pat instanceof FunctionPattern) {
                // a function pattern matches any function of the same arity
                if (!(ty instanceof FuncType)) return false;
                if (pat.arity !== ty.arity) return false;
                // it matched; so the function type can be bound
                bindings.set(pat.binding, ty);
                return true;
            } else if (pat instanceof TypeVar) {
                // a type variable matches anything
                bindings.set(pat, ty);
                return true;
            }
            // there are no other types of patterns
            return false;
        };

        for (let i = 0; i < this.patterns.length; i++) {
            if (!matchPattern(this.patterns[i], tys[i])) {
                if (hasVarArg) return null; // can't apply a type var!
                return false;
            }
        }

        // all patterns matched!
        let type = this.type;
        for (const [k, v] of bindings) type = subst(type, k, v);
        return type;
    }
    reduce () {
        return new TypeMapping(this.bindings, this.patterns, reduce(this.type));
    }
}

/// An unresolved type.
export class UnresolvedType extends TypeVar {
    constructor (node) {
        super();
        this.node = node;
    }
    get signature () {
        return '?' + this.name;
    }
    match (ty) {
        return ty === this ? new Map() : null;
    }
}

/// The error type. Not a real type but rather the absence of a type.
export class ErrorType {
    constructor (type) {
        this.type = type;
    }
    get signature () {
        return `ERROR!(${this.type})`;
    }
    get isConcrete () {
        return false;
    }
    get doesHalt () {
        return null;
    }
    get isValid () {
        return false;
    }
    subst (k, v) {
        return this;
    }
    apply (tys) {
        return this;
    }
    reduce () {
        return this;
    }
}

export function createPrimitiveType (name) {
    const classContainer = {};
    classContainer[name] = class {
        get signature () {
            return name;
        }
        get isConcrete () {
            return true;
        }
        get doesHalt () {
            return true;
        }
        get isValid () {
            return true;
        }
        subst (k, v) {
            return signature(k) === this.signature ? v : this;
        }
        apply (tys) {
            return new AppliedType(this, tys, SECRET);
        }
        reduce () {
            return this;
        }
    };
    return new classContainer[name]();
}

export const Timestamp = createPrimitiveType('timestamp');

const createPolyFn = mappings => {
    const fnMappings = [];
    for (const m of mappings) {
        const margs = m.slice();
        const mret = margs.pop();

        const bindings = [];
        const args = [];
        for (const marg of margs) {
            if (marg instanceof TypeVar) bindings.push(marg);
            args.push(marg);
        }

        fnMappings.push(new TypeMapping(bindings, args, mret));
    }
    return new FuncType(fnMappings);
};
const withVar = a => {
    const v = new TypeVar();
    return a(v);
};

const U = NULL;
const B = BOOL;
const N = NUMBER;
const S = STRING;
const any = () => new TypeVar();

const binaryMathOp = createPolyFn([[N, N, N], [any(), any(), U]]);
const unaryMathOp = createPolyFn([[N, N], [any(), U]]);

const mathCmpOp = createPolyFn([[any(), any(), B]]);
const unaryBoolOp = createPolyFn([[any(), B]]);
const binaryBoolOp = createPolyFn([[any(), any(), B]]);

const mapType = withVar(a => withVar(b => createPolyFn([
    [a, S, S],
    [a, array(b), array(apply(a, [b]))],
    [a, b, apply(a, [b])],
])));

const flatMapType = withVar(a => withVar(b => createPolyFn([
    [a, S, S],
    [a, array(b), apply(a, [b])],
    [a, b, array(apply(a, [b]))],
])));
const fold1Type = withVar(a => withVar(b => createPolyFn([
    [a, S, apply(a, [S, S])],
    [a, array(b), apply(a, [b, b])],
    [a, b, a],
])));
const foldType = withVar(a => withVar(b => withVar(c => createPolyFn([
    [a, b, S, apply(a, [b, S])],
    [a, b, array(c), apply(a, [b, c])],
    [a, b, c, apply(a, [b, c])],
]))));
const filterType = withVar(a => withVar(b => createPolyFn([
    // we do not need to distinguish between any and bool here because the outcome
    // will be the same
    [a, array(b), array(b)],
    [a, b, b],
])));

/// The types of standard library functions.
export const stdlibTypes = {
    '+': binaryMathOp,
    '-': binaryMathOp,
    '*': binaryMathOp,
    '/': binaryMathOp,
    '^': binaryMathOp,
    mod: binaryMathOp,
    floor: unaryMathOp,
    ceil: unaryMathOp,
    round: unaryMathOp,
    trunc: unaryMathOp,
    sign: unaryMathOp,
    abs: unaryMathOp,

    '==': createPolyFn([[any(), any(), B]]),
    '!=': createPolyFn([[any(), any(), B]]),
    '>': mathCmpOp,
    '<': mathCmpOp,
    '>=': mathCmpOp,
    '<=': mathCmpOp,
    and: binaryBoolOp,
    or: binaryBoolOp,
    not: unaryBoolOp,
    xor: binaryBoolOp,
    '++': withVar(a => withVar(b => createPolyFn([
        [array(a), array(b), array(union([a, b]))],
        [a, array(b), array(union([a, b]))],
        [array(a), b, array(union([a, b]))],
        [a, b, S],
    ]))),
    map: mapType,
    flat_map: flatMapType,
    fold: foldType,
    fold1: fold1Type,
    filter: filterType,
    index: withVar(a => createPolyFn([
        [array(a), N, union([U, a])],
        [S, N, union([U, S])],
        [any(), any(), U],
    ])),
    find_index: withVar(a => createPolyFn([
        [array(a), a, union([U, N])],
        [S, S, union([U, N])],
        [any(), any(), U],
    ])),
    length: createPolyFn([
        [array(any()), N],
        [S, N],
        [any(), U],
    ]),
    contains: createPolyFn([[0, 1, B]]),
    sort: withVar(a => createPolyFn([
        [array(a), array(a)],
        [S, S],
        [any(), U],
    ])),
    sum: createPolyFn([[array(N), N], [any(), U]]),
    min: createPolyFn([[array(N), N], [any(), U]]),
    max: createPolyFn([[array(N), N], [any(), U]]),
    avg: createPolyFn([[array(N), N], [any(), U]]),
    med: createPolyFn([[array(N), N], [any(), U]]),
    date_sub: createPolyFn([[S, S, S, union([S, U])], [any(), any(), any(), U]]),
    date_add: createPolyFn([[S, S, N, union([S, U])], [any(), any(), any(), U]]),
    date_today: S,
    date_fmt: createPolyFn([[S, union([S, U])], [any(), U]]),
    date_get: createPolyFn([[S, S, union([N, U])], [any(), any(), U]]),
    date_set: createPolyFn([[S, S, N, union([S, U])], [any(), any(), any(), U]]),
    ts_now: Timestamp,
    tz_utc: N,
    tz_local: N,
    ts_from_unix: createPolyFn([[N, Timestamp], [any(), U]]),
    ts_to_unix: createPolyFn([[Timestamp, N], [any(), U]]),
    ts_from_date: createPolyFn([[S, N, N, N, N, union([Timestamp, U])], [any(), any(), any(), any(), any(), U]]),
    ts_to_date: createPolyFn([[Timestamp, N, S], [any(), any(), U]]),
    ts_parse: createPolyFn([[S, union([Timestamp, U])], [any(), U]]),
    ts_to_string: createPolyFn([[Timestamp, S], [any(), U]]),
    ts_fmt: createPolyFn([[Timestamp, S], [any(), U]]),
    ts_add: createPolyFn([[S, Timestamp, N, union([Timestamp, U])], [any(), any(), any(), U]]),
    ts_sub: createPolyFn([[S, Timestamp, Timestamp, union([N, U])], [any(), any(), any(), U]]),
    ts_get: createPolyFn([[S, N, Timestamp, union([N, U])], [any(), any(), any(), U]]),
    ts_set: createPolyFn([[S, N, Timestamp, N, union([Timestamp, U])], [any(), any(), any(), any(), U]]),
    datetime_fmt: createPolyFn([[N, S], [any(), U]]),
    currency_fmt: createPolyFn([[S, N, union([S, U])], [any(), any(), U]]),
    country_fmt: createPolyFn([[S, union([S, U])], [any(), U]]),
    phone_fmt: createPolyFn([[S, union([S, U])], [any(), U]]),
    id: withVar(a => createPolyFn([[a, a]])),
};
