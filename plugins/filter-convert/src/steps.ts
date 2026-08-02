import {StepError} from "./errors";
import {divDec, formatDec, formatFixed, mulDec, parseDec, roundDec} from "./decimal";

export type Step = {
    arity: number;
    run(value: unknown, args: string[]): unknown;
};

/** Coerce to a BigInt integer, rejecting anything fractional, non-numeric, or an
 * unsafe (float-corrupted) JS number. Integral strings and bigints have no such
 * ceiling — they can carry arbitrarily large exact values. */
function toInteger(value: unknown): bigint {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value)) throw new StepError(`not a safe integer: ${value}`);
        return BigInt(value);
    }
    if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
        return BigInt(value.trim());
    }
    throw new StepError(`not an integer: ${String(value)}`);
}

/** Prefixes/patterns for every base parseRadix knows about, used to detect a
 * literal wearing another base's prefix (e.g. "0b1010" handed to hex>dec). */
const RADIX_PREFIXES: {prefix: string; pattern: RegExp}[] = [
    {prefix: "0x", pattern: /^[0-9a-f]+$/},
    {prefix: "0b", pattern: /^[01]+$/},
    {prefix: "0o", pattern: /^[0-7]+$/},
];

function parseRadix(value: unknown, radix: 2 | 8 | 16, prefix: string, pattern: RegExp): bigint {
    if (typeof value !== "string") throw new StepError(`not a string: ${String(value)}`);
    const trimmed = value.trim().toLowerCase();
    const negative = trimmed.startsWith("-");
    const raw = negative ? trimmed.slice(1) : trimmed;

    // A string carrying a genuine foreign-base prefix (its remainder is valid
    // for that other base) is never acceptable here, even if its characters
    // would otherwise also be legal digits in this base (e.g. "0b1010" is
    // technically all valid hex digits, but it is a binary literal, not hex).
    for (const foreign of RADIX_PREFIXES) {
        if (foreign.prefix === prefix) continue;
        if (raw.startsWith(foreign.prefix) && foreign.pattern.test(raw.slice(foreign.prefix.length))) {
            throw new StepError(`not base-${radix}: ${value}`);
        }
    }

    const body = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    if (body.length === 0 || !pattern.test(body)) {
        throw new StepError(`not base-${radix}: ${value}`);
    }
    let result = 0n;
    const base = BigInt(radix);
    for (const ch of body) {
        result = result * base + BigInt(Number.parseInt(ch, radix));
    }
    return negative ? -result : result;
}

/** Render a BigInt in another base with the sign outside the prefix, e.g.
 * -255n -> "-0xff" rather than the malformed, non-round-trippable "0x-ff". */
function formatRadix(n: bigint, radix: number, prefix: string): string {
    const sign = n < 0n ? "-" : "";
    const abs = n < 0n ? -n : n;
    return `${sign}${prefix}${abs.toString(radix)}`;
}

export const STEPS: Record<string, Step> = {
    // ---- numeric base ----
    "hex>dec": {arity: 0, run: (v) => parseRadix(v, 16, "0x", /^[0-9a-f]+$/)},
    "bin>dec": {arity: 0, run: (v) => parseRadix(v, 2, "0b", /^[01]+$/)},
    "oct>dec": {arity: 0, run: (v) => parseRadix(v, 8, "0o", /^[0-7]+$/)},
    "dec>hex": {arity: 0, run: (v) => formatRadix(toInteger(v), 16, "0x")},
    "dec>bin": {arity: 0, run: (v) => formatRadix(toInteger(v), 2, "0b")},
    "dec>oct": {arity: 0, run: (v) => formatRadix(toInteger(v), 8, "0o")},

    // ---- scaling; all results are strings to preserve exactness ----
    div: {
        arity: 1,
        run: (v, [n]) => formatDec(divDec(parseDec(v), parseDec(n))),
    },
    mul: {
        arity: 1,
        run: (v, [n]) => formatDec(mulDec(parseDec(v), parseDec(n))),
    },
    fixed: {
        arity: 1,
        run: (v, [n]) => {
            // Number.parseInt("2.5", 10) === 2, so parsing with it alone would
            // silently truncate a fractional argument instead of rejecting it.
            // Requiring the raw argument to be all digits catches that, along
            // with negatives (rejected by the sign character) and a missing
            // argument (n is undefined, so String(n) is "undefined").
            const raw = String(n).trim();
            if (!/^\d+$/.test(raw)) {
                throw new StepError(`fixed requires a non-negative integer, got: ${String(n)}`);
            }
            const places = Number.parseInt(raw, 10);
            return formatFixed(roundDec(parseDec(v), places), places);
        },
    },
};

export function runStep(name: string, value: unknown, args: string[]): unknown {
    const step = STEPS[name];
    if (step == null) throw new StepError(`unknown step: ${name}`);
    return step.run(value, args);
}
