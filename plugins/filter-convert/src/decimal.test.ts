import {describe, expect, it} from "vitest";
import {divDec, formatDec, formatFixed, mulDec, parseDec, roundDec} from "./decimal";
import {StepError} from "./errors";

const d = (s: string) => parseDec(s);

describe("parseDec", () => {
    it("parses scientific notation into an integer", () => {
        expect(formatDec(d("1e18"))).toBe("1000000000000000000");
    });

    it("parses a fractional value", () => {
        expect(formatDec(d("1.50"))).toBe("1.5");
    });

    it("rejects non-numeric input", () => {
        expect(() => d("abc")).toThrow();
    });

    it("still accepts a large-but-reasonable exponent", () => {
        expect(formatDec(d("1e18"))).toBe("1000000000000000000");
    });

    it("rejects a degenerate exponent that overflows to Infinity", () => {
        expect(() => d("1e" + "9".repeat(400))).toThrow(StepError);
    });

    it("rejects a large-but-finite exponent beyond the bound", () => {
        expect(() => d("1e10001")).toThrow(StepError);
    });

    it("accepts an exponent at the bound", () => {
        expect(() => d("1e10000")).not.toThrow();
    });
});

describe("parseDec with a JS number input", () => {
    // JSON.parse turns a huge integer literal into an already-corrupted
    // double (e.g. 12345678901234567890 -> 12345678901234567000). Passing
    // that number through unchanged would launder the corruption into a
    // wrong-but-plausible result -- exactly what steps.ts's `toInteger`
    // already rejects for the numeric-base family. `parseDec` must reject
    // it the same way, since the scaling family (`div`/`mul`/`fixed`) is the
    // one output shape the README says exists specifically to preserve
    // exactness.
    it("rejects an unsafe-integer number", () => {
        expect(() => parseDec(12345678901234567890)).toThrow(StepError);
    });

    it("still accepts a safe-integer number", () => {
        expect(formatDec(parseDec(42))).toBe("42");
    });

    it("still accepts a fractional number of any reasonable size", () => {
        expect(formatDec(parseDec(1.5))).toBe("1.5");
    });

    it("still accepts the same magnitude as a string, at full precision", () => {
        expect(formatDec(parseDec("12345678901234567890"))).toBe("12345678901234567890");
    });

    it("still accepts the same magnitude as a bigint, at full precision", () => {
        expect(formatDec(parseDec(12345678901234567890n))).toBe("12345678901234567890");
    });
});

describe("divDec", () => {
    it("divides one ether of wei down to a whole number", () => {
        expect(formatDec(divDec(d("1000000000000000000"), d("1e18")))).toBe("1");
    });

    it("keeps a fractional result exact", () => {
        expect(formatDec(divDec(d("1500000000000000000"), d("1e18")))).toBe("1.5");
    });

    it("does not lose precision on a 256-bit value", () => {
        const wei = "1234567890123456789012345678901234567890";
        expect(formatDec(divDec(d(wei), d("1e18"))))
            .toBe("1234567890123456789012.34567890123456789");
    });
});

describe("mulDec", () => {
    it("multiplies exactly", () => {
        expect(formatDec(mulDec(d("1.5"), d("100")))).toBe("150");
    });
});

describe("roundDec and formatFixed", () => {
    it("rounds half up", () => {
        expect(formatFixed(roundDec(d("1.005"), 2), 2)).toBe("1.01");
    });

    it("pads to the requested places", () => {
        expect(formatFixed(roundDec(d("1.5"), 4), 4)).toBe("1.5000");
    });

    it("keeps negatives correct", () => {
        expect(formatFixed(roundDec(d("-1.005"), 2), 2)).toBe("-1.01");
    });

    it("rejects negative places", () => {
        expect(() => roundDec(d("1.2345"), -1)).toThrow(StepError);
    });

    it("rejects non-integer places", () => {
        expect(() => roundDec(d("1.2345"), 1.5)).toThrow(StepError);
    });
});
