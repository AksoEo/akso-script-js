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
    if (recv === NEVER) return NEVER;
    if (typeof recv === 'symbol') return new AppliedType(recv, args, SECRET);
    return recv.apply(args);
}

/// Substitutes a type [variable] for another.
export function subst (type, key, value) {
    if (typeof type === 'symbol') return key === type ? value : type;
    return type.subst(key, value);
}

/// Reduces a type.
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
        // This would also be true for condtypes but god damn i am not writing that code today
        // TODO: that ^
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
    match (ty) {
        if (ty instanceof UnionType) {
            // FIXME: very inefficient
            const unionTypes = new Set(ty.signatures.values());
            const matches = [];
            for (const t of this.signatures.values()) {
                let matched, matchedType;
                for (const u of unionTypes) {
                    if (matched = match(t, u)) {
                        matchedType = u;
                    }
                }
                if (matched) {
                    matches.push(matched);
                    unionTypes.delete(matchedType);
                } else return null;
            }
            return mergeMaps(matches);
        }

        for (const t of this.signatures.values()) {
            const m = match(ty, t);
            if (m) return m;
        }

        // TODO: what happens here?
        return null;
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
        return '%' + this.name;
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
    match (ty) {
        return new Map([[this, ty]]);
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
        return '(' + signature(this.recv) + '(' + this.args.map(signature).join(',') + '))';
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
        return apply(subst(this.recv, k, v), this.args.map(arg => subst(arg, k, v)));
    }
    apply (tys) {
        return new AppliedType(this, tys, SECRET);
    }
    reduce () {
        const args = this.args.map(reduce);
        const recv = reduce(this.recv);
        return apply(recv, args);
    }
    match (ty) {
        if (ty instanceof AppliedType) {
            const recvMatch = match(this.recv, ty.recv);
            if (ty.args.length !== this.args.length) return null;
            const argMatches = this.args.map((x, i) => match(x, ty.args[i]));
            for (const m of argMatches) {
                if (!m) return null;
            }
            return mergeMaps(argMatches.concat([recvMatch]));
        }
        return null;
    }
}

