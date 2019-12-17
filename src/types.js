/// Any type
export class TopType {
    get signature () {
        return '*';
    }
    eq (ty) {
        return ty.signature === this.signature;
    }
    fnmap () {
        return this;
    }
}
/// A union type
export class UnionType extends TopType {
    constructor (types) {
        super();
        this.types = types;
        this.normalize();
    }
    fnmap (ty) {
        const union = this.types.map(t => t.fnmap(ty));
        if (union.isConcrete) return union.types[0];
        return new UnionType(union);
    }
    normalize () {
        let i = 1;
        while (i < this.types.length) {
            const a = this.types[i - 1];
            const b = this.types[i];
            if (a.eq(b)) {
                this.types.splice(i, 1);
                i--;
            }
            i++;
        }
        this.types.sort((a, b) => {
            const sa = a.signature;
            const sb = b.signature;
            return sa > sb ? 1 : sa < sb ? -1 : 0;
        });
    }
    get isConcrete () {
        return this.types.length === 1;
    }
    get signature () {
        return '(' + this.types.map(type => type.signature).join('|') + ')';
    }
}
/// A concrete type.
///
/// `param` and `ret` may be null, strings (for type variables), or types.
export class ConcreteType extends TopType {
    constructor (type, param = null, ret = null) {
        super();
        this.type = type;
        this.param = param;
        this.return = ret;
    }
    get signature () {
        if (this.type === ConcreteType.types.FUNC) {
            return '(' + this.param.signature + ' -> ' + this.return.signature + ')';
        }
        return this.param
            ? '(' + this.type + ' ' + this.param.signature + ')'
            : this.type;
    }
    fnmap (ty) {
        if (this.type === ConcreteType.types.FUNC) {
            if (!this.param.eq(ty)) return new TopType(); // UB
            else return this.return;
        }
        return this.type;
    }
}

ConcreteType.types = {
    NULL: 'null',
    BOOL: 'boolean',
    NUMBER: 'number',
    STRING: 'string',
    ARRAY: 'array',
    FUNC: 'function',
};

// TODO: type variables

const createFnType = (args, ret) => {
    let t = ret;
    for (let i = args.length - 1; i >= 0; i--) {
        t = new ConcreteType(ConcreteType.types.FUNC, args[i], t);
    }
    return t;
};

const TOP = new TopType();
const B = new ConcreteType(ConcreteType.types.BOOL);
const N = new ConcreteType(ConcreteType.types.NUMBER);
const S = new ConcreteType(ConcreteType.types.STRING);
const Func = new UnionType([
    new ConcreteType(ConcreteType.types.STRING),
    new ConcreteType(ConcreteType.types.ARRAY, new TopType()),
]);

const binaryMathOp = createFnType([N, N], N);
const unaryMathOp = createFnType([N], N);

const mathCmpOp = createFnType([N, N], B);
const binaryBoolOp = createFnType([B, B], B);

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

    '==': createFnType([TOP, TOP], B),
    '!=': createFnType([TOP, TOP], B),
    '>': mathCmpOp,
    '<': mathCmpOp,
    '>=': mathCmpOp,
    '<=': mathCmpOp,
    and: binaryBoolOp,
    or: binaryBoolOp,
    not: binaryBoolOp,
    xor: binaryBoolOp,
    cat: createFnType([Func], Func),
    map: createFnType([createFnType([TOP], TOP), Func], Func),
    flat_map: createFnType([createFnType([TOP], TOP), Func], Func),
    fold: createFnType([createFnType([TOP], TOP), TOP, Func], Func),
    fold1: createFnType([createFnType([TOP], TOP), Func], Func),
    filter: createFnType([createFnType([TOP], TOP), Func], Func),
    index: createFnType([Func, N], Func),
    length: createFnType([Func], N),
    contains: createFnType([Func, TOP], B),
    sort: createFnType([Func], Func),
    sum: createFnType([Func], N),
    min: createFnType([Func], N),
    max: createFnType([Func], N),
    avg: createFnType([Func], N),
    med: createFnType([Func], N),
    date_sub: createFnType([S, S], S),
    date_add: createFnType([S, S], S),
    date_today: S,
    date_fmt: createFnType([S], S),
    time_now: N,
    datetime_fmt: createFnType([N], S),
    if: createFnType([B, TOP, TOP], TOP),
    format_currency: createFnType([S, N], S),
    id: createFnType([TOP], TOP),
};
