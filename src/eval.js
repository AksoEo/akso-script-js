import { stdlib } from './stdlib';

/// Evaluates a definition.
///
/// # Parameters
/// - definitions: definitions object
/// - id: definition name to evaluate
/// - getFormValue: (name: string) => value:
///   will be used to get the value of @-prefixed identifiers.
///   value must be one of: null, bool, number, string, or an array of any of these values
///   (including arrays).
/// - options: additional options (all optional)
///     - debug: set to 1 to print warnings
///     - shouldHalt: pass a closure that returns a boolean when called to limit the allowed time
///       for which the script may run. Note that this will be called very often and should hence
///       be fast to compute. Halting this way will throw an error.
///
/// This function will throw if it encounters unknown definitions.
///
/// NOTE: to use country_fmt and phone_fmt, also load akso-script/country_fmt and
/// akso-script/phone_fmt. The stdlib functions will always return null otherwise.
///
/// Browser-compatible variant: use loadCountryFmt/loadPhoneFmt from this module.
export function evaluate (definitions, id, getFormValue, options = {}) {
    const context = {
        getFormValue,
        debug: options.debug,
        shouldHalt: options.shouldHalt || (() => false),
        caches: [new WeakMap()],
    };
    return evaluateScoped({ ...stdlib, ...definitions }, id, context);
}

const NOT_CACHED = Symbol();

function getCached (caches, key) {
    for (let i = caches.length - 1; i >= 0; i--) {
        if (caches[i].has(key)) return caches[i].get(key);
    }
    return NOT_CACHED;
}
function insertCached (caches, key, value) {
    caches[caches.length - 1].set(key, value);
}

class VMFun {
    constructor (body, params) {
        this.params = params;
        this.body = body;
    }
    get length () {
        return this.params.length;
    }
    apply (_, args) {
        if (args.length !== this.params.length) {
            throw new Error(`Function expected ${this.params.length} argument(s), got ${args.length} argument(s)`);
        }
        const params = {};
        for (let i = 0; i < this.params.length; i++) {
            params[this.params[i]] = args[i];
        }
        return this.body(params);
    }
}

export function evaluateScoped (definitions, id, context) {
    if (context.shouldHalt()) throw new Error('Terminated by shouldHalt');

    if (typeof id === 'string' && id.startsWith('@')) {
        // this is a form variable
        return context.getFormValue(id.substr(1));
    }

    const item = definitions[id];
    if (!item) throw new Error(`Unknown definition ${id}`);

    if (item.t === 'c') {
        // call a declaration

        let callee;
        {
            // see if we have it cached
            const cached = getCached(context.caches, item);
            if (cached !== NOT_CACHED) return cached;

            // resolve it from definitions otherwise
            callee = evaluateScoped(definitions, item.f, context);
        }

        const args = item.a || [];
        let value;

        if (typeof callee === 'function') {
            const expectedArgCount = callee.length;
            if (args.length !== expectedArgCount) throw new Error(`Incorrect number of arguments in ${id} (expected ${expectedArgCount})`);

            const argValues = args.map(arg => evaluateScoped(definitions, arg, context));
            value = callee.apply(null, argValues);
        } else {
            if (args.length) throw new Error(`Incorrect number of arguments in ${id} (expected 0)`);
            value = callee;
        }

        insertCached(context.caches, item, value);
        return value;
    } else if (item.t === 'f') {
        // define a function

        // see if we have it cached
        const cached = getCached(context.caches, item);
        if (cached !== NOT_CACHED) return cached;

        // define an inner function that contains the body
        const f = (params) => {
            const functionScope = {
                ...definitions, // definitions from the parent scope
                ...item.b, // function body
                ...params, // and the parameters
            };
            const functionContext = {
                ...context,
                caches: context.caches.concat([new WeakMap()]),
            };
            return evaluateScoped(functionScope, '=', functionContext);
        };

        const value = new VMFun(f, item.p);
        insertCached(context.caches, item, value);
        return value;
    } else if (item.t === 'l') {
        // construct a list
        const cached = getCached(context.caches, item);
        if (cached !== NOT_CACHED) return cached;

        const value = item.v.map(name => evaluateScoped(definitions, name, context));

        insertCached(context.caches, item, value);
        return value;
    } else if (item.t === 'w') {
        // switch
        const cached = getCached(context.caches, item);
        if (cached !== NOT_CACHED) return cached;
        for (const { c, v } of item.m) {
            let cond = true;
            if (typeof c === 'string' || typeof c === 'symbol') cond = evaluateScoped(definitions, c, context);
            if (cond === true) {
                return evaluateScoped(definitions, v, context);
            }
        }
        return null;
    } else if (item.t === 'n' || item.t === 'm' || item.t === 's' || item.t === 'b') {
        // constant types
        return item.v;
    } else if (item.t === 'u') {
        // null type
        return null;
    } else if (typeof item === 'function') {
        // stdlib function
        return item;
    } else {
        // unknown definition type
        throw new Error(`Unknown definition type ${item.t}`);
    }
}
