import { VMFun, NVMFun } from './vmfun';

// Maps currencies to their smallest unit multiplier
export const currencies = {
    USD: 100,
    AUD: 100,
    CAD: 100,
    CHF: 100,
    DKK: 100,
    EUR: 100,
    GBP: 100,
    HKD: 100,
    JPY: 1,
    MXN: 100,
    MYR: 100,
    NOK: 100,
    NZD: 100,
    PLN: 100,
    SEK: 100,
    SGD: 100,
};

const months = [
    'januaro',
    'februaro',
    'marto',
    'aprilo',
    'majo',
    'junio',
    'julio',
    'aŭgusto',
    'septembro',
    'oktobro',
    'novembro',
    'decembro',
];

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

/// “mapifies” a value so that it is guaranteed to be callable.
/// also handles lazy parameters
const mapify = f => (typeof f ===  'function' || f instanceof VMFun)
    ? (...args) => f.apply(null, args)
    : ((_) => f);
/// “flatmapifies” a value so that it is guaranteed to be callable and return an array
const flatmapify = f => {
    const df = mapify(f);
    return a => {
        const res = df(a);
        if (Array.isArray(res) || typeof res === 'string') return res;
        return [res];
    };
};

/// Defines a binary operation taking two parameters
function defBin (ty) {
    return function defBinInner (f, z = null) {
        return (a, b) => {
            if (typeof a !== ty) return z;
            if (typeof b !== ty) return z;
            return f(a, b);
        };
    }
}
const defBinMath = defBin('number');
const defBinBin = defBin('boolean');

function defCmp (f) {
    return (a, b) => {
        if (typeof a === 'string' && typeof b === 'string') return f(a > b ? 1 : a < b ? -1 : 0);
        if (typeof a === 'number' && typeof b === 'number') return f(a - b);
        return false;
    };
}

/// Defines a unary operation taking one parameter
function defUn (f, ty, z = null) {
    return a => typeof a === ty ? f(a) : z;
}
const defUnMath = f => defUn(f, 'number');

function stringify(value) {
    if (value === null) return '';
    if (value === false) return 'ne';
    if (value === true) return 'jes';
    if (value instanceof Date) return formatDate(value);
    if (Array.isArray(value)) return value.map(stringify).join(', ');
    return value.toString();
}

function concatenate (a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
        // if one of them is an array, turn it into arrays
        if (Array.isArray(a)) void 0;
        else if (typeof a === 'string') a = a.split('');
        else a = [a];
        if (Array.isArray(b)) void 0;
        else if (typeof b === 'string') b = b.split('');
        else b = [b];
        return a.concat(b);
    }
    // otherwise, strings
    a = stringify(a);
    b = stringify(b);
    return a + b;
}

export const stdlibExt = {
    getCountryName: null,
    formatCurrency: null,
    libphonenumber: null,
};

