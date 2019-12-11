function eq (a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.map((x, i) => b[i] === x);
    } else if (typeof a === 'function' && typeof b === 'function') {
        return a === b;
    } else if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        const va = Object.values(a);
        const vb = Object.values(b);
        return eq(Object.keys(a), Object.keys(b)) && va.map((x, i) => vb[i] === x);
    } else return a === b;
}

const mapify = f => typeof f === 'function' ? f : (() => f);
const flatmapify = f => {
    f = mapify(f);
    return a => {
        const res = f(a);
        if (Array.isArray(res)) return res;
        return [res];
    };
};

function isNum (a) {
    return typeof a === 'number';
}
function bothNum (a, b) {
    return isNum(a) && isNum(b);
}
function bothBool (a, b) {
    return typeof a === 'boolean' && typeof b === 'boolean';
}

function fold (f, r, a) {
    f = mapify(f);
    if (Array.isArray(a)) {
        let ac = r;
        for (const item of a) {
            ac = mapify(f(ac))(item);
        }
        return ac;
    } else {
        return mapify(f(r))(item);
    }
}

// TODO: null propagation

function defBin (ty) {
    return function defBinInner (f, z = null) {
        return a => b => {
            a = a();
            b = b();
            if (typeof a !== ty) return z;
            if (typeof b !== ty) return z;
            return f(a, b);
        };
    }
}
const defBinMath = defBin('number');
const defBinBin = defBin('boolean');
function defUn (f, ty, z = null) {
    return a => {
        a = a();
        typeof a === ty ? f(a) : z
    };
}
const defUnMath = f => defUn(f, 'number');

function defBinEager (f) {
    return a => b => f(a(), b());
}

module.exports = evaluate => Object.fromEntries(Object.entries({
    '+': defBinMath((a, b) => a + b),
    '-': defBinMath((a, b) => a - b),
    '*': defBinMath((a, b) => a * b),
    '/': defBinMath((a, b) => b === 0 ? 0 : a / b),
    '^': defBinMath((a, b) => a ** b),
    mod: defBinMath((a, b) => {
        if (!bothNum(a, b)) return null;
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

    '==': a => b => eq(a, b),
    '!=': a => b => !eq(a, b),
    '>': defBinMath((a, b) => a > b, false),
    '<': defBinMath((a, b) => a < b, false),
    '>=': defBinMath((a, b) => a >= b, false),
    '<=': defBinMath((a, b) => a <= b, false),
    and: defBinBin((a, b) => a && b, false),
    or: defBinBin((a, b) => a || b, false),
    not: defUn(a => !a, 'boolean', false),
    xor: defBinBin((a, b) => !!(a ^ b), false),

    // TODO: strings too
    // TODO: don’t use defBinEager
    cat: a => {
        a = a();
        return Array.isArray(a) ? a.find(x => !Array.isArray(x)) ? a.join(',') : a.flatMap(a => a) : a;
    },
    map: defBinEager((f, a) => Array.isArray(a) ? a.map(mapify(f)) : mapify(f)(a)),
    flat_map: defBinEager((f, a) => Array.isArray(a) ? a.flatMap(flatmapify(f)) : flatmapify(f)(a)),
    fold: f => r => a => fold(f(), a(), r()),
    fold1: defBinEager((f, a) => Array.isArray(a) && a.length ? fold(f, a, a[0]) : null),
    filter: defBinEager((f, a) => Array.isArray(a) ? a.filter(i => mapify(f) === true) : mapify(f)(a)),
    index: defBinEager((a, b) => Array.isArray(a) ? b !== null ? ('b' in a) ? a[b] : null : null : null),
    length: a => {
        a = a();
        Array.isArray(a) ? a.length : null
    },
    contains: defBinEager((a, b) => Array.isArray(a) ? a.includes(b) : false),

    // TODO: convenience functions
    // TODO: date stuff

    if: a => b => c => a() === true ? b() : c(),
    // TODO: format_currency
    id: a => a(),
}).map(([n, f]) => [n, { t: 'f', b: f }]));
