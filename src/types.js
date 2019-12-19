export const NEVER = Symbol('⊥');
export const NULL = Symbol('null');
export const BOOL = Symbol('bool');
export const NUMBER = Symbol('num');
export const STRING = Symbol('str');
export const ARRAY = Symbol('array');

export function signature (type) {
    if (type === NEVER) return '!';
    else if (type === NULL) return '()';
    else if (type === BOOL) return 'B';
    else if (type === NUMBER) return 'N';
    else if (type === STRING) return 'S';
    else if (type === ARRAY) return '[]';
    else return type.signature;
}

/// Apply a type to another type.
export function apply (recv, arg) {
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

const mergeMaps = maps => new Map(maps.flatMap(map => [...map]));

/// Creates a union of types.
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
        return null;
    }
}

/// A type variable.
let typeVarCounter = 0;
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
        let canDoTautology = true;

        for (const item of this.mapping) {
            const newPre = item.pre.map(p => ({ var: reduce(p.var), match: reduce(p.match) }));
            const newType = reduce(item.type);

            let isTautology = canDoTautology;
            let tautType = newType;
            if (canDoTautology) {
                for (const p of newPre) {
                    if (this.mapping.length > 1 && !isConcrete(p.var)) {
                        canDoTautology = isTautology = false;
                        break;
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
            }

            if (isTautology) {
                return tautType;
            }

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
            return match(subst(this.body, this.binding, ty.binding), ty.body);
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
    [0, 1, b => apply(b(0), b(1))],
]);
const foldType = createFnType([
    // 0 == 2 == 3 in most cases but it doesn’t actually matter for the return type
    [mapFnType, 1, array(mapBinding), b => apply(apply(mapFnType, union([mapBinding, b(1)])), mapBinding)],
    [createFnType([[S, S]]), S, S, S],
    [0, 1, 2, b => apply(apply(b(0), b(1)), b(2))],
]);

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
    format_currency: createFnType([[S, N, union([S, U])], [0, 1, U]]),
    id: createFnType([[0, 0]]),
};
