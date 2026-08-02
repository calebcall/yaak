import {StepError} from "./errors";
import {divDec, formatDec, formatFixed, mulDec, parseDec, roundDec} from "./decimal";

export type Step = {
    arity: number;
    run(value: unknown, args: string[]): unknown;
};

/** Mirrors decimal.ts's MAX_EXPONENT: a four-figure decimal-places cap is far
 * beyond any legitimate use, and keeps `fixed`'s `10n ** BigInt(places)` cheap. */
const MAX_PLACES = 10_000;

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

/** ISO 8601 in UTC, omitting the milliseconds component when it is zero. */
function isoFromMs(ms: bigint): string {
    const asNumber = Number(ms);
    if (!Number.isSafeInteger(asNumber)) throw new StepError(`timestamp out of range: ${ms}`);
    const date = new Date(asNumber);
    // Date only represents +-8.64e15ms; a value can be a safe JS number
    // (up to ~9.007e15) and still fall outside that window, in which case
    // the Date is invalid and getTime() is NaN.
    if (Number.isNaN(date.getTime())) throw new StepError(`timestamp out of range: ${ms}`);
    const iso = date.toISOString();
    return iso.endsWith(".000Z") ? `${iso.slice(0, -5)}Z` : iso;
}

/** Strict ISO 8601 date-only form: "YYYY-MM-DD". ECMA-262 defines this shape
 * as UTC (unlike a bare "YYYY-MM-DDTHH:mm" with no offset, which resolves to
 * host-local time and so is deliberately rejected below), and it is the most
 * common date shape in real JSON payloads, so it is accepted on its own. */
const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict ISO 8601 UTC instant: "YYYY-MM-DDTHH:mm:ss(.sss)(Z|+HH:MM|-HH:MM)".
 * An explicit offset (literal "Z" or a numeric "+HH:MM"/"-HH:MM") is
 * mandatory, so date>epoch_s/date>epoch_ms never have to guess at a
 * datetime's meaning the way a bare "YYYY-MM-DDTHH:mm" (host-local time)
 * would force them to. */
const ISO_INSTANT =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
    if (month === 2) {
        const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        return leap ? 29 : 28;
    }
    return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] as number;
}

/** Validate year/month/day by hand rather than trusting Date.UTC, which
 * silently rolls an invalid calendar date over into a different, valid one
 * (e.g. "2025-02-30" becomes 2025-03-02) instead of rejecting it. */
function assertValidCalendarDate(year: number, month: number, day: number, value: string): void {
    if (month < 1 || month > 12) throw new StepError(`invalid month: ${value}`);
    if (day < 1 || day > daysInMonth(year, month)) throw new StepError(`invalid day: ${value}`);
}

/** Parse a strict ISO date or instant string to milliseconds since the epoch.
 *
 * Date.parse is lenient and implementation-defined for anything short of a
 * full instant, so parsing is done entirely by hand from a matched regex:
 * every field (calendar date, time-of-day, UTC offset) is range-checked
 * before Date.UTC ever sees it, so its silent-overflow behaviour never gets
 * a chance to fire. */
function msFromDate(value: unknown): bigint {
    if (typeof value !== "string") throw new StepError(`not a date string: ${String(value)}`);
    const trimmed = value.trim();

    const dateOnly = ISO_DATE_ONLY.exec(trimmed);
    if (dateOnly != null) {
        const year = Number(dateOnly[1]);
        const month = Number(dateOnly[2]);
        const day = Number(dateOnly[3]);
        assertValidCalendarDate(year, month, day, value);
        return BigInt(Date.UTC(year, month - 1, day));
    }

    const match = ISO_INSTANT.exec(trimmed);
    if (match == null) throw new StepError(`not an ISO 8601 date: ${value}`);
    // Groups 1-6 are always present when the regex matches. Group 7
    // (fractional seconds) is optional; groups 8-10 (offset sign/hour/minute)
    // are present only for a numeric offset, absent for a literal "Z".
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const ms = match[7] == null ? 0 : Number(match[7]);
    assertValidCalendarDate(year, month, day, value);
    if (hour > 23 || minute > 59 || second > 59) throw new StepError(`invalid time: ${value}`);

    let offsetMs = 0n;
    const offsetSign = match[8];
    if (offsetSign != null) {
        const offsetHour = Number(match[9]);
        const offsetMinute = Number(match[10]);
        if (offsetHour > 23 || offsetMinute > 59) {
            throw new StepError(`invalid UTC offset: ${value}`);
        }
        const magnitude = BigInt(offsetHour) * 3_600_000n + BigInt(offsetMinute) * 60_000n;
        offsetMs = offsetSign === "-" ? -magnitude : magnitude;
    }

    // Date.UTC treats the fields as if they were already UTC; a positive
    // offset means the local clock reads ahead of UTC, so the true UTC
    // instant is earlier by that amount (and vice versa for a negative one).
    return BigInt(Date.UTC(year, month - 1, day, hour, minute, second, ms)) - offsetMs;
}

/** BigInt division that rounds toward negative infinity (floor), not toward
 * zero. `date>epoch_s` truncates sub-second precision by design, so it must
 * floor: for a negative instant like -500ms (1969-12-31T23:59:59.500Z),
 * truncating division gives 0 (1970-01-01T00:00:00 — the wrong second
 * entirely), while flooring gives -1 (1969-12-31T23:59:59 — the second the
 * instant actually falls in). `divisor` is always the positive 1000n here. */
function floorDivBigInt(dividend: bigint, divisor: bigint): bigint {
    const quotient = dividend / divisor;
    const remainder = dividend % divisor;
    return remainder !== 0n && (remainder < 0n) !== (divisor < 0n) ? quotient - 1n : quotient;
}

