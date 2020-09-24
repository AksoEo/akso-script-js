function assert (cond, err) {
    if (!cond) throw new Error('Assertion failed: ' + err);
}
function ss (s) {
    if (typeof s === 'symbol') return s.toString();
    else if (Array.isArray(s)) {
        return '[' + s.map(ss).join(',') + ']';
    } else if (typeof s === 'object' && s !== null) {
        return s.constructor.name + '{' + Object.entries(s).map(([k, v]) => ss(k) + ':' + ss(v)).join(',') + '}';
    } else return '' + s;
}
function assertEq (a, b, msgParent) {
    let msg = `${ss(a)} == ${ss(b)}`;
    if (msgParent) msg = `${msg} (in ${msgParent})`;
    if (typeof b === 'object' && b !== null) {
        if (Array.isArray(b)) {
            assertEq(a.length, b.length, 'array length of ' + msg);
            for (let i = 0; i < b.length; i++) {
                assertEq(a[i], b[i], msg);
            }
        } else {
            for (let k in b) {
                assertEq(a[k], b[k], msg);
            }
            for (let k in a) {
                assertEq(a[k], b[k], msg);
            }
        }
    } else {
        assert(a == b, msg);
    }
}

function assertThrows (f, msg) {
    let err;
    try {
        f();
        err = new Error('Assertion failed: ' + msg);
    } catch (err) {
        // ok
    }
    if (err) throw err;
}

module.exports = { assert, assertEq, assertThrows };
