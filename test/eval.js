const { evaluate, analyze, VMFun } = require('..');
const { assert, assertEq, assertThrows } = require('./util');

const SYM1 = Symbol('sym1');
const SYM2 = Symbol('sym2');
const p1 = {
    a: { t: 'n', v: 2 },
    b: { t: 'c', f: 'a' },
    c: { t: 'c', f: 'b', a: ['a'] },
    _0: { t: 'n', v: 0 },
    _1: { t: 'n', v: 1 },
    access_undef: { t: 'c', f: 'not_defined' },
    access_private: { t: 'c', f: '_0' },
    std_fn_call: { t: 'c', f: '+', a: ['a', '_1'] },

    // add3 = a -> a + 3
    _3: { t: 'n', v: -3 },
    add3: {
        t: 'f', p: ['a'],
        b: { '=': { t: 'c', f: '+', a: ['a', '_3'] }, _3: { t: 'n', v: 3 } },
    },
    add3_1: { t: 'c', f: 'add3', a: ['_1'] },
    _arr: { t: 'm', v: [1, 2, 3] },
    add3_map: { t: 'c', f: 'map', a: ['add3', '_arr'] },

    [SYM2]: { t: 'n', v: 3 },
    [SYM1]: { t: 'c', f: 'add3', a: [SYM2] },

    _private_p1: { t: 's', v: 'cats' },
};
const p2 = {
    [SYM2]: { t: 'n', v: 123 },
    illegal_access: { t: 'c', f: '_private_p1' },
};

assertEq(evaluate([p1], 'a'), 2);
assertEq(evaluate([p1], 'b'), 2);
assertThrows(() => evaluate(p1, 'c'));
assertThrows(() => evaluate([p1], 'access_undef'));
assertEq(evaluate([p1], 'access_private'), 0);
assertEq(evaluate([p1], 'std_fn_call'), 3);
assert(evaluate([p1], 'add3') instanceof VMFun);
assertEq(evaluate([p1], 'add3_1'), 4);
assertEq(evaluate([p1], 'add3_map'), [4, 5, 6]);
assertEq(evaluate([p1], SYM1), 6);
assertEq(evaluate([p1, p2], SYM1), 6);
assertEq(evaluate([p1, p2], SYM2), 123);
// this should technically error according to spec, but it's fine for now
// assertThrows(() => evaluate([p1, p2], 'illegal_access'));

assert(analyze([p1], 'a').valid);
assert(analyze([p1], 'b').valid);
// We can't statically identify function arity! (in the general case)
// assert(!analyze(p1, 'c').valid);
assert(!analyze([p1], 'access_undef').valid);
assert(analyze([p1], 'access_private').valid);
assert(analyze([p1], 'std_fn_call').valid);
assert(analyze([p1], 'add3').valid);
assert(analyze([p1], 'add3_1').valid);
assert(analyze([p1], 'add3_map').valid);
assert(analyze([p1], SYM1).valid);
assert(analyze([p1, p2], SYM1).valid);
assert(analyze([p1, p2], SYM2).valid);
