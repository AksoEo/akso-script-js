use nom::branch::alt;
use nom::bytes::complete::tag;
use nom::bytes::complete::take_while;
use nom::bytes::complete::take_while1;
use nom::character::complete::one_of;
use nom::combinator::map;
use nom::combinator::opt;
use nom::IResult;
use std::iter;

#[derive(Debug, Clone)]
pub struct Program(pub Vec<Decl>);

#[derive(Debug, Clone)]
pub struct Decl {
    pub name: Ident,
    pub params: Vec<Ident>,
    pub body: Expr,
}

#[derive(Debug, Clone)]
pub struct Ident(pub String);

#[derive(Debug, Clone)]
pub enum Expr {
    Ident(Ident),
    Group(Box<Expr>),
    Let(Box<Decl>, Box<Expr>),
    Apply(Box<Expr>, Op, Box<Expr>),
    List(Vec<Expr>),
    Number(f64),
    String(String),
    Bool(bool),
    Null,
    Lambda(Box<Lambda>),
}

#[derive(Debug, Clone)]
pub struct Lambda {
    pub params: Vec<Ident>,
    pub body: Expr,
}

#[derive(Debug, Clone)]
pub enum Op {
    Apply,
    Infix(Ident),
}

const MAX_PREC_LEVEL: usize = 12;
fn prec_level(op: &Op) -> usize {
    match op {
        Op::Infix(Ident(op)) => match &**op {
            "||" => 12,
            "&&" => 11,
            "==" | "!=" => 10,
            ">=" | "<=" | ">" | "<" => 9,
            "|" => 8,
            "&" => 7,
            "<<" | ">>" => 6,
            "+" | "-" => 5,
            "*" | "/" | "%" => 4,
            "^" => 3,
            _ => 2,
        },
        Op::Apply => 1,
    }
}

pub(crate) fn fix_expr_prec(expr: Expr) -> Expr {
    #[derive(Clone)]
    enum Item {
        Expr(Expr),
        Op(Op),
    }

    fn flatten_expr(expr: Expr) -> Vec<Item> {
        match expr {
            Expr::Apply(a, op, b) => flatten_expr(*a)
                .into_iter()
                .chain(iter::once(Item::Op(op)))
                .chain(flatten_expr(*b).into_iter())
                .collect(),
            e => vec![Item::Expr(e)],
        }
    }

    let mut items = flatten_expr(expr);

    for level in 0..=MAX_PREC_LEVEL {
        let mut i = 0;
        while i < items.len() {
            let item = &items[i];
            match item {
                Item::Op(op) if prec_level(&op) == level => {
                    let op = op.clone();
                    drop(item);
                    let prev = items.remove(i - 1);
                    i -= 1;
                    let next = items.remove(i + 1);

                    if let (Item::Expr(prev), Item::Expr(next)) = (prev, next) {
                        items[i] = Item::Expr(Expr::Apply(Box::new(prev), op, Box::new(next)));
                        i += 1;
                    } else {
                        panic!("binary operation does not have expression on either side");
                    }
                }
                _ => i += 1,
            }
        }
    }

    assert_eq!(
        items.len(),
        1,
        "binary expression was not reduced to one expression"
    );
    match items.remove(0) {
        Item::Expr(e) => e,
        _ => panic!("binary expression was reduced to an operator somehow"),
    }
}

fn char_to_num(c: char) -> u8 {
    match c {
        '0' => 0,
        '1' => 1,
        '2' => 2,
        '3' => 3,
        '4' => 4,
        '5' => 5,
        '6' => 6,
        '7' => 7,
        '8' => 8,
        '9' => 9,
        'a' | 'A' => 0xA,
        'b' | 'B' => 0xB,
        'c' | 'C' => 0xC,
        'd' | 'D' => 0xD,
        'e' | 'E' => 0xE,
        'f' | 'F' => 0xF,
        _ => panic!("char_to_num on non-numeric char"),
    }
}

fn num_p_radix(f: char, s: &str, r: u8) -> f64 {
    let mut v = 0.;
    for c in iter::once(f).chain(s.chars()) {
        let cx = char_to_num(c);
        v *= r as f64;
        v += cx as f64;
    }
    v
}

fn parse_number_binary(input: &str) -> IResult<&str, f64> {
    let (input, _) = tag("0b")(input)?;
    map(take_while1(|c| c == '0' || c == '1'), |s| {
        num_p_radix('0', s, 2)
    })(input)
}

fn parse_number_octal(input: &str) -> IResult<&str, f64> {
    let (input, _) = tag("0o")(input)?;
    map(
        take_while1(|c| match c {
            '0'..='7' => true,
            _ => false,
        }),
        |s| num_p_radix('0', s, 8),
    )(input)
}

fn parse_number_hex(input: &str) -> IResult<&str, f64> {
    let (input, _) = tag("0x")(input)?;
    map(
        take_while1(|c| match c {
            '0'..='9' | 'a'..='f' | 'A'..='F' => true,
            _ => false,
        }),
        |s| num_p_radix('0', s, 16),
    )(input)
}

fn parse_number_dec(input: &str) -> IResult<&str, f64> {
    let (input, fint) = one_of("0123456789")(input)?;
    let (input, int) = take_while(|c| match c {
        '0'..='9' => true,
        _ => false,
    })(input)?;
    let (input, frac) = opt(|input| {
        let (input, _) = tag(".")(input)?;
        take_while1(|c| match c {
            '0'..='9' => true,
            _ => false,
        })(input)
    })(input)?;
    let (input, exp) = opt(|input| {
        let (input, _) = one_of("eE")(input)?;
        let (input, sign) = opt(one_of("+-"))(input)?;
        let (input, body) = take_while1(|c| match c {
            '0'..='9' => true,
            _ => false,
        })(input)?;
        Ok((input, (sign, body)))
    })(input)?;

    let mut value = num_p_radix(fint, int, 10);
    if let Some(frac) = frac {
        let mut offset = -1;
        for c in frac.chars() {
            value += char_to_num(c) as f64 * 10_f64.powf(offset as f64);
            offset -= 1;
        }
    }

    if let Some((sign, exp)) = exp {
        let sign = match sign {
            Some('+') | None => 1.,
            _ => -1.,
        };
        let exp = sign * num_p_radix('0', exp, 10);
        value *= 10_f64.powf(exp);
    }

    Ok((input, value))
}

fn parse_number_body(input: &str) -> IResult<&str, f64> {
    alt((
        parse_number_binary,
        parse_number_octal,
        parse_number_hex,
        parse_number_dec,
    ))(input)
}

fn parse_number_i(input: &str) -> IResult<&str, f64> {
    let (input, sign) = opt(one_of("+-"))(input)?;
    let (input, body) = parse_number_body(input)?;

    let sign = match sign {
        Some('+') | None => 1.,
        _ => -1.,
    };

    Ok((input, body * sign))
}

pub(crate) fn parse_number(s: String) -> f64 {
    parse_number_i(&s).expect("failed to parse number").1
}

pub(crate) fn parse_string(s: String) -> String {
    let mut out = String::with_capacity(s.len() - 2);
    let mut escape_next = false;
    for c in s.chars().skip(1) { // skip " at the beginning
        if !escape_next && c == '\\' {
            escape_next = true;
        } else if escape_next {
            out.push(match c {
                '"' => '"',
                'n' => '\n',
                't' => '\t',
                'r' => '\r',
                _ => c,
            });
        } else {
            out.push(c);
        }
    }
    out.pop(); // remove " at the end
    out
}
