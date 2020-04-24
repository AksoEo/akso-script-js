const asc = require('..');
const { assertEq } = require('./util');

{
    // simple test example
    // map :: ((a -> b), [a]) -> [b]
    // map :: (*, *) -> null
    const a = new asc.TypeVar();
    const b = new asc.TypeVar();
    const morph = new asc.TypeVar();
    const func = new asc.TypeVar();
    const map = new asc.FuncType([
        morph,
        func,
    ], new asc.CondType([
        {
            pre: [
                { var: morph, match: new asc.FuncType([a], b) },
                { var: func, match: asc.array(a) },
            ],
            type: asc.array(b),
        },
        { pre: [], type: asc.NULL },
    ]));

    // morphNB :: Num -> Bool
    // morphNB :: * -> null
    // reusing a type variable from before to test hygiene
    const morphNB = new asc.FuncType([a], new asc.CondType([
        { pre: [{ var: a, match: asc.NUMBER }], type: asc.BOOL },
        { pre: [], type: asc.NULL },
    ]));
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
