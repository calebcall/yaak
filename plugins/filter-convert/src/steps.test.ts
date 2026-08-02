import {describe, expect, it} from "vitest";
import {STEPS, runStep} from "./steps";

describe("hex>dec", () => {
    it("converts a prefixed hex quantity", () => {
        expect(runStep("hex>dec", "0x1879687", [])).toBe(25663111n);
    });

    it("accepts bare hex", () => {
        expect(runStep("hex>dec", "ff", [])).toBe(255n);
    });

    it("keeps 256-bit values exact", () => {
        expect(runStep("hex>dec", `0x${"f".repeat(64)}`, [])).toBe(2n ** 256n - 1n);
    });

    it("rejects a non-hex string", () => {
        expect(() => runStep("hex>dec", "hello", [])).toThrow();
    });
});

describe("dec>hex", () => {
    it("converts and lowercases", () => {
        expect(runStep("dec>hex", 25663111n, [])).toBe("0x1879687");
    });

    it("rejects a non-integer", () => {
        expect(() => runStep("dec>hex", "1.5", [])).toThrow();
    });
});

describe("bin and oct", () => {
    it("round-trips binary", () => {
        expect(runStep("bin>dec", "0b1010", [])).toBe(10n);
        expect(runStep("dec>bin", 10n, [])).toBe("0b1010");
    });

    it("round-trips octal", () => {
        expect(runStep("oct>dec", "0o755", [])).toBe(493n);
        expect(runStep("dec>oct", 493n, [])).toBe("0o755");
    });

    it("rejects digits outside the base", () => {
        expect(() => runStep("bin>dec", "0b12", [])).toThrow();
        expect(() => runStep("oct>dec", "0o89", [])).toThrow();
    });
});

describe("registry", () => {
    it("rejects an unknown step", () => {
        expect(() => runStep("nope", "x", [])).toThrow(/unknown step/i);
    });

    it("declares arity for every registered step", () => {
        for (const [name, step] of Object.entries(STEPS)) {
            expect(typeof step.arity, name).toBe("number");
        }
    });
});
