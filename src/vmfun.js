export const VM_FN_PARAM = Symbol('param');

const vmError = a => {
    throw new Error(a);
}
const ERRS = ' (error)';

export class VMFun {
    constructor (body, params, bodyName) {
        this.params = params;
        // we rename the function the body is bound to for better debug info
        this.bodyName = bodyName.toString();
        if (this.bodyName in this) {
            // prevent overriding intrinsics
            this.bodyName += '~';
        }
        this[this.bodyName] = body;
        this[this.bodyName + ERRS] = vmError;
    }
    get length () {
        return this.params.length;
    }
    get body () {
        return this[this.bodyName];
    }
    apply (_, args) {
        if (args.length !== this.params.length) {
            this[this.bodyName + ERRS](`Function expected ${this.params.length} argument(s), got ${args.length} argument(s)`);
        }
        const params = {};
        for (let i = 0; i < this.params.length; i++) {
            const arg = args[i];
            if (arg === undefined) this[this.bodyName + ERRS](`Undefined argument at index ${i}`);
            params[this.params[i]] = { t: VM_FN_PARAM, v: arg };
        }
        return this[this.bodyName](params);
    }
}

// vm function with native body, for use in stdlib
export class NVMFun extends VMFun {
    constructor (body, name) {
        super(body, 'abcdefghijklmnopqrstuvwxyz'.split('').slice(0, body.length), name);
    }
    get length () {
        return this.body.length;
    }
    apply (_, args) {
        if (args.length !== this.body.length) {
            this[this.bodyName + ERRS](`Function expected ${this.params.length} argument(s), got ${args.length} argument(s)`);
        }
        for (let i = 0; i < this.body.length; i++) {
            const arg = args[i];
            if (arg === undefined) this[this.bodyName + ERRS](`Undefined argument at index ${i}`);
        }
        return this.body(...args);
    }
}
