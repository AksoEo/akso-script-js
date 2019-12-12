# ascparse
This application parses a loosely Haskell-like language into AKSO script so you don’t have to write AKSO script by hand. This is intended as a developer tool.

### Example
Note that `if` is not a language construct but just the `if` function.

```hs
numbers = map (\x -> x + 1) [1, 2, 3, 4];

fib a = if (a <= 0) 0 (
    if (a <= 2) 1 (
        fib (a - 1) + fib (a - 2)
    )
);
fact a = if (a < 0) null (if (a <= 1) 1 (a * fact (a - 1)));

cats = map fib numbers;

infix_fn = 1 `mod` 2;

let_bindings a = let b = 2, c = 1 in a * b + c;

some_data = [[], [1, 2, 3], [null, true, false]];
```

### Usage
Install [`cargo`](https://rust-lang.org) and run `cargo run` in this repository, or `cargo build --release` to build a binary. Write code into stdin. AKSO script json will be written to stdout.

##### Possible optimizations that might be worth adding
- merging identical definitions (currently, using the same number literal multiple times will create multiple definitions, this is wasteful)
