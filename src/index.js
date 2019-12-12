const stdlib = require('./stdlib');

const VM_FN_PARAM = Symbol('fn-param');
const NOT_EVALUATED = Symbol('?');
const DEBUG = false;

function evaluateScoped (definitions, id, getFormValue) {
    const item = definitions[id];
    if (!item) throw new Error(`Unknown definition ${id}`);

    if (item.t === 'c') {
        // call a declaration

        let value;
        if (item.f.startsWith('@')) {
            // this is a form variable
            value = getFormValue(item.f.substr(1));
        } else {
            // resolve it from definitions otherwise
            value = evaluateScoped(definitions, item.f, getFormValue);
        }

        const debugArgs = item.a.map(() => NOT_EVALUATED);

        // apply arguments
        for (let i = 0; i < item.a.length; i++) {
            if (typeof value === 'function') {
                const argumentName = item.a[i];
                // value = value(() => evaluateScoped(definitions, argumentName, getFormValue));
                const index = i;
                value = value(() => {
                    const v = evaluateScoped(definitions, argumentName, getFormValue)
                    debugArgs[index] = v;
                    return v;
                });
            } else {
                // too many arguments
                // TODO: warn about this maybe
                if (DEBUG) console.log('too many args!');
                break;
            }
        }

        if (DEBUG) console.log(item.f, debugArgs, '->', value);

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
            return evaluateScoped(functionScope, '=', getFormValue);
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
        return item.v.map(name => evaluateScoped(definitions, name, getFormValue));
    } else if (item.t === 'n' || item.t === 'm' || item.t === 's' || item.t === 'b') {
        // constant types
        return item.v;
    } else if (item.t === 'n') {
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

function evaluate (definitions, id) {
    return evaluateScoped({ ...stdlib, ...definitions }, id);
}

module.exports = evaluate;
module.exports.evaluateScoped = evaluateScoped;

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.resume();
process.stdin.on('end', () => {
    console.log(input);
    const defs = JSON.parse(input);
    for (const k in defs) console.log(k, '->', evaluate(defs, k));
});

