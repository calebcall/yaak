import {describe, expect, it} from "vitest";
import {applyRules, serialise} from "./apply";
import {parseRules} from "./dsl";

const run = (json: unknown, text: string) => applyRules(json, parseRules(text));

describe("applyRules", () => {
    it("converts a top-level field", () => {
        const result = run({jsonrpc: "2.0", id: 83, result: "0x1879687"}, "$.result | hex>dec");
        expect(result.value).toEqual({jsonrpc: "2.0", id: 83, result: 25663111n});
        expect(result.converted).toBe(1);
    });

    it("converts every match of a recursive selector", () => {
        const json = {txs: [{value: "0x2"}, {value: "0x3"}]};
        expect(run(json, "$..value | hex>dec").converted).toBe(2);
    });

    it("replaces the document root", () => {
        expect(run('{"a":1}', "$ | json").value).toEqual({a: 1});
    });

    it("leaves a value untouched when a step rejects it", () => {
        const result = run({a: "hello", b: "0x10"}, "$..* | hex>dec");
        expect(result.value).toEqual({a: "hello", b: 16n});
        expect(result.converted).toBe(1);
    });

    it("counts zero when a selector matches nothing", () => {
        expect(run({a: 1}, "$.missing | hex>dec").converted).toBe(0);
    });

    it("throws a fatal error for an invalid selector", () => {
        expect(() => run({a: 1}, "$[( | hex>dec")).toThrow();
    });

    it("applies steps left to right", () => {
        const json = {v: "0xde0b6b3a7640000"};
        expect(run(json, "$.v | hex>dec | div 1e18").value).toEqual({v: "1"});
    });

    it("does not count a match whose step chain fails as converted", () => {
        const result = run({a: "not-hex"}, "$.a | hex>dec");
        expect(result.value).toEqual({a: "not-hex"});
        expect(result.converted).toBe(0);
    });

    it("leaves the original value untouched when a later step in the chain fails", () => {
        // hex>dec succeeds and produces a bigint; text>base64 then rejects a
        // non-string input. The original string value must survive intact,
        // not the intermediate bigint.
        const json = {v: "0x10"};
        const result = run(json, "$.v | hex>dec | text>base64");
        expect(result.value).toEqual({v: "0x10"});
        expect(result.converted).toBe(0);
    });

    it("a later rule sees replacements made by an earlier rule", () => {
        const json = {a: "0x10"};
        const result = run(json, "$.a | hex>dec\n$.a | div 2");
        expect(result.value).toEqual({a: "8"});
        expect(result.converted).toBe(2);
    });

    it("a later rule operates on the new root after root replacement", () => {
        const result = run('{"a":"0x10"}', "$ | json\n$.a | hex>dec");
        expect(result.value).toEqual({a: 16n});
        expect(result.converted).toBe(2);
    });

    it("handles object and array values passed through a step chain", () => {
        const json = {list: [1, 2, 3]};
        const result = run(json, "$.list | json");
        expect(result.value).toEqual({list: [1, 2, 3]});
        expect(result.converted).toBe(0);
    });

    it("treats a selector matching undefined-valued properties safely", () => {
        const json: Record<string, unknown> = {a: undefined, b: "0x1"};
        const result = run(json, "$.* | hex>dec");
        expect(result.converted).toBe(1);
    });

    it("returns zero matches for a null document with a root selector", () => {
        const result = run(null, "$ | json");
        expect(result.value).toBeNull();
        expect(result.matched).toBe(0);
        expect(result.converted).toBe(0);
    });

    it("returns zero matches for a null document with a deeper selector", () => {
        const result = run(null, "$.a | hex>dec");
        expect(result.value).toBeNull();
        expect(result.matched).toBe(0);
        expect(result.converted).toBe(0);
    });

    it("returns zero matches for an undefined document with a root selector", () => {
        const result = run(undefined, "$ | json");
        expect(result.value).toBeUndefined();
        expect(result.matched).toBe(0);
        expect(result.converted).toBe(0);
    });

    it("returns zero matches for an undefined document with a deeper selector", () => {
        const result = run(undefined, "$.a | hex>dec");
        expect(result.value).toBeUndefined();
        expect(result.matched).toBe(0);
        expect(result.converted).toBe(0);
    });

    it("does not crash when an earlier rule legitimately writes a null root", () => {
        // "$ | json" parses the string "null" into the primitive null and
        // writes it to the root; the second rule must then see a null
        // document and report zero matches rather than throwing.
        const result = run("null", "$ | json\n$.a | div 2");
        expect(result.value).toBeNull();
        expect(result.matched).toBe(1);
        expect(result.converted).toBe(1);
    });

    it("matched counts every selected node regardless of conversion outcome", () => {
        const allSucceed = run({a: "0x1", b: "0x2"}, "$..* | hex>dec");
        expect(allSucceed.matched).toBe(2);
        expect(allSucceed.converted).toBe(2);

        const allFail = run({a: "x", b: "y"}, "$..* | hex>dec");
        expect(allFail.matched).toBe(2);
        expect(allFail.converted).toBe(0);

        const mixed = run({a: "0x1", b: "y"}, "$..* | hex>dec");
        expect(mixed.matched).toBe(2);
        expect(mixed.converted).toBe(1);
    });
});

describe("serialise", () => {
    it("emits safe integers as JSON numbers", () => {
        expect(serialise({a: 25663111n})).toBe('{\n  "a": 25663111\n}');
    });

    it("emits oversized integers as strings", () => {
        const big = 1234567890123456789012n;
        expect(serialise({a: big})).toBe('{\n  "a": "1234567890123456789012"\n}');
    });

    it("leaves ordinary values alone", () => {
        expect(serialise({a: "x", b: true, c: null})).toContain('"a": "x"');
    });

    it("handles the exact Number.MAX_SAFE_INTEGER boundary, positive and negative", () => {
        const max = BigInt(Number.MAX_SAFE_INTEGER);
        expect(serialise({a: max})).toBe(`{\n  "a": ${Number.MAX_SAFE_INTEGER}\n}`);
        expect(serialise({a: max + 1n})).toBe(`{\n  "a": "${(max + 1n).toString()}"\n}`);
        expect(serialise({a: -max})).toBe(`{\n  "a": ${-Number.MAX_SAFE_INTEGER}\n}`);
        expect(serialise({a: -max - 1n})).toBe(`{\n  "a": "${(-max - 1n).toString()}"\n}`);
    });
});
