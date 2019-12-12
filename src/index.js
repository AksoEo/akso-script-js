const stdlib = require('./stdlib');

const VM_FN_PARAM = Symbol('fn-param');
const NOT_EVALUATED = Symbol('?');

function evaluateScoped (definitions, id, context) {
    const item = definitions[id];
    if (!item) throw new Error(`Unknown definition ${id}`);

    if (item.t === 'c') {
        // call a declaration

        let value;
        if (item.f.startsWith('@')) {
            // this is a form variable
            value = context.getFormValue(item.f.substr(1));
        } else {
            // resolve it from definitions otherwise
            value = evaluateScoped(definitions, item.f, context);
        }

        const debugArgs = item.a.map(() => NOT_EVALUATED);

        // apply arguments
        for (let i = 0; i < item.a.length; i++) {
            if (typeof value === 'function') {
                const argumentName = item.a[i];
                const index = i;
                value = value(() => {
                    const v = evaluateScoped(definitions, argumentName, context)
                    if (context.debug > 1) debugArgs[index] = v;
                    return v;
                });
            } else {
                // too many arguments
                if (context.debug > 0) console.warn(`too many args for ${item.f} in`, item);
                break;
            }
        }

        if (context.debug > 1) console.debug(item.f, debugArgs, '->', value);

        return value;
    } else if (item.t === 'f') {
        // define a function

        // define an inner function that contains the body
        let f = (params) => {
            const functionScope = {
                ...definitions, // definitions from the parent scope
                ...item.b, // function body
                ...params, // and the parameters
            };
            return evaluateScoped(functionScope, '=', context);
        };

        if (item.p.length === 0) {
            // a function with no parameters is the same as a constant
            return f({});
        }

        // curried function construction.
        // we use (params, index) as state and a as the next parameter.
        // params is a definitions object containing only the parameters.
        // index is the index in the item.params array.
        const c = (params, index) => a => {
            const paramName = item.p[index];
            const newParams = { ...params, [paramName]: { t: VM_FN_PARAM, get: a } };

            // we’ve got enough arguments to call f here
            if (index + 1 === item.p.length) return f(newParams);

            // otherwise just return a “partially applied function”
            // and wait to collect more arguments
            return c(newParams, index + 1);
        };

        // return c with initial state
        return c({}, 0);
    } else if (item.t === 'l') {
        // construct a list
        return item.v.map(name => evaluateScoped(definitions, name, context));
    } else if (item.t === 'n' || item.t === 'm' || item.t === 's' || item.t === 'b') {
        // constant types
        return item.v;
    } else if (item.t === 'u') {
        // null type
        return null;
    } else if (item.t === VM_FN_PARAM) {
        // function parameter in the vm (lazy)
        return item.get();
    } else if (typeof item === 'function') {
        // stdlib function
        return item;
    } else {
        // unknown definition type
        throw new Error(`Unknown definition type ${item.t}`);
    }
}

/// Evaluates a definition.
///
/// # Parameters
/// - definitions: definitions object
/// - id: definition name to evaluate
/// - getFormValue: (name: string) => value:
///   will be used to get the value of @-prefixed identifiers.
///   value must be one of: null, bool, number, string, or an array of any of these values
///   (including arrays).
/// - debug: optional. set to 1 to warn about applying to values, set to 2 to log every function
///   call
///
/// This function will throw if it encounters unknown definitions.
function evaluate (definitions, id, getFormValue, debug = 0) {
    const context = {
        getFormValue,
        debug,
    };
    return evaluateScoped({ ...stdlib, ...definitions }, id, context);
}

module.exports = evaluate;
module.exports.evaluateScoped = evaluateScoped;
