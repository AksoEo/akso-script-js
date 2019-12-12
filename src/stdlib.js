/// Compares a with b. Will deep-compare objects and arrays and return false for type mismatches.
function eq (a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false;
        return true;
    } else if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        const ka = Object.keys(a);
        const kb = Object.keys(b);
        if (!eq(ka, kb)) return false;
        for (const k of ka) if (!eq(a[k], b[k])) return false;
        return true;
    } else return a === b;
}

/// “mapifies” a function so that it is guaranteed to be callable.
/// also handles lazy parameters
const mapify = f => typeof f === 'function' ? (a => f(() => a)) : (() => f);
/// “flatmapifies” a function so that it is guaranteed to be callable and return an array
const flatmapify = f => {
    const df = mapify(f);
    return a => {
        const res = df(a);
        if (Array.isArray(res) || typeof res === 'string') return res;
        return [res];
    };
};

/// Defines a binary operation taking two parameters which *will* be consumed
function defBin (ty) {
    return function defBinInner (f, z = null) {
        return a => b => {
            const da = a();
            const db = b();
            if (typeof da !== ty) return z;
            if (typeof db !== ty) return z;
            return f(da, db);
        };
    }
}
const defBinMath = defBin('number');
const defBinBin = defBin('boolean');

function defCmp (f) {
    return _a => _b => {
        const a = _a();
        const b = _b();
        if (typeof a === 'string' && typeof b === 'string') return f(a > b ? 1 : a < b ? -1 : 0);
        if (typeof a === 'number' && typeof b === 'number') return f(a - b);
        return false;
    };
}

/// Defines a unary operation taking one parameter that *will* be consumed
function defUn (f, ty, z = null) {
    return a => {
        a = a();
        return typeof a === ty ? f(a) : z;
    };
}
const defUnMath = f => defUn(f, 'number');

function catImpl (a) {
    if (!Array.isArray(a)) return a;
    const isNotAllArrays = a.findIndex(x => !Array.isArray(x)) > -1;
    if (isNotAllArrays) {
        const isNotAllStrings = a.findIndex(x => typeof x !== 'string') > -1;
        if (isNotAllStrings) {
            // heterogenous cat
            return a.join(',');
        } else {
            return a.join('');
        }
    } else {
        return a.flatMap(a => a);
    }
}

const ZERO = Symbol('std::0');
const MIN_INNER_LAMBDA = Symbol('std::min_inner_lambda');
const MAX_INNER_LAMBDA = Symbol('std::max_inner_lambda');
const extras = {
    [ZERO]: { t: 'n', v: 0 },
    // sum = fold (+) 0
    sum: {
        t: 'c',
        f: 'fold',
        a: ['+', ZERO],
    },
    // min = fold1 (\a b -> if (a < b) a b)
    [MIN_INNER_LAMBDA]: {
        t: 'f',
        p: ['a', 'b'],
        b: {
            c: { t: 'c', f: '<', a: ['a', 'b'] },
            '=': { t: 'c', f: 'if', a: ['c', 'a', 'b'] },
        },
    },
    min: {
        t: 'c',
        f: 'fold1',
        a: [MIN_INNER_LAMBDA],
    },
    // max = fold1 (\a b -> if (a > b) a b)
    [MAX_INNER_LAMBDA]: {
        t: 'f',
        p: ['a', 'b'],
        b: {
            c: { t: 'c', f: '>', a: ['a', 'b'] },
            '=': { t: 'c', f: 'if', a: ['c', 'a', 'b'] },
        },
    },
    max: {
        t: 'c',
        f: 'fold1',
        a: [MAX_INNER_LAMBDA],
    },
    // avg a = (sum a) / (length a)
    avg: {
        t: 'f',
        p: ['a'],
        b: {
            s: { t: 'c', f: 'sum', a: ['a'] },
            l: { t: 'c', f: 'length', a: ['a'] },
            '=': { t: 'c', f: '/', a: ['s', 'l'] },
        },
    },
    // med a = let b = sort a, l = length a in
    //     if (l `mod` 2 == 0) {
    //         avg (map (index b) [l / 2 - 1, l / 2])
    //     } {
    //         index b (floor (l / 2))
    //     }
    med: {
        t: 'f',
        p: ['a'],
        b: {
            _1: { t: 'n', v: 1 },
            _2: { t: 'n', v: 2 },
            // if (length is mod 2) (_ifmod2) (_else)
            '=': { t: 'c', f: 'if', a: ['_ismod2', '_ifmod2', '_else'] },
            // length of input
            _l: { t: 'c', f: 'length', a: ['a'] },
            // sorted input
            _b: { t: 'c', f: 'sort', a: ['a'] },
            // length is mod 2?
            _ismod2: { t: 'c', f: '==', a: ['_lmod2', ZERO] },
            // length mod 2
            _lmod2: { t: 'c', f: 'mod', a: ['_l', '_2'] },
            // function that indexes sorted input
            _indexb: { t: 'c', f: 'index', a: ['_b'] },
            // if mod 2, average center values
            _ifmod2: { t: 'c', f: 'avg', a: ['_avgmap'] },
            // map indices to values
            _avgmap: { t: 'c', f: 'map', 'a': ['_indexb', '_avglist'] },
            // indices l/2 - 1 and l/2
            _avglist: { t: 'l', v: ['_l/2-1', '_l/2'] },
            '_l/2': { t: 'c', f: '/', a: ['_l', '_2'] },
            '_l/2-1': { t: 'c', f: '-', 'a': ['_l/2', '_1'] },
            // else index at floor (l / 2)
            _else: { t: 'c', f: '_indexb', a: ['_fl/2'] },
            '_fl/2': { t: 'c', f: 'floor', a: ['_l/2'] },
        },
    },
};

