function assert (cond, err) {
    if (!cond) throw new Error('Assertion failed: ' + err);
}
function assertEq (a, b, msgParent) {
    let msg = `${a} == ${b}`;
    if (msgParent) msg = `${msg} (in ${msgParent})`;
    if (typeof b === 'object') {
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

module.exports = { assert, assertEq };