/// Branching types; like a union type but with conditions.
///
/// - mapping: { pre: Predicate[], type: Type }[]
///   where Predicate is { var: TypeVar, match: Type }
export class CondType {
    constructor (mapping) {
        if (!Array.isArray(mapping)) throw new Error('not a valid mapping');
        this.mapping = mapping;
    }
    get signature () {
        return '{ ' + this.mapping.map(({ pre, type }) =>
            pre.map(pre => signature(pre.var) + ': ' + signature(pre.match)).join(' ∧ ')
                + ' -> ' + signature(type)).join(', ') + ' }';
    }
    get isConcrete () {
        for (const item of this.mapping) {
            for (const p of item.pre) {
                if (!isConcrete(p.var) || !isConcrete(p.match)) return false;
            }
            if (!isConcrete(item.type)) return false;
        }
        return true;
    }
    get doesHalt () {
        const itemHalts = [];
        for (const item of this.mapping) {
            for (const p of item.pre) {
                itemHalts.push(doesHalt(p.var));
                itemHalts.push(doesHalt(p.match));
            }
            itemHalts.push(doesHalt(item.type));
        }
        return itemHalts.reduce((a, b) => {
            if (b === false) return null;
            if (a === null || b === null) return null;
            return true;
        }, true);
    }
    get isValid () {
        for (const item of this.mapping) {
            for (const p of item.pre) {
                if (!isValid(p.var)) return false;
                if (!isValid(p.match)) return false;
            }
            if (!isValid(item.type)) return false;
        }
        return true;
    }
    subst (k, v) {
        const newMapping = [];
        for (const item of this.mapping) {
            newMapping.push({
                pre: item.pre.map(p => ({ var: subst(p.var, k, v), match: subst(p.match, k, v) })),
                type: subst(item.type, k, v),
            });
        }
        return new CondType(newMapping);
    }
    apply (tys) {
        const newMapping = [];
        for (const item of this.mapping) {
            newMapping.push({
                pre: item.pre,
                type: apply(item.type, tys),
            });
        }
        return new CondType(newMapping);
    }
    reduce () {
        const newMapping = [];

        outer:
        for (const item of this.mapping) {
            let reducedPre = item.pre.map(p => ({ var: reduce(p.var), match: reduce(p.match) }));
            let newType = reduce(item.type);
            const outIsConcrete = isConcrete(newType);

            let newPre = [];
            let poison = false;

            for (let i = 0; i < reducedPre.length; i++) {
                const p = reducedPre[i];

                if ((p.match instanceof TypeVar) && outIsConcrete) {
                    // will match literally anything, and since we don’t need to bind it it doesn’t
                    // matter
                    if (!doesHalt(p.var)) {
                        // make sure to still poison it, though
                        poison = true;
                    }
                    continue;
                }

                if (!isConcrete(p.var)) {
                    // this one has a type variable; keep the predicate
                    newPre.push(p);
                    continue;
                }

                const m = match(p.match, p.var);
                if (!m) {
                    // this is not a match and will never be true
                    // we can safely ignore this mapping case
                    continue outer;
                } else {
                    // always matches
                    if (!doesHalt(p.var)) {
                        // lhs does not necessarily halt; poison!
                        poison = true;
                    }
                    // substitute type variables otherwise
                    // since this is always a match we don’t really need to add it to the predicates
                    // anymore
                    for (const [k, v] of m) {
                        newType = subst(newType, k, v);
                    }
                    // also substitute in remaining predicates because sometimes we might
                    // bind a type variable in an earlier one
                    for (let j = i; j < reducedPre.length; j++) {
                        let { var: va, match } = reducedPre[j];
                        for (const [k, v] of m) {
                            va = subst(va, k, v);
                            match = subst(match, k, v);
                        }
                        reducedPre[j] = { var: va, match };
                    }
                }
            }

            const maybePoison = t => poison ? union([t, NEVER]) : t;

            if (newType instanceof CondType) {
                // merge nested condtypes
                for (const item of newType.mapping) {
                    newMapping.push({
                        pre: newPre.concat(item.pre),
                        type: maybePoison(item.type),
                    });
                }
            } else {
                newMapping.push({ pre: newPre, type: maybePoison(newType) });
            }

            // if this was a tautology, then we can skip the rest
            if (!newPre.length) break;
        }

        if (newMapping.length === 0) return NEVER;
        if (newMapping.length === 1 && !newMapping[0].pre.length) {
            // there’s only one case that’s always true
            // we can remove the condtype wrapper
            return newMapping[0].type;
        }

        return new CondType(newMapping);
    }
    match (ty) {
        if (ty instanceof CondType) {
            // FIXME: very inefficient
            const mappings = new Set(ty.mapping);
            const outerMatches = [];
            for (const item of this.mapping) {
                let outerMatch, matchingMapping;
                outer:
                for (const j of mappings) {
                    const tyMatch = match(item.type, j.type);
                    if (!tyMatch) continue;

                    const innerMatches = [tyMatch];
                    const preds = new Set(j.pre);
                    for (const p of item.pre) {
                        let innerMatch, matchingQ;
                        for (const q of preds) {
                            const varMatch = match(p.var, q.var);
                            const patMatch = match(p.match, q.match);
                            if (varMatch && patMatch) {
                                matchingQ = q;
                                innerMatch = mergeMaps([varMatch, patMatch]);
                                break;
                            }
                        }
                        if (matchingQ) {
                            preds.delete(matchingQ);
                            innerMatches.push(innerMatch);
                        } else continue outer;
                    }
                    matchingMapping = j;
                    outerMatch = mergeMaps(innerMatches);
                    break;
                }

                if (matchingMapping) {
                    mappings.delete(matchingMapping);
                    outerMatches.push(outerMatch);
                } else return null;
            }
            return mergeMaps(outerMatches);
        }
        return null;
    }
}