const DURATION_UNITS: Array<[label: string, ms: bigint]> = [
    ["d", 86_400_000n],
    ["h", 3_600_000n],
    ["m", 60_000n],
    ["s", 1000n],
];

function toText(value: unknown): string {
    if (typeof value !== "string") throw new StepError(`not a string: ${String(value)}`);
    return value;
}

/** Buffer.from tolerates malformed padding ("QQ=" decodes the same as "QQ=="
 * or "QQ") and silently drops whitespace/newlines and non-alphabet junk
 * instead of failing on them. Locking the shape down to exactly two
 * legitimate forms -- fully padded, or fully unpadded -- rejects that
 * garbage before it ever reaches Buffer.from, while still accepting either
 * padding convention as a genuine encoding. */
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/;
const BASE64URL_PATTERN = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}(?:==)?|[A-Za-z0-9_-]{3}=?)?$/;

/** Buffer.from is lenient about junk; round-trip to prove the input was really valid. */
function decodeStrict(value: unknown, encoding: "base64" | "base64url" | "hex"): string {
    const text = toText(value);
    const stripped = text.toLowerCase().startsWith("0x") && encoding === "hex" ? text.slice(2) : text;
    // Buffer.toString("hex") is always lowercase, so normalise before round-tripping
    const body = encoding === "hex" ? stripped.toLowerCase() : stripped;

    const pattern = encoding === "base64" ? BASE64_PATTERN : encoding === "base64url" ? BASE64URL_PATTERN : null;
    if (pattern != null && !pattern.test(body)) {
        throw new StepError(`not valid ${encoding}: ${text}`);
    }

    const buffer = Buffer.from(body, encoding);
    if (buffer.toString(encoding).replace(/=+$/, "") !== body.replace(/=+$/, "")) {
        throw new StepError(`not valid ${encoding}: ${text}`);
    }

    // Buffer#toString("utf8") silently substitutes U+FFFD for bytes that
    // aren't valid UTF-8 rather than failing, which would otherwise make
    // this plugin hand back a value that looks plausible but isn't what the
    // bytes actually contained. Re-encoding the decoded text and comparing
    // against the original bytes catches that: a genuine U+FFFD present in
    // the source round-trips back to itself, but a replacement introduced
    // to paper over invalid bytes does not.
    const decoded = buffer.toString("utf8");
    if (!Buffer.from(decoded, "utf8").equals(buffer)) {
        throw new StepError(`decoded ${encoding} is not valid utf-8 text: ${text}`);
    }
    return decoded;
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
            // roundDec computes 10n ** BigInt(places), so an unbounded places
            // (e.g. from a hostile response body) could throw a raw RangeError
            // or build a huge string instead of the StepError callers expect.
            // Mirror decimal.ts's MAX_EXPONENT bound for the same reason.
            if (places > MAX_PLACES) {
                throw new StepError(`fixed places too large (max ${MAX_PLACES}): ${raw}`);
            }
            return formatFixed(roundDec(parseDec(v), places), places);
        },
    },

    // ---- time ----
    "epoch_s>date": {arity: 0, run: (v) => isoFromMs(toInteger(v) * 1000n)},
    "epoch_ms>date": {arity: 0, run: (v) => isoFromMs(toInteger(v))},
    "date>epoch_s": {arity: 0, run: (v) => floorDivBigInt(msFromDate(v), 1000n)},
    "date>epoch_ms": {arity: 0, run: (v) => msFromDate(v)},
    "ms>duration": {
        arity: 0,
        run: (v) => {
            let remaining = toInteger(v);
            if (remaining < 0n) throw new StepError(`negative duration: ${remaining}`);
            const parts: string[] = [];
            for (const [label, size] of DURATION_UNITS) {
                const count = remaining / size;
                if (count > 0n) {
                    parts.push(`${count}${label}`);
                    remaining %= size;
                }
            }
            if (remaining > 0n || parts.length === 0) parts.push(`${remaining}ms`);
            return parts.join(" ");
        },
    },

    // ---- encoding; bare names decode, text>x encodes ----
    base64: {arity: 0, run: (v) => decodeStrict(v, "base64")},
    base64url: {arity: 0, run: (v) => decodeStrict(v, "base64url")},
    hexbytes: {arity: 0, run: (v) => decodeStrict(v, "hex")},
    urlenc: {
        arity: 0,
        run: (v) => {
            try {
                return decodeURIComponent(toText(v));
            } catch {
                throw new StepError(`not valid url encoding: ${String(v)}`);
            }
        },
    },
    "text>base64": {arity: 0, run: (v) => Buffer.from(toText(v), "utf8").toString("base64")},
    "text>base64url": {arity: 0, run: (v) => Buffer.from(toText(v), "utf8").toString("base64url")},
    "text>hexbytes": {arity: 0, run: (v) => `0x${Buffer.from(toText(v), "utf8").toString("hex")}`},
    "text>urlenc": {
        arity: 0,
        run: (v) => {
            // encodeURIComponent throws a native URIError on a lone
            // surrogate (a realistic input: JSON.parse('"\ud800"') is valid
            // JSON), which must not escape as anything but a StepError.
            try {
                return encodeURIComponent(toText(v));
            } catch {
                throw new StepError(`not valid text for url encoding: ${String(v)}`);
            }
        },
    },
};

export function runStep(name: string, value: unknown, args: string[]): unknown {
    const step = STEPS[name];
    if (step == null) throw new StepError(`unknown step: ${name}`);
    return step.run(value, args);
}
