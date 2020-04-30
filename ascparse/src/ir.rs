use crate::ast::*;
use serde::Serialize;
use serde_json::Value;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

type Id = String;

pub type Defs = HashMap<Id, Def>;

#[derive(Serialize)]
#[serde(tag = "t")]
pub enum Def {
    #[serde(rename = "n")]
    Number {
        #[serde(rename = "v")]
        value: f64,
    },
    #[serde(rename = "s")]
    String {
        #[serde(rename = "v")]
        value: String,
    },
    #[serde(rename = "m")]
    Matrix {
        #[serde(rename = "v")]
        value: Vec<Value>,
    },
    #[serde(rename = "b")]
    Bool {
        #[serde(rename = "v")]
        value: bool,
    },
    #[serde(rename = "u")]
    Null,
    #[serde(rename = "l")]
    List {
        #[serde(rename = "v")]
        items: Vec<Id>,
    },
    #[serde(rename = "c")]
    Call {
        f: Id,
        #[serde(rename = "a")]
        args: Vec<Id>,
    },
    #[serde(rename = "f")]
    Fn {
        #[serde(rename = "p")]
        params: Vec<Id>,
        #[serde(rename = "b")]
        body: Defs,
    },
    #[serde(rename = "w")]
    Switch {
        #[serde(rename = "m")]
        cases: Vec<SwitchCase>,
    },
}

#[derive(Serialize)]
pub struct SwitchCase {
    #[serde(rename = "c")]
    cond: Option<Id>,
    #[serde(rename = "v")]
    value: Id,
}

const STDLIB_NAMES: &[&str] = &[
    "+",
    "-",
    "*",
    "/",
    "^",
    "mod",
    "floor",
    "ceil",
    "round",
    "trunc",
    "sign",
    "abs",
    "==",
    "!=",
    ">",
    "<",
    ">=",
    "<=",
    "and",
    "or",
    "not",
    "xor",
    "++",
    "map",
    "flat_map",
    "fold",
    "fold1",
    "index",
    "length",
    "contains",
    "head",
    "tail",
    "sum",
    "min",
    "max",
    "avg",
    "med",
    "sort",
    "date_sub",
    "date_add",
    "date_today",
    "date_fmt",
    "time_now",
    "datetime_fmt",
    "currency_fmt",
    "country_fmt",
    "phone_fmt",
    "id",
];

#[derive(Debug, Clone)]
pub enum CompileError {
    DupIdent(String),
    CantResolve(String),
}

struct CompileContext<'a> {
    parent: Option<&'a CompileContext<'a>>,
    names: RefCell<HashSet<Id>>,
    priv_counter: RefCell<usize>,
    /// If true, parent must be Some.
    is_pseudo: bool,
}

impl<'a> CompileContext<'a> {
    fn global() -> CompileContext<'static> {
        CompileContext {
            parent: None,
            names: RefCell::new(STDLIB_NAMES.iter().map(|name| name.to_string()).collect()),
            priv_counter: RefCell::new(0),
            is_pseudo: false,
        }
    }

    fn create_child(&self) -> CompileContext {
        CompileContext {
            parent: Some(self),
            names: RefCell::new(HashSet::new()),
            priv_counter: RefCell::new(0),
            is_pseudo: false,
        }
    }

    fn create_pseudo_child(&self) -> CompileContext {
        CompileContext {
            parent: Some(self),
            names: RefCell::new(HashSet::new()),
            priv_counter: RefCell::new(0),
            is_pseudo: true,
        }
    }

    fn add_ident(&mut self, id: String) -> Result<Id, CompileError> {
        let mut names = self.names.borrow_mut();
        if names.contains(&id) {
            return Err(CompileError::DupIdent(id));
        }
        names.insert(id.clone());
        if self.is_pseudo {
            Ok(self.parent.unwrap().add_sub_ident(id))
        } else {
            Ok(id)
        }
    }

    fn add_sub_ident(&self, id: String) -> Id {
        if self.is_pseudo {
            self.parent.unwrap().add_sub_ident(id)
        } else {
            self.next_priv(&id)
        }
    }

    fn resolve(&self, id: String) -> Result<Id, CompileError> {
        if id.starts_with('@') {
            Ok(id)
        } else if self.names.borrow().contains(&id) {
            Ok(id)
        } else {
            self.parent
                .map_or(Err(CompileError::CantResolve(id.to_string())), |parent| {
                    parent.resolve(id)
                })
        }
    }

    fn next_priv(&self, suffix: &str) -> Id {
        if self.is_pseudo {
            return self.parent.unwrap().next_priv(suffix);
        }
        let mut names = self.names.borrow_mut();
        let mut priv_counter = self.priv_counter.borrow_mut();

        loop {
            let next = format!("_{}{}", priv_counter, suffix);
            if !names.contains(&next) {
                names.insert(next.clone());
                break next;
            }
            *priv_counter += 1;
        }
    }
}