/// The type of a function. Has a set of argument bindings.
export class FuncType {
    constructor (bindings, body) {
        if (!Array.isArray(bindings)) throw new Error('bindings must be an array');
        this.bindings = bindings;
        this.body = body;
    }
    get signature () {
        return 'λ(' + this.bindings.map(signature).join(',') + ' -> ' + signature(this.body) + ')';
    }
    get isConcrete () {
        let constBody = this.body;
        for (const b of this.bindings) constBody = subst(constBody, b, NEVER);
        return isConcrete(constBody);
    }
    get doesHalt () {
        return doesHalt(this.body);
    }
    get isValid () {
        return isValid(this.body);
    }
    subst (k, v) {
        for (const b of this.bindings) {
            if (b instanceof TypeVar && signature(k) === signature(b)) {
                // if the subst key is a type var, this usually means a function is being
                // applied. In this case, we do *not* want to keep propagating the substitution
                // into this function's body, because type variables inside the function body
                // are in a different scope and shadow the parent scope variables.
                // tldr: since bindings are, well, *new* bindings, we perform no substitutions if
                // the key happens to be a binding.
                return this;
            }
        }
        return new FuncType(this.bindings, subst(this.body, k, v));
    }
    apply (tys) {
        if (tys.length !== this.bindings.length) {
            return new ErrorType('argc');
        }

        // substitute bindings for the concrete values that were passed
        let body = this.body;
        for (let i = 0; i < this.bindings.length; i++) {
            body = subst(body, this.bindings[i], tys[i]);
        }
        // reduce twice because it may be helpful
        return reduce(reduce(body));
    }
    reduce () {
        return new FuncType(this.bindings, reduce(this.body));
    }
    match (ty) {
        if (ty instanceof FuncType) {
            if (ty.bindings.length !== this.bindings.length) return null;
            // try substituting our bindings for the other function's and seeing if it matches
            let b = this.body;
            for (let i = 0; i < ty.bindings.length; i++) {
                b = subst(b, this.bindings[i], ty.bindings[i]);
            }

            const m = match(b, ty.body);
            if (m) {
                // encode substitutions if it matches
                for (let i = 0; i < ty.bindings.length; i++) {
                    m.set(this.bindings[i], ty.bindings[i]);
                }
            }
            return m;
        }
        return null;
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
    match (ty) {
        return null;
    }
}

const createPolyFn = mappings => {
    const argc = mappings[0].length - 1;
    const args = [];
    for (let i = 0; i < argc; i++) args.push(new TypeVar());

    let condMapping = [];
    for (const m of mappings) {
        const margs = m.slice();
        const mret = margs.pop();

        const predicates = [];
        for (let i = 0; i < argc; i++) {
            predicates.push({
                var: args[i],
                match: margs[i],
            });
        }

        condMapping.push({
            pre: predicates,
            type: mret,
        });
    }

    if (condMapping.length === 1) {
        return new FuncType(args, condMapping[0].type);
    }

    return new FuncType(args, new CondType(condMapping));
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
const binaryBoolOp = createPolyFn([[any(), any(), B]]);

const mapType = withVar(a => withVar(b => createPolyFn([
    [new FuncType([S], S), S, S],
    [new FuncType([a], S), array(a), S],
    [new FuncType([S], b), S, array(b)],
    [new FuncType([a], b), array(a), array(b)],
    [new FuncType([a], b), a, b],
    [a, array(b), array(a)],
    [a, b, apply(a, [b])],
])));

const flatMapType = withVar(a => withVar(b => createPolyFn([
    [new FuncType([S], S), S, S],
    [new FuncType([a], S), array(a), S],
    [new FuncType([S], array(b)), S, array(b)],
    [new FuncType([a], array(b)), array(a), array(b)],
    [new FuncType([a], array(b)), a, array(b)],
    [new FuncType([a], b), a, array(b)],
    [a, array(b), array(a)],
    [a, b, array(apply(a, [b]))],
])));
const fold1Type = withVar(a => withVar(b => createPolyFn([
    [new FuncType([S, S], S), S, S],
    [new FuncType([a, a], a), array(a), a],
    [a, b, a],
])));
const foldType = withVar(a => withVar(b => createPolyFn([
    [new FuncType([a, S], a), a, S, a],
    [new FuncType([a, b], a), a, array(b), a],
    [a, b, any(), a],
])));
const filterType = withVar(a => withVar(b => createPolyFn([
    // we do not need to distinguish between any and bool here because the outcome
    // will be the same
    [new FuncType([a], b), array(a), array(a)],
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
    not: binaryBoolOp,
    xor: binaryBoolOp,
    cat: withVar(a => withVar(b => createPolyFn([
        [array(a), array(b), array(union([a, b]))],
        [a, array(b), array(union([a, b]))],
        [array(a), b, array(union([a, b]))],
        [a, b, array(union([a, b]))],
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
    time_now: N,
    datetime_fmt: createPolyFn([[N, S], [any(), U]]),
    currency_fmt: createPolyFn([[S, N, union([S, U])], [any(), any(), U]]),
    country_fmt: createPolyFn([[S, union([S, U])], [any(), U]]),
    phone_fmt: createPolyFn([[S, union([S, U])], [any(), U]]),
    id: withVar(a => createPolyFn([[a, a]])),
};