module.exports = {
    '+': defBinMath((a, b) => a + b),
    '-': defBinMath((a, b) => a - b),
    '*': defBinMath((a, b) => a * b),
    '/': defBinMath((a, b) => b === 0 ? 0 : a / b),
    '^': defBinMath((a, b) => a ** b),
    mod: defBinMath((a, b) => {
        if (b === 0) return 0;
        const pa = Math.sign(b) * a;
        const pb = Math.abs(b);
        return ((pa % pb) + pb) % pb;
    }),
    floor: defUnMath(Math.floor),
    ceil: defUnMath(Math.ceil),
    round: defUnMath(Math.round),
    trunc: defUnMath(Math.trunc),
    sign: defUnMath(Math.sign),
    abs: defUnMath(Math.abs),

    '==': a => b => eq(a(), b()),
    '!=': a => b => !eq(a(), b()),
    '>': defCmp(a => a > 0),
    '<': defCmp(a => a < 0),
    '>=': defCmp(a => a >= 0),
    '<=': defCmp(a => a <= 0),
    and: defBinBin((a, b) => a && b, false),
    or: defBinBin((a, b) => a || b, false),
    not: defUn(a => !a, 'boolean', false),
    xor: defBinBin((a, b) => !!(a ^ b), false),

    cat: a => catImpl(a()),
    map: f => a => {
        a = a();
        if (a === null) return null;
        if (a[Symbol.iterator]) {
            // iterable type (string or array)
            const items = [...a];
            if (!items.length) return a;
            const df = mapify(f());
            return items.map(df);
        }
        // not an iterable; just map directly
        return mapify(f())(a);
    },
    flat_map: f => a => {
        a = a();
        if (a === null) return null;
        if (a[Symbol.iterator]) {
            const items = [...a];
            if (!items.length) return a;
            const df = flatmapify(f());
            const mapped = items.map(df);
            return catImpl(mapped);
        }
        const mapped = flatmapify(f())(a);
        const isNotAllStrings = mapped.findIndex(a => typeof a !== 'string') > -1;
        if (isNotAllStrings) return mapped;
        else return mapped.join('');
    },
    fold: f => r => a => {
        a = a();
        if (a === null) return null;
        const df = mapify(f());
        let ac = r();
        if (a[Symbol.iterator]) {
            for (const item of a) ac = mapify(df(ac))(item);
        } else {
            mapify(df(ac))(a);
        }
        return ac;
    },
    fold1: f => a => {
        a = a();
        if (a === null || !a[Symbol.iterator]) return null;
        const items = [...a];
        if (!items.length) return null;
        let ac = items[0];
        const df = mapify(f());
        for (let i = 1; i < items.length; i++) ac = mapify(df(ac))(items[i]);
        return ac;
    },
    filter: f => a => {
        const da = a();
        if (da === null || !da[Symbol.iterator]) return null;
        const items = [...da];
        if (!items.length) return da;
        const df = mapify(f());
        const filtered = items.filter(a => df(a) === true);
        if (typeof da === 'string') {
            // turn it back into a string
            return filtered.join('');
        }
        return filtered;
    },
    index: a => b => {
        const da = a();
        if (typeof da !== 'string' && !Array.isArray(da) || !da.length) return null;
        const db = b();
        if (db === null || typeof db !== 'number' || (db | 0) !== db || db < 0 || db >= da.length) return null;
        return da[db];
    },
    length: a => {
        const da = a();
        if (typeof da !== 'string' && !Array.isArray(da)) return null;
        return da.length;
    },
    contains: a => b => {
        const da = a();
        if (typeof da === 'string') {
            const db = b();
            if (typeof db !== 'string') return false;
            return da.includes(db);
        } else if (Array.isArray(da)) {
            if (!da.length) return false;
            const db = b();
            for (const item of da) {
                if (eq(item, db)) return true;
            }
            return false;
        }
        return false;
    },

    sort: a => {
        const da = a();
        if (da === null || !da[Symbol.iterator]) return null;
        const items = [...da];
        items.sort((a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return a - b;
            if (typeof a === 'string' && typeof b === 'string') return a > b ? 1 : a < b ? -1 : 0;
            return 0;
        });
        if (typeof da === 'string') return items.join('');
        return items;
    },

    // TODO: date stuff

    if: a => b => c => a() === true ? b() : c(),
    // TODO: format_currency
    id: a => a(),

    ...extras,
};