const extras = {
    // sum a = fold (+) 0 a
    sum: {
        t: 'f',
        p: ['a'],
        b: {
            _0: { t: 'n', v: 0 },
            '=': {
                t: 'c',
                f: 'fold',
                a: ['+', '_0', 'a'],
            },
        }
    },
    // min a = fold1 (\a b -> if (a < b) a b) a
    min: {
        t: 'f',
        p: ['a'],
        b: {
            'm': {
                t: 'f',
                p: ['a', 'b'],
                b: {
                    c: { t: 'c', f: '<', a: ['a', 'b'] },
                    '=': { t: 'w', m: [{ c: 'c', v: 'a' }, { v: 'b' }] },
                },
            },
            '=': {
                t: 'c',
                f: 'fold1',
                a: ['m', 'a'],
            },
        },
    },
    // max a = fold1 (\a b -> if (a > b) a b) a
    max: {
        t: 'f',
        p: ['a'],
        b: {
            'm': {
                t: 'f',
                p: ['a', 'b'],
                b: {
                    c: { t: 'c', f: '>', a: ['a', 'b'] },
                    '=': { t: 'w', m: [{ c: 'c', v: 'a' }, { v: 'b' }] },
                },
            },
            '=': {
                t: 'c',
                f: 'fold1',
                a: ['m', 'a'],
            },
        },
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
            _0: { t: 'n', v: 0 },
            _1: { t: 'n', v: 1 },
            _2: { t: 'n', v: 2 },
            // if (length is mod 2) (_ifmod2) (_else)
            '=': { t: 'w', m: [{ c: '_ismod2', v: '_ifmod2' }, { v: '_else' }] },
            // length of input
            _l: { t: 'c', f: 'length', a: ['a'] },
            // sorted input
            _b: { t: 'c', f: 'sort', a: ['a'] },
            // length is mod 2?
            _ismod2: { t: 'c', f: '==', a: ['_lmod2', '_0'] },
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

const nvmify = a => {
    const out = {};
    for (const k in a) {
        if (typeof a[k] === 'function') out[k] = new NVMFun(a[k], k);
        else out[k] = a[k];
    }
    return out;
};

export const stdlib = nvmify({
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

    '==': (a, b) => eq(a, b),
    '!=': (a, b) => !eq(a, b),
    '>': defCmp(a => a > 0),
    '<': defCmp(a => a < 0),
    '>=': defCmp(a => a >= 0),
    '<=': defCmp(a => a <= 0),
    and: defBinBin((a, b) => a && b, false),
    or: defBinBin((a, b) => a || b, false),
    not: defUn(a => !a, 'boolean', false),
    xor: defBinBin((a, b) => !!(a ^ b), false),

    '++': (a, b) => concatenate(a, b),
    map: (f, a) => {
        if (a === null) return null;
        if (a[Symbol.iterator]) {
            // iterable type (string or array)
            const items = [...a];
            if (!items.length) return a;
            const df = mapify(f);
            return items.map(item => df(item));
        }
        // not an iterable; just map directly
        return mapify(f)(a);
    },
    flat_map: (f, a) => {
        if (a === null) return null;
        if (a[Symbol.iterator]) {
            const items = [...a];
            if (!items.length) return a;
            const df = flatmapify(f);
            const mapped = items.map(item => df(item));
            return mapped.length
                ? mapped.reduce(concatenate)
                : typeof a === 'string' ? '' : [];
        }
        const mapped = flatmapify(f)(a);
        return mapped.length
            ? mapped.reduce(concatenate)
            : typeof a === 'string' ? '' : [];
    },
    fold: (f, r, a) => {
        if (a === null) return null;
        const df = mapify(f);
        let ac = r;
        if (a[Symbol.iterator]) {
            for (const item of a) ac = df(ac, item);
        } else {
            ac = df(ac, a);
        }
        return ac;
    },
    fold1: (f, a) => {
        if (a === null || !a[Symbol.iterator]) return null;
        const items = [...a];
        if (!items.length) return null;
        const df = mapify(f);
        let ac = items[0];
        for (let i = 1; i < items.length; i++) ac = df(ac, items[i]);
        return ac;
    },
    filter: (f, a) => {
        if (a === null || !a[Symbol.iterator]) return null;
        const items = [...a];
        if (!items.length) return a;
        const df = mapify(f);
        const filtered = items.filter(a => df(a) === true);
        if (typeof a === 'string') {
            // turn it back into a string
            return filtered.join('');
        }
        return filtered;
    },
    index: (a, b) => {
        if (typeof a !== 'string' && !Array.isArray(a) || !a.length) return null;
        if (b === null || typeof b !== 'number' || (b | 0) !== b || b < 0 || b >= a.length) return null;
        return a[b];
    },
    find_index: (a, b) => {
        if (typeof a !== 'string' && !Array.isArray(a) || !a.length) return null;
        let index;
        if (typeof b === 'object') {
            // needs complex ==
            index = -1;
            for (let i = 0; i < a.length; i++) {
                if (eq(a[i], b)) {
                    index = i;
                    break;
                }
            }
        } else {
            // we can use javascript ==
            index = a.indexOf(b);
        }
        if (index === -1) return null;
        return index;
    },
    length: a => {
        if (typeof a !== 'string' && !Array.isArray(a)) return null;
        return a.length;
    },
    contains: (a, b) => {
        if (typeof a === 'string') {
            if (typeof b !== 'string') return false;
            return a.includes(b);
        } else if (Array.isArray(a)) {
            if (!a.length) return false;
            for (const item of a) {
                if (eq(item, b)) return true;
            }
            return false;
        }
        return false;
    },
    head: (a, b) => {
        if (a === null || !a[Symbol.iterator]) return null;
        if (typeof b !== 'number') return null;
        const items = [...a];
        items.splice(b);
        if (typeof a === 'string') return items.join('');
        return items;
    },
    tail: (a, b) => {
        if (a === null || !a[Symbol.iterator]) return null;
        if (typeof b !== 'number') return null;
        let items = [...a];
        items = items.splice(b);
        if (typeof a === 'string') return items.join('');
        return items;
    },

    sort: a => {
        if (a === null || !a[Symbol.iterator]) return null;
        const items = [...a];
        items.sort((a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return a - b;
            if (typeof a === 'string' && typeof b === 'string') return a > b ? 1 : a < b ? -1 : 0;
            return 0;
        });
        if (typeof a === 'string') return items.join('');
        return items;
    },

    date_sub: (t, a, b) => {
        if (t !== 'years' && t !== 'months' && t !== 'weeks' && t !== 'days') return null;
        const da = parseDateString(a);
        const db = parseDateString(b);
        if (da === null || db === null) return null;
        if (t === 'years') return subMonths(da, db) / 12;
        else if (t === 'months') return subMonths(da, db);
        else if (t === 'weeks') return (da - db) / (1000 * 86400 * 7);
        else if (t === 'days') return (da - db) / (1000 * 86400);
    },
    date_add: (t, a, b) => {
        if (t !== 'years' && t !== 'months' && t !== 'weeks' && t !== 'days') return null;
        const da = parseDateString(a);
        if (da === null) return null;
        if (typeof b !== 'number') return null;
        if (t === 'years') da.setFullYear(da.getFullYear() + b);
        else if (t === 'months') da.setMonth(da.getMonth() + b);
        else if (t === 'weeks') da.setDate(da.getDate() + b * 7);
        else if (t === 'days') da.setDate(da.getDate() + b);
        return dateToString(da);
    },
    date_get: (t, a) => {
        const da = parseDateString(a);
        if (da === null) return null;
        if (t === 'y') return da.getFullYear();
        else if (t === 'M') return da.getMonth() + 1;
        else if (t === 'd') return da.getDate();
        return null;
    },
    date_set: (t, a, b) => {
        if (t !== 'y' && t !== 'M' && t !== 'd') return null;
        const da = parseDateString(a);
        if (da === null) return null;
        if (t === 'y') da.setFullYear(b);
        else if (t === 'M') da.setMonth(b - 1);
        else if (t === 'd') da.setDate(b);
        return dateToString(da);
    },
    get date_today () {
        return { t: 's', v: dateToString(new Date()) };
    },
    date_fmt: a => {
        const da = parseDateString(a);
        if (da === null) return null;
        return formatDate(da);
    },
    ts_now: () => {
        return new Date();
    },
    tz_utc: { t: 'n', v: 0 },
    tz_local: () => new Date().getTimezoneOffset(),
    ts_from_unix: (a) => {
        if (typeof a !== 'number') return null;
        return new Date(Math.floor(a * 1000));
    },
    ts_to_unix: (a) => {
        if (!a || !(a instanceof Date)) return null;
        return Math.floor(a.getTime() / 1000);
    },
    ts_from_date: (a, tz, h, m, s) => {
        if (typeof tz !== 'number' || typeof h !== 'number' || typeof m !== 'number' || typeof s !== 'number') return null;
        if (parseDateString(a) === null) return null;

        const da = new Date(`${a}T00:00:00${timezoneOffsetString(tz)}`);
        da.setHours(da.getHours() + h);
        da.setMinutes(da.getMinutes() + m);
        da.setSeconds(da.getSeconds() + s);
        return da;
    },
    ts_to_date: (a, tz) => {
        if (!a || !(a instanceof Date) || typeof tz !== 'number') return null;
        // add the time zone offset to a such that we're basically rotating the desired time zone
        // to UTC
        const da = new Date(+a + tz * 60000);
        return da.toISOString().split('T')[0];
    },
    ts_parse: (a) => {
        if (typeof a !== 'string') return null;
        const da = new Date(a);
        if (!Number.isFinite(da.getFullYear())) return null;
        return da;
    },
    ts_to_string: (a) => {
        if (!a || !(a instanceof Date)) return null;
        return a.toISOString();
    },
    ts_fmt: a => {
        if (!a || !(a instanceof Date)) return null;
        return formatDate(a) + ' ' + formatTime(a);
    },
    ts_add: (t, a, b) => {
        if (!'smhdwMy'.includes(t) || !a || !(a instanceof Date) || typeof b !== 'number') return null;
        const da = new Date(a);
        if (t === 's') da.setSeconds(da.getSeconds() + b);
        if (t === 'm') da.setMinutes(da.getMinutes() + b);
        if (t === 'h') da.setHours(da.getHours() + b);
        if (t === 'd') da.setDate(da.getDate() + b);
        if (t === 'w') da.setDate(da.getDate() + b * 7);
        if (t === 'M') da.setMonth(da.getMonth() + b);
        if (t === 'y') da.setFullYear(da.getFullYear() + b);
        return da;
    },
    ts_sub: (t, a, b) => {
        if (!'smhdwMy'.includes(t) || !a || !(a instanceof Date) || !b || !(b instanceof Date)) return null;
        if (t === 's') return (a - b) / 1000;
        if (t === 'm') return (a - b) / (60 * 1000);
        if (t === 'h') return (a - b) / (3600 * 1000);
        if (t === 'd') return (a - b) / (86400 * 1000);
        if (t === 'w') return (a - b) / (7 * 86400 * 1000);
        if (t === 'M') return subMonths(a, b);
        if (t === 'y') return subMonths(a, b) / 12;
    },
    ts_get: (t, tz, a) => {
        if (!'smhdMy'.includes(t) || !a || !(a instanceof Date) || typeof tz !== 'number') return null;
        // add the time zone offset to a such that we're basically rotating the desired time zone
        // to UTC
        const da = new Date(+a + tz * 60000);
        if (t === 's') return da.getUTCSeconds();
        if (t === 'm') return da.getUTCMinutes();
        if (t === 'h') return da.getUTCHours();
        if (t === 'd') return da.getUTCDate();
        if (t === 'M') return da.getUTCMonth() + 1;
        if (t === 'y') return da.getUTCFullYear();
        return null;
    },
    ts_set: (t, tz, a, b) => {
        if (!'smhdMy'.includes(t) || !a || !(a instanceof Date) || typeof tz !== 'number' || typeof b !== 'number') return null;
        // add the time zone offset to a such that we're basically rotating the desired time zone
        // to UTC
        const da = new Date(+a + tz * 60000);
        if (t === 's') da.setUTCSeconds(b);
        if (t === 'm') da.setUTCMinutes(b);
        if (t === 'h') da.setUTCHours(b);
        if (t === 'd') da.setUTCDate(b);
        if (t === 'M') da.setUTCMonth(b - 1);
        if (t === 'y') da.setUTCFullYear(b);
        // rotate back
        return new Date(+da - tz * 60000);
    },

    currency_fmt: (a, b) => {
        if (!(a in currencies)) return null;
        if (typeof b !== 'number') return null;
        const number = b / currencies[a];
        const minFractionDigits = Math.floor(Math.log10(currencies[a]));
        if (stdlibExt.formatCurrency) return stdlibExt.formatCurrency(a, b, number);
        return number.toLocaleString('fr-FR', {
            style: 'currency',
            currency: a,
            currencyDisplay: 'code',
            minimumFractionDigits: minFractionDigits,
        });
    },
    country_fmt: a => {
        if (typeof a !== 'string') return null;
        if (!a.match(/^[a-z]{2}$/i)) return null;
        if (!stdlibExt.getCountryName) return null;
        return stdlibExt.getCountryName(a);
    },
    phone_fmt: a => {
        if (typeof a !== 'string') return null;
        if (!stdlibExt.libphonenumber) return null;
        try {
            const phoneUtil = stdlibExt.libphonenumber.PhoneNumberUtil.getInstance();
            const number = phoneUtil.parse(a);
            return phoneUtil.format(number, stdlibExt.libphonenumber.PhoneNumberFormat.INTERNATIONAL);
        } catch {
            return null;
        }
    },
    id: a => a,

    ...extras,
});

function parseDateString (s) {
    if (typeof s !== 'string') return null;
    const match = s.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!match) return null;
    return new Date(s);
}

function padz (s, n) {
    return (s + n).substr(-s.length);
}
function dateToString (d) {
    return padz('0000', d.getUTCFullYear()) + '-' + padz('00', d.getUTCMonth() + 1) + '-' + padz('00', d.getUTCDate());
}

function timezoneOffsetString (tz) {
    tz = Math.round(tz % (12 * 60));
    if (!tz) return 'Z';
    const sign = tz > 0 ? '+' : '-';
    const atz = Math.abs(tz);
    const hours = Math.floor(atz / 60);
    const minutes = Math.floor(atz % 60);
    return sign + padz('00', hours) + padz('00', minutes);
}

function daysInMonth (year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function subMonths (a, b) {
    let delta = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
    const offsetB = new Date(b);
    offsetB.setMonth(offsetB.getMonth() + delta);

    if (a > offsetB) {
        // inside month: offsetB ----- a ----> time
        // need to add a->date - offsetB->date but normalized to the month
        const dayDiff = a.getDate() - offsetB.getDate();
        const totalDays = daysInMonth(a.getFullYear(), a.getMonth());
        delta += dayDiff / totalDays;
    } else {
        // inside month: a ----- offsetB ----> time
        // need to subtract offsetB->date - a->date but normalized to the month
        const dayDiff = offsetB.getDate() - a.getDate();
        const totalDays = daysInMonth(a.getFullYear(), a.getMonth());
        delta -= dayDiff / totalDays;
    }

    return delta;
}

function formatDate (d) {
    return d.getUTCDate() + '-a de ' + months[d.getUTCMonth()] + ', ' + d.getUTCFullYear();
}
function formatTime (date) {
    return padz('00', date.getUTCHours()) + ':' + padz('00', date.getUTCMinutes());
}
