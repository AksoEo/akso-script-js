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
    f = mapify(f);
    return a => {
        const res = f(a);
        if (Array.isArray(res) || typeof res === 'string') return res;
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

// TODO: null propagation

/// Defines a binary operation taking two parameters which *will* be consumed
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

/// Defines a unary operation taking one parameter that *will* be consumed
function defUn (f, ty, z = null) {
    return a => {
        a = a();
        return typeof a === ty ? f(a) : z;
    };
}
const defUnMath = f => defUn(f, 'number');

function defBinEager (f) {
    return a => b => f(a(), b());
}

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
    '>': defBinMath((a, b) => a > b, false),
    '<': defBinMath((a, b) => a < b, false),
    '>=': defBinMath((a, b) => a >= b, false),
    '<=': defBinMath((a, b) => a <= b, false),
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
            f = mapify(f());
            return items.map(f);
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
            f = flatmapify(f());
            const mapped = items.map(f);
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
        f = mapify(f());
        let ac = r();
        if (a[Symbol.iterator]) {
            for (const item of a) ac = mapify(f(ac))(item);
        } else {
            mapify(f(ac))(a);
        }
        return ac;
    },
    fold1: f => a => {
        a = a();
        if (a === null || !a[Symbol.iterator]) return null;
        const items = [...a];
        if (!items.length) return null;
        let ac = items[0];
        f = mapify(f());
        for (let i = 1; i < items.length; i++) ac = mapify(f(ac))(items[i]);
        return ac;
    },
    filter: f => a => {
        a = a();
        if (a === null || !a[Symbol.iterator]) return null;
        const items = [...a];
        if (!items.length) return a;
        f = mapify(f());
        const filtered = items.filter(a => f(a) === true);
        if (typeof a === 'string') {
            // turn it back into a string
            return filtered.join('');
        }
        return filtered;
    },
    index: a => b => {
        a = a();
        if (typeof a !== 'string' && !Array.isArray(a) || !a.length) return null;
        b = b();
        if (b === null || typeof b !== 'number' || (b | 0) !== b || b < 0 || b >= a.length) return null;
        return a[b];
    },
    length: a => {
        a = a();
        if (typeof a !== 'string' && !Array.isArray(a)) return null;
        return a.length;
    },
    contains: a => b => {
        a = a();
        if (typeof a === 'string') {
            b = b();
            if (typeof b !== 'string') return false;
            return a.includes(b);
        } else if (Array.isArray(a)) {
            if (!a.length) return false;
            b = b();
            for (const item of a) {
                if (eq(item, b)) return true;
            }
            return false;
        }
        return false;
    },

    // TODO: convenience functions
    // TODO: date stuff

    if: a => b => c => a() === true ? b() : c(),
    // TODO: format_currency
    id: a => a(),
};
