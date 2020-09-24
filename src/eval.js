import { stdlib } from './stdlib';
import { VMFun, VM_FN_PARAM } from './vmfun';

/// Evaluates a definition.
///
/// # Parameters
/// - definitions: array of definitions objects. This is treated as a stack of definitions, and
///   any stack item may reference defs that come in stack items before it.
///   While this property does hold for underscore defs too in this implementation, this behavior
///   should not be relied upon.
///   There is an invisible bottommost stack item with the standard library.
/// - id: definition name to evaluate (may refer to any stack item)
/// - getFormValue: (name: string) => value:
///   will be used to get the value of @-prefixed identifiers.
///   value must be one of: null, bool, number, string, Date, or an array of any of these values
///   (including arrays, excluding Dates).
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
    const stack = [stdlib].concat(definitions);
    return evaluateScoped(stack, stack.length - 1, id, context);
}

// Sentinel value
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

/// # Parameters
/// - definitions: def stack
/// - index: which stack item are we in right now?
/// - id: id of the def to evaluate
/// - context: see above in evaluate(...)
export function evaluateScoped (definitions, index, id, context) {
    if (context.shouldHalt()) throw new Error('Terminated by shouldHalt');

    if (typeof id === 'string' && id.startsWith('@')) {
        // this is a form variable
        return context.getFormValue(id.substr(1));
    }

    // resolve definition in stack. Prefer later items
    let item, itemIndex;
    for (let i = index; i >= 0; i--) {
        if (id in definitions[i]) {
            item = definitions[i][id];
            itemIndex = i;
            break;
        }
    }
    if (!item) throw new Error(`Unknown definition ${id.toString()}`);

    if (item.t === 'c') {
        // call a declaration

        // see if we have it cached
        const cached = getCached(context.caches, item);
        if (cached !== NOT_CACHED) return cached;

        // resolve it from definitions otherwise
        const callee = evaluateScoped(definitions, itemIndex, item.f, context);

        const args = item.a || [];
        let value;

        if (callee instanceof VMFun) {
            // this is an actual function
            const expectedArgCount = callee.length;
            if (args.length !== expectedArgCount) throw new Error(`Incorrect number of arguments in ${id.toString()} (expected ${expectedArgCount})`);

            const argValues = args.map(arg => evaluateScoped(definitions, itemIndex, arg, context));
            value = callee.apply(null, argValues);
        } else {
            // this is not an actual function so we just copy the value
            if (args.length) throw new Error(`Incorrect number of arguments in ${id.toString()} (expected 0)`);
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
            // definitions from the parent scope
            const functionStack = definitions.slice(0, itemIndex + 1);
            functionStack.push(params); // parameters
            functionStack.push(item.b); // and the function body
            // (parameters come before the body because the body needs to access them)
            const functionContext = {
                ...context,
                caches: context.caches.concat([new WeakMap()]),
            };
            return evaluateScoped(functionStack, functionStack.length - 1, '=', functionContext);
        };

        const value = new VMFun(f, item.p, id);
        insertCached(context.caches, item, value);
        return value;
    } else if (item.t === 'l') {
        // construct a list
        const cached = getCached(context.caches, item);
        if (cached !== NOT_CACHED) return cached;

        const value = item.v.map(name => evaluateScoped(definitions, itemIndex, name, context));

        insertCached(context.caches, item, value);
        return value;
    } else if (item.t === 'w') {
        // switch
        const cached = getCached(context.caches, item);
        if (cached !== NOT_CACHED) return cached;
        for (const { c, v } of item.m) {
            let cond = true;
            if (typeof c === 'string' || typeof c === 'symbol') cond = evaluateScoped(definitions, itemIndex, c, context);
            if (cond === true) {
                return evaluateScoped(definitions, itemIndex, v, context);
            }
        }
        return null;
    } else if (item.t === 'n' || item.t === 'm' || item.t === 's' || item.t === 'b') {
        // constant types
        return item.v;
    } else if (item.t === 'u') {
        // null type
        return null;
    } else if (item.t === VM_FN_PARAM) {
        return item.v;
    } else if (item instanceof VMFun) {
        // stdlib function
        return item;
    } else {
        // unknown definition type
        throw new Error(`Unknown definition type ${item.t}`);
    }
}
