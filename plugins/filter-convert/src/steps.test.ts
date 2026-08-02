import {describe, expect, it} from "vitest";
import {StepError} from "./errors";
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

describe("scaling", () => {
    it("divides wei to ether", () => {
        expect(runStep("div", 10n ** 18n, ["1e18"])).toBe("1");
    });

    it("divides a 256-bit balance without precision loss", () => {
        expect(runStep("div", 1234567890123456789012n, ["1e18"]))
            .toBe("1234.567890123456789012");
    });

    it("divides cents to dollars", () => {
        expect(runStep("div", 1999n, ["100"])).toBe("19.99");
    });

    it("multiplies", () => {
        expect(runStep("mul", "1.5", ["100"])).toBe("150");
    });

    it("fixes decimal places, padding as needed", () => {
        expect(runStep("fixed", "1.5", ["4"])).toBe("1.5000");
    });

    it("rejects a non-numeric argument", () => {
        expect(() => runStep("div", 10n, ["abc"])).toThrow();
    });

    it("rejects division by zero", () => {
        expect(() => runStep("div", 10n, ["0"])).toThrow();
    });

    it("divides a negative dividend, placing the sign correctly", () => {
        expect(runStep("div", -100n, ["4"])).toBe("-25");
    });

    it("multiplies a negative value, placing the sign correctly", () => {
        expect(runStep("mul", "-1.5", ["100"])).toBe("-150");
    });

    it("fixes a negative value, placing the sign correctly", () => {
        expect(runStep("fixed", "-1.5", ["4"])).toBe("-1.5000");
    });

    it("rejects a non-numeric multiplier argument", () => {
        expect(() => runStep("mul", "10", ["abc"])).toThrow();
    });

    it("rejects a non-numeric value for mul", () => {
        expect(() => runStep("mul", "abc", ["10"])).toThrow();
    });

    it("rejects a negative places argument for fixed", () => {
        expect(() => runStep("fixed", "1.5", ["-1"])).toThrow();
    });

    it("rejects a non-integer places argument for fixed", () => {
        expect(() => runStep("fixed", "1.5", ["2.5"])).toThrow();
    });

    it("rejects a missing places argument for fixed", () => {
        expect(() => runStep("fixed", "1.5", [])).toThrow();
    });

    it("fixes an ordinary places value", () => {
        expect(runStep("fixed", "1.5", ["4"])).toBe("1.5000");
    });

    it("fixes at the maximum allowed places boundary", () => {
        expect(runStep("fixed", "1.5", ["10000"])).toBe(`1.5${"0".repeat(9999)}`);
    });

    it("rejects a places argument just beyond the maximum", () => {
        expect(() => runStep("fixed", "1.5", ["10001"])).toThrow(StepError);
    });

    it("rejects an absurdly large places argument without crashing", () => {
        expect(() => runStep("fixed", "1.5", ["999999999999999999999999999999"]))
            .toThrow(StepError);
    });
});

