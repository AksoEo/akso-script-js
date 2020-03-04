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
    else if (type === BOOL) return 'B';
    else if (type === NUMBER) return 'N';
    else if (type === STRING) return 'S';
    else if (type === ARRAY) return '[]';
    else return type.signature;
}

/// Applies a type to another type. May create a reducible type.
export function apply (recv, arg) {
    if (recv === NEVER) return NEVER;
    if (typeof recv === 'symbol') return new AppliedType(recv, arg, SECRET);
    return recv.apply(arg);
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
    if (typeof pattern === 'symbol') return type === pattern ? new Map() : null;
    return pattern.match(type);
}

/// Returns whether the given type is a concrete type.
export function isConcrete (type) {
    if (typeof type === 'symbol') return true;
    return type.isConcrete;
}

/// Resolves all instances of the given unresolved type with the given partially resolved type.
export function resolve (type, unresolved, resolved) {
    // inner resolved type where the unresolved type is replaced with NEVER
    const innerResolved = reduce(subst(resolved, unresolved, NEVER));
    // return new type where the unresolved items are replaced with the inner resolved type
    return reduce(subst(type, unresolved, innerResolved));
}

/// Returns true if an expression of the given type will always halt.
/// Returns false if an expression of the given type will never halt.
/// Returns null if it *might* halt.
export function doesHalt (type) {
    if (type === NEVER) return false;
    if (typeof type === 'symbol') return true;
    return type.doesHalt;
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
    return apply(ARRAY, type);
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
        return null;
    }
    subst (k, v) {
        return k === this ? v : this;
    }
    apply (ty) {
        return new AppliedType(this, ty, SECRET);
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
    constructor (recv, arg, secret) {
        if (secret !== SECRET) console.trace('Warning: private constructor; use apply()');
        this.recv = recv;
        this.arg = arg;
    }
    get signature () {
        return '(' + signature(this.recv) + ' ' + signature(this.arg) + ')';
    }
    get isConcrete () {
        return isConcrete(this.recv) && isConcrete(this.arg);
    }
    get doesHalt () {
        const a = doesHalt(this.recv);
        const b = doesHalt(this.arg);
        if (a === false || b === false) return false;
        if (a === null || b === null) return null;
        return true;
    }
    subst (k, v) {
        return apply(subst(this.recv, k, v), subst(this.arg, k, v));
    }
    apply (ty) {
        return new AppliedType(this, ty, SECRET);
    }
    reduce () {
        const arg = reduce(this.arg);
        const recv = reduce(this.recv);
        return apply(recv, arg);
    }
    match (ty) {
        if (ty instanceof AppliedType) {
            const recvMatch = match(this.recv, ty.recv);
            const argMatch = match(this.arg, ty.arg);
            if (recvMatch && argMatch) return mergeMaps([recvMatch, argMatch]);
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
    apply (ty) {
        const newMapping = [];
        for (const item of this.mapping) {
            newMapping.push({
                pre: item.pre,
                type: apply(item.type, ty),
            });
        }
        return new CondType(newMapping);
    }
    reduce () {
        const newMapping = [];
        let canReturnTautology = true;

        for (const item of this.mapping) {
            let newPre = item.pre.map(p => ({ var: reduce(p.var), match: reduce(p.match) }));
            const newType = reduce(item.type);

            let isTautology = true;
            let nextCanReturnTautology = true;
            let tautType = newType;
            for (const p of newPre) {
                if (this.mapping.length > 1 && !isConcrete(p.var)) {
                    nextCanReturnTautology = false;
                }
                const m = match(p.match, p.var);
                if (!m) {
                    isTautology = false;
                    break;
                }
                for (const [k, v] of m) {
                    tautType = subst(tautType, k, v);
                }
            }

            if (canReturnTautology && isTautology) {
                return tautType;
            } else if (isTautology) {
                const t = new TypeVar();
                newPre = [{ var: t, match: t }];
            }
            canReturnTautology = nextCanReturnTautology;

            if (newType instanceof CondType) {
                for (const item of newType.mapping) {
                    newMapping.push({
                        pre: newPre.concat(item.pre),
                        type: item.type,
                    })
                }
            } else {
                newMapping.push({
                    pre: newPre,
                    type: newType,
                });
            }
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

/// The type of a function. Has one argument binding.
export class FuncType {
    constructor (binding, body) {
        this.binding = binding;
        this.body = body;
    }
    get signature () {
        return '(λ' + signature(this.binding) + '.' + signature(this.body) + ')';
    }
    get isConcrete () {
        return isConcrete(subst(this.body, this.binding, NEVER));
    }
    get doesHalt () {
        return doesHalt(this.body);
    }
    subst (k, v) {
        return new FuncType(this.binding, subst(this.body, k, v));
    }
    apply (ty) {
        return subst(this.body, this.binding, ty);
    }
    reduce () {
        return new FuncType(this.binding, reduce(this.body));
    }
    match (ty) {
        if (ty instanceof FuncType) {
            const m = match(subst(this.body, this.binding, ty.binding), ty.body);
            if (m) m.set(this.binding, ty.binding);
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

const createFnType = (mappings, bindings, bindingIndex = 0) => {
    if (!bindings) {
        bindings = mappings[0].map((_, i) => new TypeVar());
    }

    if (mappings[0].length === 1) {
        return union(mappings.map(mapping => {
            if (typeof mapping[0] === 'number') return bindings[mapping[0]];
            else if (typeof mapping[0] === 'function') return mapping[0](i => bindings[i]);
            return mapping[0];
        }).flatMap(x => x));
    }

    const types = [];
    const currentBinding = bindings[bindingIndex];
    for (const mapping of mappings) {
        let m;
        if (typeof mapping[0] === 'number') m = bindings[mapping[0]];
        else if (typeof mapping[0] === 'function') m = mapping[0](i => bindings[i]);
        else m = mapping[0];

        const index = types.findIndex(x => signature(x[0]) === signature(m));
        if (index >= 0) types[index][1].push(mapping.slice(1));
        else types.push([[{ var: currentBinding, match: m }], [mapping.slice(1)]]);
    }

    return new FuncType(currentBinding, new CondType(types.map(([ty, rest]) => {
        return { pre: ty, type: createFnType(rest, bindings, bindingIndex + 1) };
    })));
};

const U = NULL;
const B = BOOL;
const N = NUMBER;
const S = STRING;

const binaryMathOp = createFnType([[N, N, N], [0, 1, U]]);
const unaryMathOp = createFnType([[N, N], [0, U]]);

const mathCmpOp = createFnType([[0, 1, B]]);
const binaryBoolOp = createFnType([[0, 1, B]]);

const mapFnType = createFnType([[new TypeVar(), new TypeVar()]]);

const mapBinding = new TypeVar();
const mapType = createFnType([
    // FIXME: needs scoped vars bc map . map will break
    [mapFnType, array(mapBinding), array(apply(mapFnType, mapBinding))],
    [createFnType([[S, S]]), S, S],
    [0, array(mapBinding), b => apply(b(0), mapBinding)],
    [0, S, b => apply(b(0), S)],
    [0, 1, b => apply(b(0), b(1))],
]);
const foldType = createFnType([
    // 0 == 2 == 3 in most cases but it doesn’t actually matter for the return type
    [mapFnType, 1, array(mapBinding), b => apply(apply(mapFnType, union([mapBinding, b(1)])), mapBinding)],
    [createFnType([[S, S]]), S, S, S],
    [0, 1, array(mapBinding), b => apply(apply(b(0), union([mapBinding, b(1)])), mapBinding)],
    [0, 1, 2, b => apply(apply(b(0), b(1)), b(2))],
]);

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

    '==': createFnType([[0, 1, B]]),
    '!=': createFnType([[0, 1, B]]),
    '>': mathCmpOp,
    '<': mathCmpOp,
    '>=': mathCmpOp,
    '<=': mathCmpOp,
    and: binaryBoolOp,
    or: binaryBoolOp,
    not: binaryBoolOp,
    xor: binaryBoolOp,
    cat: createFnType([
        [array(S), S],
        [array(array(mapBinding)), array(mapBinding)],
        [0, S],
    ]),
    map: mapType,
    flat_map: mapType,
    fold: foldType,
    fold1: mapType,
    filter: mapType,
    index: createFnType([
        [array(mapBinding), N, union([U, mapBinding])],
        [S, N, union([U, S])],
        [0, 1, U],
    ]),
    length: createFnType([
        [array(mapBinding), N],
        [S, N],
        [0, U],
    ]),
    contains: createFnType([[0, 1, B]]),
    sort: createFnType([
        [array(mapBinding), array(mapBinding)],
        [S, S],
        [0, U],
    ]),
    sum: createFnType([[array(N), N], [0, U]]),
    min: createFnType([[array(N), N], [0, U]]),
    max: createFnType([[array(N), N], [0, U]]),
    avg: createFnType([[array(N), N], [0, U]]),
    med: createFnType([[array(N), N], [0, U]]),
    date_sub: createFnType([[S, S, S, union([S, U])], [0, 1, 2, U]]),
    date_add: createFnType([[S, S, N, union([S, U])], [0, 1, 2, U]]),
    date_today: S,
    date_fmt: createFnType([[S, union([S, U])], [0, U]]),
    time_now: N,
    datetime_fmt: createFnType([[N, S], [0, U]]),
    if: createFnType([[B, 1, 2, b => union([b(1), b(2)])], [0, 1, 2, 2]]),
    currency_fmt: createFnType([[S, N, union([S, U])], [0, 1, U]]),
    country_fmt: createFnType([[S, union([S, U])], [0, U]]),
    phone_fmt: createFnType([[S, union([S, U])], [0, U]]),
    id: createFnType([[0, 0]]),
};
