const asc = require('..');
const { assertEq } = require('./util');

{
    const a = new asc.TypeVar();
    const b = new asc.TypeVar();

    // simple test example
    // map :: (a:(* -> *), [b]) -> [(a b)]
    // map :: (*, *) -> null
    const map = new asc.FuncType([
        new asc.TypeMapping([a, b], [
            new asc.FunctionPattern(a, 1),
            asc.array(b),
        ], asc.array(asc.apply(a, [b]))),
        new asc.TypeMapping([a, b], [a, b], asc.NULL),
    ]);

    // morphNB :: Num -> Bool
    // morphNB :: * -> null
    // reusing a type variable from before to test hygiene
    const morphNB = new asc.FuncType([
        new asc.TypeMapping([], [asc.NUMBER], asc.BOOL),
        new asc.TypeMapping([], [a], asc.NULL),
    ]);
    // funcN :: [Num]
    const funcN = asc.array(asc.NUMBER);

    // mapNBN :: [Bool]
    const mapNBN = asc.apply(map, [morphNB, funcN]);
    assertEq(mapNBN, asc.array(asc.BOOL));

    // funcB :: [Bool]
    const funcB = asc.array(asc.BOOL);

    // mapNBB :: [null]
    const mapNBB = asc.apply(map, [morphNB, funcB]);
    assertEq(mapNBB, asc.array(asc.NULL));
}