describe("time", () => {
    it("converts epoch seconds to ISO without a milliseconds part", () => {
        expect(runStep("epoch_s>date", 1738705728n, [])).toBe("2025-02-04T21:48:48Z");
    });

    it("includes milliseconds only when non-zero", () => {
        expect(runStep("epoch_ms>date", 1738705728000n, [])).toBe("2025-02-04T21:48:48Z");
        expect(runStep("epoch_ms>date", 1738705728123n, [])).toBe("2025-02-04T21:48:48.123Z");
    });

    it("converts ISO back to epoch", () => {
        expect(runStep("date>epoch_s", "2025-02-04T21:48:48Z", [])).toBe(1738705728n);
        expect(runStep("date>epoch_ms", "2025-02-04T21:48:48.123Z", [])).toBe(1738705728123n);
    });

    it("rejects an unparseable date for date>epoch_ms", () => {
        // The rejection constraint is per-step, not per-underlying-function:
        // every other rejection test in this block calls date>epoch_s, so
        // date>epoch_ms's own validation path needs direct coverage too.
        expect(() => runStep("date>epoch_ms", "not a date", [])).toThrow();
    });

    it("formats durations largest unit first, skipping zeroes", () => {
        expect(runStep("ms>duration", 3661000n, [])).toBe("1h 1m 1s");
        expect(runStep("ms>duration", 500n, [])).toBe("500ms");
        expect(runStep("ms>duration", 90061000n, [])).toBe("1d 1h 1m 1s");
        expect(runStep("ms>duration", 0n, [])).toBe("0ms");
    });

    it("rejects an unparseable date", () => {
        expect(() => runStep("date>epoch_s", "not a date", [])).toThrow();
    });

    it("rejects an out-of-range epoch", () => {
        expect(() => runStep("epoch_s>date", 10n ** 18n, [])).toThrow();
    });

    it("rejects a safe-integer epoch_ms that still exceeds Date's own range", () => {
        // Date only accepts values within +-8.64e15ms; 9e15 is a safe JS
        // number but falls outside that window, so this exercises the
        // getTime()-is-NaN guard rather than the Number.isSafeInteger guard.
        expect(() => runStep("epoch_ms>date", 9_000_000_000_000_000n, [])).toThrow();
    });

    it("floors, rather than truncates, a sub-second pre-1970 instant to epoch seconds", () => {
        // -500ms is the 1969-12-31T23:59:59 second (which spans -1000..-1ms).
        // Truncating division toward zero would give 0 (1970-01-01T00:00:00),
        // which is the wrong second entirely; flooring gives -1, the correct one.
        expect(runStep("date>epoch_s", "1969-12-31T23:59:59.500Z", [])).toBe(-1n);
    });

    it("round-trips a whole-second pre-1970 instant", () => {
        expect(runStep("date>epoch_s", "1969-12-31T23:59:59Z", [])).toBe(-1n);
    });

    it("rejects a calendar date that Date.parse would silently roll over", () => {
        // Date.parse("2025-02-30") normalizes to 2025-03-02 instead of
        // rejecting the invalid day; that would silently produce a wrong
        // epoch, so date>epoch_s must reject it outright.
        expect(() => runStep("date>epoch_s", "2025-02-30T00:00:00Z", [])).toThrow();
    });

    it("rejects an out-of-range month or day", () => {
        expect(() => runStep("date>epoch_s", "2025-13-01T00:00:00Z", [])).toThrow();
        expect(() => runStep("date>epoch_s", "2025-01-45T00:00:00Z", [])).toThrow();
    });

    it("rejects an out-of-range hour, minute or second", () => {
        expect(() => runStep("date>epoch_s", "2025-01-01T24:00:00Z", [])).toThrow(StepError);
        // A leap second: valid in real UTC, but this converter's calendar
        // math doesn't model them, so it is rejected rather than silently
        // treated as :59 or rolled into the next minute.
        expect(() => runStep("date>epoch_s", "2025-06-30T23:59:60Z", [])).toThrow(StepError);
    });

    it("rejects a bare year and a datetime with no UTC offset", () => {
        // A bare "YYYY" is too coarse to be a useful instant. A datetime with
        // no offset, e.g. "2025-02-04T00:00", resolves to host-local time per
        // spec and so is host-dependent — both are rejected. A bare
        // "YYYY-MM-DD" date, by contrast, is defined as UTC by ECMA-262 and
        // is accepted (see the "date-only ISO form" tests below).
        expect(() => runStep("date>epoch_s", "2025", [])).toThrow();
        expect(() => runStep("date>epoch_s", "2025-02-04T00:00", [])).toThrow();
    });

    describe("date-only ISO form", () => {
        it("accepts a bare calendar date as UTC midnight", () => {
            expect(runStep("date>epoch_s", "2025-02-04", [])).toBe(1738627200n);
        });

        it("still rejects an invalid calendar date in date-only form", () => {
            expect(() => runStep("date>epoch_s", "2025-02-30", [])).toThrow(StepError);
        });
    });

    describe("numeric UTC offsets", () => {
        it("treats +00:00 the same as a literal Z", () => {
            expect(runStep("date>epoch_s", "2025-02-04T21:48:48+00:00", []))
                .toBe(runStep("date>epoch_s", "2025-02-04T21:48:48Z", []));
        });

        it("applies a non-zero offset to produce the correct UTC epoch", () => {
            expect(runStep("date>epoch_s", "2025-02-04T21:48:48+05:30", [])).toBe(1738685928n);
        });

        it("rejects a malformed offset instead of silently ignoring it", () => {
            expect(() => runStep("date>epoch_s", "2025-02-04T21:48:48+25:00", [])).toThrow(StepError);
            expect(() => runStep("date>epoch_s", "2025-02-04T21:48:48+05:99", [])).toThrow(StepError);
        });
    });

    it("rejects a negative duration", () => {
        expect(() => runStep("ms>duration", -1n, [])).toThrow();
    });

    it("formats a duration spanning many days", () => {
        expect(runStep("ms>duration", 8_640_003_661_000n, [])).toBe("100000d 1h 1m 1s");
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
