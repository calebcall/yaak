import {describe, expect, it} from "vitest";
import {parseRules} from "./dsl";
import {RuleError} from "./errors";

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

    it("rejects unbalanced brackets in the selector (unclosed)", () => {
        const line = "$[( | hex>dec";
        expect(() => parseRules(line)).toThrow(RuleError);
        expect(() => parseRules(line)).toThrow(/unbalanced/i);
        expect(() => parseRules(line)).toThrow(line);
    });

    it("rejects unbalanced brackets in the selector (depth goes negative)", () => {
        const line = "$.a] | hex>dec";
        expect(() => parseRules(line)).toThrow(RuleError);
        expect(() => parseRules(line)).toThrow(/unbalanced/i);
        expect(() => parseRules(line)).toThrow(line);
    });

    it("rejects an unterminated quote in the selector", () => {
        const line = "$['a | hex>dec";
        expect(() => parseRules(line)).toThrow(RuleError);
        expect(() => parseRules(line)).toThrow(/unterminated quote/i);
        expect(() => parseRules(line)).toThrow(line);
    });

    // Known, accepted limitation -- NOT an oversight. splitTopLevel tracks
    // bracket/paren nesting with a plain depth counter, not a JSONPath
    // grammar. `$.a(` opens depth 1 and `)` closes it back to 0 before the
    // *second* pipe is reached, so from the splitter's point of view the
    // first pipe is "inside a paren" and the intended selector/step boundary
    // is absorbed into the selector text instead. The parser cannot tell
    // this apart from a real, intentional balanced sub-expression, and full
    // JSONPath validation is out of scope for a pipe-splitter. This is safe
    // rather than silently wrong: `|` is not valid JSONPath outside a filter
    // expression, so jsonpath-plus returns an empty match set for the
    // mangled selector (rather than throwing), and Task 12 reports "No
    // values were converted -- check the selector". If this test's expected
    // output ever changes, it means splitTopLevel's behavior changed and
    // this documented boundary needs to be re-reviewed, not just updated.
    it("documents a known limitation: a balanced paren before the intended separator absorbs that pipe", () => {
        const rules = parseRules("$.a( | hex>dec ) | fixed 2");
        expect(rules[0]?.selector).toBe("$.a( | hex>dec )");
        expect(rules[0]?.steps).toEqual([{name: "fixed", args: ["2"]}]);
    });
});
