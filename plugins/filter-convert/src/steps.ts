import {StepError} from "./errors";

export type Step = {
    arity: number;
    run(value: unknown, args: string[]): unknown;
};

/** Coerce to a BigInt integer, rejecting anything fractional or non-numeric. */
function toInteger(value: unknown): bigint {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") {
        if (!Number.isInteger(value)) throw new StepError(`not an integer: ${value}`);
        return BigInt(value);
    }
    if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
        return BigInt(value.trim());
    }
    throw new StepError(`not an integer: ${String(value)}`);
}

function parseRadix(value: unknown, radix: 2 | 8 | 16, prefix: string, pattern: RegExp): bigint {
    if (typeof value !== "string") throw new StepError(`not a string: ${String(value)}`);
    const raw = value.trim().toLowerCase();
    const body = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    if (body.length === 0 || !pattern.test(body)) {
        throw new StepError(`not base-${radix}: ${value}`);
    }
    let result = 0n;
    const base = BigInt(radix);
    for (const ch of body) {
        result = result * base + BigInt(Number.parseInt(ch, radix));
    }
    return result;
}

export const STEPS: Record<string, Step> = {
    // ---- numeric base ----
    "hex>dec": {arity: 0, run: (v) => parseRadix(v, 16, "0x", /^[0-9a-f]+$/)},
    "bin>dec": {arity: 0, run: (v) => parseRadix(v, 2, "0b", /^[01]+$/)},
    "oct>dec": {arity: 0, run: (v) => parseRadix(v, 8, "0o", /^[0-7]+$/)},
    "dec>hex": {arity: 0, run: (v) => `0x${toInteger(v).toString(16)}`},
    "dec>bin": {arity: 0, run: (v) => `0b${toInteger(v).toString(2)}`},
    "dec>oct": {arity: 0, run: (v) => `0o${toInteger(v).toString(8)}`},
};

export function runStep(name: string, value: unknown, args: string[]): unknown {
    const step = STEPS[name];
    if (step == null) throw new StepError(`unknown step: ${name}`);
    return step.run(value, args);
}
