import {describe, expect, it} from "vitest";
import {divDec, formatDec, formatFixed, mulDec, parseDec, roundDec} from "./decimal";

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
});
