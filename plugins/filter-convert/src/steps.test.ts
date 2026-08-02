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

describe("cross-prefix rejection", () => {
    it("rejects a binary literal fed to hex>dec", () => {
        expect(() => runStep("hex>dec", "0b1010", [])).toThrow();
    });

    it("rejects an octal literal fed to hex>dec", () => {
        expect(() => runStep("hex>dec", "0o17", [])).toThrow();
    });

    it("rejects a hex literal fed to bin>dec", () => {
        expect(() => runStep("bin>dec", "0x10", [])).toThrow();
    });

    it("rejects an octal literal fed to bin>dec", () => {
        expect(() => runStep("bin>dec", "0o17", [])).toThrow();
    });

    it("rejects a hex literal fed to oct>dec", () => {
        expect(() => runStep("oct>dec", "0x17", [])).toThrow();
    });

    it("rejects a binary literal fed to oct>dec", () => {
        expect(() => runStep("oct>dec", "0b11", [])).toThrow();
    });
});

describe("negative round-trips", () => {
    it("round-trips a negative value through dec>hex and hex>dec", () => {
        const rendered = runStep("dec>hex", -255n, []);
        expect(rendered).toBe("-0xff");
        expect(runStep("hex>dec", rendered, [])).toBe(-255n);
    });

    it("round-trips a negative value through dec>bin and bin>dec", () => {
        const rendered = runStep("dec>bin", -10n, []);
        expect(rendered).toBe("-0b1010");
        expect(runStep("bin>dec", rendered, [])).toBe(-10n);
    });

    it("round-trips a negative value through dec>oct and oct>dec", () => {
        const rendered = runStep("dec>oct", -493n, []);
        expect(rendered).toBe("-0o755");
        expect(runStep("oct>dec", rendered, [])).toBe(-493n);
    });
});

describe("dec>bin and dec>oct rejection", () => {
    it("rejects a non-integer for dec>bin", () => {
        expect(() => runStep("dec>bin", "1.5", [])).toThrow();
    });

    it("rejects a non-integer for dec>oct", () => {
        expect(() => runStep("dec>oct", "1.5", [])).toThrow();
    });
});

describe("toInteger safety", () => {
    it("rejects an unsafe JS number", () => {
        expect(() => runStep("dec>hex", 9007199254740993, [])).toThrow();
    });

    it("accepts the same magnitude as an integral string", () => {
        expect(runStep("dec>hex", "9007199254740993", [])).toBe("0x20000000000001");
    });

    it("accepts the same magnitude as a bigint", () => {
        expect(runStep("dec>hex", 9007199254740993n, [])).toBe("0x20000000000001");
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