fn compile_expr<'a>(
    out: String,
    expr: Expr,
    ctx: &mut CompileContext<'a>,
) -> Result<Defs, CompileError> {
    let mut defs = HashMap::new();

    match expr {
        Expr::Group(expr) => return compile_expr(out, *expr, ctx),
        Expr::Ident(ident) => {
            let name = ctx.resolve(ident.0)?;
            defs.insert(
                out,
                Def::Call {
                    f: name,
                    args: Vec::new(),
                },
            );
        }
        Expr::Let(decl, inner) => {
            let mut sub_ctx = ctx.create_pseudo_child();
            let ident = sub_ctx.add_ident(decl.name.0.clone())?;
            defs.extend(compile_decl(ident, *decl, &mut sub_ctx)?);
            defs.extend(compile_expr(out, *inner, &mut sub_ctx)?);
        }
        Expr::Apply(a, op, b) => match op {
            Op::Apply => {
                let mut flat_apply = vec![b]; // reversed

                // flatten Apply(Apply(Apply(a b) b) b)
                let mut cursor = a;
                let left = loop {
                    match *cursor {
                        Expr::Apply(sa, Op::Apply, sb) => {
                            flat_apply.push(sb);
                            cursor = sa;
                        }
                        _ => break cursor,
                    }
                };

                let left_id = match *left {
                    Expr::Ident(ident) => ctx.resolve(ident.0)?,
                    expr => {
                        let out = ctx.next_priv("");
                        defs.extend(compile_expr(out.clone(), expr, ctx)?);
                        out
                    }
                };

                let mut args = Vec::with_capacity(flat_apply.len());
                for expr in flat_apply.into_iter().rev() {
                    args.push(match *expr {
                        Expr::Ident(ident) => ctx.resolve(ident.0)?,
                        expr => {
                            let out = ctx.next_priv("");
                            defs.extend(compile_expr(out.clone(), expr, ctx)?);
                            out
                        }
                    });
                }

                defs.insert(out, Def::Call { f: left_id, args });
            }
            Op::Infix(o) => {
                return compile_expr(
                    out,
                    Expr::Apply(
                        Box::new(Expr::Apply(Box::new(Expr::Ident(o)), Op::Apply, a)),
                        Op::Apply,
                        b,
                    ),
                    ctx,
                );
            }
        },
        Expr::List(items) => {
            let mut is_all_bool = true;
            let mut is_all_num = true;

            for item in &items {
                match item {
                    Expr::Number(_) => is_all_bool = false,
                    Expr::Bool(_) => is_all_num = false,
                    _ => {
                        is_all_num = false;
                        is_all_bool = false;
                    }
                }
            }

            if is_all_num || is_all_bool {
                let mut values: Vec<Value> = Vec::new();
                for item in &items {
                    match item {
                        Expr::Number(n) => values.push(Value::Number(
                            serde_json::Number::from_f64(*n).expect("invalid number in ast"),
                        )),
                        Expr::Bool(b) => values.push(Value::Bool(*b)),
                        _ => panic!("invalid state"),
                    }
                }

                defs.insert(out, Def::Matrix { value: values });
            } else {
                let mut resolved_items = Vec::with_capacity(items.len());

                for item in items {
                    let resolved = match item {
                        Expr::Ident(ident) => ctx.resolve(ident.0)?,
                        expr => {
                            let out = ctx.next_priv("");
                            defs.extend(compile_expr(out.clone(), expr, ctx)?);
                            out
                        }
                    };
                    resolved_items.push(resolved);
                }

                defs.insert(
                    out,
                    Def::List {
                        items: resolved_items,
                    },
                );
            }
        }
        Expr::If(c, t, e) => {
            let mut cases = Vec::new();
            let cond_out = ctx.next_priv("");
            let then_out = ctx.next_priv("");
            let else_out = ctx.next_priv("");

            defs.extend(compile_expr(cond_out.clone(), *c, ctx)?);
            defs.extend(compile_expr(then_out.clone(), *t, ctx)?);
            defs.extend(compile_expr(else_out.clone(), *e, ctx)?);

            cases.push(SwitchCase {
                cond: Some(cond_out),
                value: then_out,
            });

            cases.push(SwitchCase {
                cond: None,
                value: else_out,
            });

            defs.insert(out, Def::Switch { cases });
        }
        Expr::Number(n) => {
            defs.insert(out, Def::Number { value: n });
        }
        Expr::String(s) => {
            defs.insert(out, Def::String { value: s });
        }
        Expr::Bool(b) => {
            defs.insert(out, Def::Bool { value: b });
        }
        Expr::Null => {
            defs.insert(out, Def::Null);
        }
        Expr::Lambda(lambda) => {
            let mut lambda_ctx = ctx.create_child();
            for param in &lambda.params {
                lambda_ctx.add_ident(param.0.clone())?;
            }
            let body = compile_expr("=".into(), lambda.body, &mut lambda_ctx)?;
            defs.insert(
                out,
                Def::Fn {
                    params: lambda.params.into_iter().map(|p| p.0).collect(),
                    body,
                },
            );
        }
    }

    Ok(defs)
}

fn compile_decl<'a>(
    out: Id,
    decl: Decl,
    ctx: &mut CompileContext<'a>,
) -> Result<Defs, CompileError> {
    if decl.params.is_empty() {
        // constant
        let mut decl_ctx = ctx.create_pseudo_child();
        compile_expr(out, decl.body, &mut decl_ctx)
    } else {
        // function
        let mut decl_ctx = ctx.create_child();

        // FIXME: we’re not using the assigned id from these
        for param in &decl.params {
            decl_ctx.add_ident(param.0.clone())?;
        }

        let body = compile_expr("=".into(), decl.body, &mut decl_ctx)?;

        let mut defs = HashMap::new();
        defs.insert(
            out,
            Def::Fn {
                params: decl.params.into_iter().map(|p| p.0).collect(),
                body,
            },
        );
        Ok(defs)
    }
}

fn compile_prog<'a>(prog: Program, ctx: &mut CompileContext<'a>) -> Result<Defs, CompileError> {
    let Program(prog) = prog;

    for decl in &prog {
        ctx.add_ident(decl.name.0.clone())?;
    }

    let mut defs = HashMap::new();

    for decl in prog {
        defs.extend(compile_decl(decl.name.0.clone(), decl, ctx)?);
    }

    Ok(defs)
}

pub fn compile(prog: Program) -> Result<Defs, CompileError> {
    compile_prog(prog, &mut CompileContext::global())
}
