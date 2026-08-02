import {describe, expect, it} from "vitest";
import {
    CONVERSION_EDGES,
    DEFAULT_FROM,
    DEFAULT_TO_STEP,
    FROM_OPTIONS,
    conversionStepNames,
    toOptionsFor,
} from "./conversionTypes";
import {STEPS} from "./steps";

describe("conversionTypes", () => {
    // The guard the issue asks for: every step in the registry is reachable
    // through some From/To pair, except the three documented exceptions.
    // This fails loudly (rather than silently dropping a dropdown entry) if
    // a future step is added to STEPS without teaching this module its
    // from/to labels.
    it("reaches every conversion step in the registry through some From/To pair", () => {
        const exceptions = new Set(["div", "mul", "fixed"]);
        const covered = conversionStepNames();
        for (const name of Object.keys(STEPS)) {
            if (exceptions.has(name)) {
                expect(covered.has(name)).toBe(false);
            } else {
                expect(covered.has(name)).toBe(true);
            }
        }
    });

    it("covers exactly the 21 documented conversion steps", () => {
        expect(CONVERSION_EDGES).toHaveLength(21);
        expect(CONVERSION_EDGES).toHaveLength(Object.keys(STEPS).length - 3);
    });

    it("never lists div, mul, or fixed as a From or To option", () => {
        const froms = FROM_OPTIONS.map((o) => o.value);
        expect(froms).not.toContain("div");
        expect(froms).not.toContain("mul");
        expect(froms).not.toContain("fixed");
        for (const from of froms) {
            const steps = toOptionsFor(from).map((o) => o.value);
            expect(steps).not.toContain("div");
            expect(steps).not.toContain("mul");
            expect(steps).not.toContain("fixed");
        }
    });

    it("filters To options by the chosen From", () => {
        expect(toOptionsFor("hex")).toEqual([{label: "decimal", value: "hex>dec"}]);
        const decimalTargets = toOptionsFor("decimal")
            .map((o) => o.label)
            .sort();
        expect(decimalTargets).toEqual(["binary", "hex", "octal"]);
    });

    it("offers every step's To option under its From", () => {
        expect(toOptionsFor("epoch millis").map((o) => o.value).sort()).toEqual(
            ["epoch_ms>date", "ms>duration"].sort(),
        );
        expect(toOptionsFor("text").map((o) => o.value).sort()).toEqual(
            ["text>base64", "text>base64url", "text>hexbytes", "text>urlenc"].sort(),
        );
    });

    it("never offers a To option for a terminal (to-only) type", () => {
        expect(toOptionsFor("value")).toEqual([]);
        expect(toOptionsFor("claims")).toEqual([]);
        expect(toOptionsFor("nonsense")).toEqual([]);
    });

    it("defaults From/To to hex -> decimal, matching the plugin's historical default rule", () => {
        expect(DEFAULT_FROM).toBe("hex");
        expect(DEFAULT_TO_STEP).toBe("hex>dec");
    });

    it("uses human-readable labels rather than raw step syntax", () => {
        for (const option of FROM_OPTIONS) {
            expect(option.label).not.toContain(">");
        }
        for (const from of FROM_OPTIONS.map((o) => o.value)) {
            for (const option of toOptionsFor(from)) {
                expect(option.label).not.toContain(">");
            }
        }
    });
});
