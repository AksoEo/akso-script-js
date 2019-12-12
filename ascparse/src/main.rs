use lalrpop_util::lalrpop_mod;
use std::io::{stdin, Read};

mod ast;
mod ir;
lalrpop_mod!(grammar);

fn main() {
    let mut input = String::new();
    stdin()
        .lock()
        .read_to_string(&mut input)
        .expect("failed to read stdin");
    match grammar::ProgramParser::new().parse(&input) {
        Ok(decl) => println!(
            "{}",
            serde_json::to_string(&ir::compile(decl).expect("failed to compile"))
                .expect("failed to serialize")
        ),
        Err(err) => println!("{}", err),
    }
}
