import {StepError} from "./errors";

/** value = (neg ? -1 : 1) * digits / 10n ** BigInt(scale); scale is always >= 0 */
export type Dec = {neg: boolean; digits: bigint; scale: number};

const DEC_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/**
 * Bounds the exponent accepted by `parseDec`. `10n ** BigInt(exponent)` is computed
 * eagerly to normalise the value, so an unbounded exponent (e.g. a hostile response
 * body) could force an astronomically large BigInt allocation. 10,000 comfortably
 * covers real-world magnitudes (1e18 wei, ~1e77 for a 256-bit integer) while keeping
 * that allocation cheap.
 */
const MAX_EXPONENT = 10_000;

export function parseDec(input: unknown): Dec {
    if (typeof input === "bigint") {
        return {neg: input < 0n, digits: input < 0n ? -input : input, scale: 0};
    }
    const text = typeof input === "number" ? String(input) : input;
    if (typeof text !== "string") throw new StepError(`not a number: ${String(input)}`);

    const m = DEC_PATTERN.exec(text.trim());
    if (m == null) throw new StepError(`not a number: ${text}`);

    const frac = m[3] ?? "";
    const exponent = m[4] != null ? Number.parseInt(m[4], 10) : 0;
    if (!Number.isFinite(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
        throw new StepError(`exponent out of range: ${m[4]}`);
    }
    let digits = BigInt((m[2] ?? "0") + frac);
    let scale = frac.length - exponent;
    if (scale < 0) {
        digits *= 10n ** BigInt(-scale);
        scale = 0;
    }
    return {neg: m[1] === "-", digits, scale};
}

export function mulDec(a: Dec, b: Dec): Dec {
    return {neg: a.neg !== b.neg, digits: a.digits * b.digits, scale: a.scale + b.scale};
}

/** Half-up division. `precision` caps non-terminating quotients such as 1/3. */
export function divDec(a: Dec, b: Dec, precision = 30): Dec {
    if (b.digits === 0n) throw new StepError("division by zero");
    const numerator = a.digits * 10n ** BigInt(b.scale + precision);
    const denominator = b.digits * 10n ** BigInt(a.scale);
    const digits = halfUp(numerator, denominator);
    return {neg: a.neg !== b.neg, digits, scale: precision};
}

export function roundDec(d: Dec, places: number): Dec {
    if (!Number.isInteger(places) || places < 0) {
        throw new StepError(`places must be a non-negative integer: ${places}`);
    }
    if (places >= d.scale) {
        return {...d, digits: d.digits * 10n ** BigInt(places - d.scale), scale: places};
    }
    const divisor = 10n ** BigInt(d.scale - places);
    return {neg: d.neg, digits: halfUp(d.digits, divisor), scale: places};
}

function halfUp(numerator: bigint, denominator: bigint): bigint {
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;
    return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export function formatDec(d: Dec): string {
    let text = withPoint(d.digits, d.scale);
    if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
    return d.neg && /[1-9]/.test(text) ? `-${text}` : text;
}

export function formatFixed(d: Dec, places: number): string {
    const rounded = roundDec(d, places);
    const text = withPoint(rounded.digits, places);
    return rounded.neg && /[1-9]/.test(text) ? `-${text}` : text;
}

function withPoint(digits: bigint, scale: number): string {
    if (scale === 0) return digits.toString();
    const padded = digits.toString().padStart(scale + 1, "0");
    return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}
