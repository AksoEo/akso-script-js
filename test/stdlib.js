const { stdlib, evaluate } = require('..');
const { assertEq } = require('./util');

function call (f, ...args) {
    return f.apply(null, args);
}

assertEq(call(stdlib['+'], 1, 2), 3);
assertEq(call(stdlib['+'], 1, null), null);
assertEq(call(stdlib['/'], 1, 0), 0);
assertEq(call(stdlib['^'], 0, 0), 1);
assertEq(call(stdlib.mod, 1, 0), 0);
assertEq(call(stdlib.mod, 1, 1), 0);
assertEq(call(stdlib.mod, 7, 4), 3);
assertEq(call(stdlib.mod, 7, -4), 1);
assertEq(call(stdlib.floor, null), null);
assertEq(call(stdlib.floor, 1.5), 1);
assertEq(call(stdlib.sign, 1.5), 1);
assertEq(call(stdlib.sign, 0), 0);
assertEq(call(stdlib['=='], 0, 0), true);
assertEq(call(stdlib['=='], 0, null), false);
const f = a => 0;
assertEq(call(stdlib['=='], f, f), true);
assertEq(call(stdlib['=='], { a: [1] }, { a: [1] }), true);
assertEq(call(stdlib['=='], {}, {}), true);
assertEq(call(stdlib['=='], { a: [1, 2] }, { a: [1] }), false);
assertEq(call(stdlib['>='], { a: [1, 2] }, { a: [1] }), false);
assertEq(call(stdlib['>='], 1, null), false);
assertEq(call(stdlib['>='], 1, 0), true);
assertEq(call(stdlib['>='], 1, 2), false);
assertEq(call(stdlib.and, true, 2), false);
assertEq(call(stdlib.and, true, true), true);
assertEq(call(stdlib.not, false), true);
assertEq(call(stdlib.not, 0), false);
assertEq(call(stdlib.cat, 0, 1), [0, 1]);
assertEq(call(stdlib.cat, 'a', 'b'), 'ab');
assertEq(call(stdlib.cat, [1, 2], [3, 4]), [1, 2, 3, 4]);
assertEq(call(stdlib.cat, 'cat', [3, 4]), ['c', 'a', 't', 3, 4]);
assertEq(call(stdlib.map, (a => a + 1), [0, 1, 2]), [1, 2, 3]);
assertEq(call(stdlib.map, (a => a + 1), 0), 1);
assertEq(call(stdlib.map, (a => a + 1), null), null);
assertEq(call(stdlib.map, (a => a + 'cat'), 'ab'), ['acat', 'bcat']);
assertEq(call(stdlib.map, 1, [2, 3]), [1, 1]);
assertEq(call(stdlib.flat_map, (a => [a, a + 1]), [0, 2]), [0, 1, 2, 3]);
assertEq(call(stdlib.flat_map, (a => [a, a + 1]), 0), [0, 1]);
assertEq(call(stdlib.flat_map, (a => a + 'cat'), 'ab'), 'acatbcat');
assertEq(call(stdlib.fold, ((a, b) => a + b), 0, [1, 2, 2]), 5);
assertEq(call(stdlib.fold1, ((a, b) => a + b), [1, 2, 2]), 5);
assertEq(call(stdlib.fold1, ((a, b) => b === 'b' ? a : a + b), 'abaa'), 'aaa');
assertEq(call(stdlib.fold, ((a, b) => a + b), 0, 3), 3);
assertEq(call(stdlib.fold1, ((a, b) => a + b), 1), null);
assertEq(call(stdlib.filter, (a => a === 1), [1, 2]), [1]);
assertEq(call(stdlib.filter, (a => a === 1), 1), null);
assertEq(call(stdlib.filter, (a => a === 'a'), 'abab'), 'aa');
assertEq(call(stdlib.filter, (a => 'cats'), 'abab'), '');
assertEq(call(stdlib.index, [1, 2, 3], 0), 1);
assertEq(call(stdlib.index, [1, 2, 3], -1), null);
assertEq(call(stdlib.index, 'cat', 0), 'c');
assertEq(call(stdlib.index, null, 0), null);
assertEq(call(stdlib.length, null), null);
assertEq(call(stdlib.length, 'cat'), 3);
assertEq(call(stdlib.length, [1, 2]), 2);
assertEq(call(stdlib.contains, [1, 2], 1), true);
assertEq(call(stdlib.contains, [1, { a: 1 }], { a: 1 }), true);
assertEq(call(stdlib.contains, [1, 2], 3), false);
assertEq(call(stdlib.contains, 'cat', 3), false);
assertEq(call(stdlib.contains, 'cat', 'at'), true);
assertEq(call(stdlib.contains, ['cat', null], null), true);
assertEq(call(stdlib.head, [1, 2, 3], 2), [1, 2]);
assertEq(call(stdlib.tail, [1, 2, 3], 2), [3]);
assertEq(call(stdlib.date_sub, 'years', '2019-01-01', '2019-01-01'), 0);
assertEq(call(stdlib.date_sub, 'months', '2019-02-01', '2019-01-01'), 1);
assertEq(call(stdlib.date_sub, 'months', '2019-05-03', '2019-01-01'), 4 + 2 / 31);
assertEq(call(stdlib.date_sub, 'months', '2019-05-01', '2019-01-03'), 4 - 2 / 31);
assertEq(call(stdlib.date_sub, 'cats', '2019-05-03', '2019-01-01'), null);
assertEq(call(stdlib.date_add, 'years', '2019-01-01', 1), '2020-01-01');
assertEq(call(stdlib.date_add, 'days', '2019-01-01', 3), '2019-01-04');
assertEq(call(evaluate({}, 'sum'), [1, 2, 3, 4]), 10);
