import {describe, expect, it} from "vitest";
import {parseRules} from "./dsl";

describe("parseRules", () => {
    it("parses a selector and a single step", () => {
        expect(parseRules("$.result | hex>dec")).toEqual([
            {selector: "$.result", steps: [{name: "hex>dec", args: []}]},
        ]);
    });

    it("parses a chain with arguments", () => {
        expect(parseRules("$..value | hex>dec | div 1e18 | fixed 4")).toEqual([
            {
                selector: "$..value",
                steps: [
                    {name: "hex>dec", args: []},
                    {name: "div", args: ["1e18"]},
                    {name: "fixed", args: ["4"]},
                ],
            },
        ]);
    });

    it("does not split on || inside a filter expression", () => {
        const rules = parseRules("$.items[?(@.a || @.b)] | hex>dec");
        expect(rules[0]?.selector).toBe("$.items[?(@.a || @.b)]");
        expect(rules[0]?.steps).toEqual([{name: "hex>dec", args: []}]);
    });

    it("does not split on a pipe inside single quotes", () => {
        expect(parseRules("$['a|b'] | hex>dec")[0]?.selector).toBe("$['a|b']");
    });

    it("does not split on a pipe inside double quotes", () => {
        expect(parseRules('$["a|b"] | hex>dec')[0]?.selector).toBe('$["a|b"]');
    });

    it("does not split on || inside a nested bracket filter expression", () => {
        const rules = parseRules(
            "$.items[?(@.tags[0] == 'x' || @.tags[1] == 'y')] | hex>dec",
        );
        expect(rules[0]?.selector).toBe("$.items[?(@.tags[0] == 'x' || @.tags[1] == 'y')]");
        expect(rules[0]?.steps).toEqual([{name: "hex>dec", args: []}]);
    });

    it("treats a backslash inside quotes as escaping the next character", () => {
        const rules = parseRules("$['a\\'b'] | hex>dec");
        expect(rules[0]?.selector).toBe("$['a\\'b']");
        expect(rules[0]?.steps).toEqual([{name: "hex>dec", args: []}]);
    });

    it("ignores blank lines and comments", () => {
        const text = "# a comment\n\n$.a | hex>dec\n\n  # another\n$.b | json\n";
        expect(parseRules(text)).toHaveLength(2);
    });

    it("parses multiple rules", () => {
        expect(parseRules("$.a | hex>dec\n$.b | jwt")).toHaveLength(2);
    });

    it("rejects a rule with no pipe", () => {
        expect(() => parseRules("$.result")).toThrow(/no step/i);
    });

    it("rejects an unknown step", () => {
        expect(() => parseRules("$.a | nope")).toThrow(/unknown step/i);
    });

    it("rejects wrong arity", () => {
        expect(() => parseRules("$.a | div")).toThrow(/expects 1 argument/i);
        expect(() => parseRules("$.a | hex>dec 5")).toThrow(/expects 0 arguments/i);
    });

    it("rejects an empty selector", () => {
        expect(() => parseRules(" | hex>dec")).toThrow(/empty selector/i);
    });

    it("returns no rules for empty input", () => {
        expect(parseRules("   \n  \n")).toEqual([]);
    });

    it("rejects a rule with a trailing pipe and no step after it", () => {
        expect(() => parseRules("$.a | hex>dec |")).toThrow(/empty step/i);
    });

    it("rejects consecutive top-level pipes with nothing between them", () => {
        expect(() => parseRules("$.a || hex>dec")).toThrow(/empty step/i);
    });

    it("rejects unbalanced brackets in the selector", () => {
        expect(() => parseRules("$[( | hex>dec")).toThrow(/unbalanced/i);
    });

    it("rejects an unterminated quote in the selector", () => {
        expect(() => parseRules("$['a | hex>dec")).toThrow(/unterminated quote/i);
    });
});
