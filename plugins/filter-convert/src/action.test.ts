import type {Context, HttpRequest} from "@yaakapp/api";
import {describe, expect, it} from "vitest";
import {convertResponse} from "./action";

const REQUEST = {id: "rq_1", name: "block", url: "https://x"} as HttpRequest;
const RPC = JSON.stringify({jsonrpc: "2.0", id: 83, result: "0x1879687"});

/** Records every side effect the action performs. */
function harness(options: {
    body?: string | null;
    rules?: string | null;
    saved?: string;
} = {}) {
    const calls = {
        toasts: [] as Array<{color?: string; message: string}>,
        formInputs: [] as unknown[],
        stored: {} as Record<string, unknown>,
        shownResult: null as string | null,
        formCount: 0,
    };
    const ctx = {
        httpResponse: {
            find: async () =>
                options.body === null ? [] : [{id: "rs_1", bodyPath: "/fake/body.json"}],
        },
        store: {
            get: async (k: string) => (k === "rules:rq_1" ? options.saved : undefined),
            set: async (k: string, v: unknown) => {
                calls.stored[k] = v;
            },
            delete: async () => true,
        },
        prompt: {
            text: async () => null,
            form: async (args: {inputs: unknown[]}) => {
                calls.formCount += 1;
                calls.formInputs.push(args.inputs);
                // First call collects rules; second call displays the result.
                if (calls.formCount === 1) {
                    return options.rules === null ? null : {rules: options.rules ?? "$.result | hex>dec"};
                }
                const input = (args.inputs as Array<{name?: string; defaultValue?: string}>)
                    .find((i) => i.name === "result");
                calls.shownResult = input?.defaultValue ?? null;
                return {};
            },
        },
        toast: {show: async (t: {color?: string; message: string}) => void calls.toasts.push(t)},
    } as unknown as Context;

    const deps = {readBody: () => options.body ?? RPC};
    return {ctx, deps, calls};
}

describe("convertResponse", () => {
    it("shows the converted body in the result dialog", async () => {
        const h = harness();
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(JSON.parse(h.calls.shownResult!)).toEqual({jsonrpc: "2.0", id: 83, result: 25663111});
    });

    it("saves the rules against the request id", async () => {
        const h = harness();
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.stored["rules:rq_1"]).toBe("$.result | hex>dec");
    });

    it("prefills the editor with the rules saved for this request", async () => {
        const h = harness({saved: "$.saved | hex>dec"});
        await convertResponse(h.ctx, REQUEST, h.deps);
        const first = h.calls.formInputs[0] as Array<{name?: string; defaultValue?: string}>;
        expect(first.find((i) => i.name === "rules")?.defaultValue).toBe("$.saved | hex>dec");
    });

    it("offers the rules editor with JSON-free plain text and a gutter", async () => {
        const h = harness();
        await convertResponse(h.ctx, REQUEST, h.deps);
        const first = h.calls.formInputs[0] as Array<{name?: string; type?: string; language?: string; hideGutter?: boolean}>;
        const rules = first.find((i) => i.name === "rules");
        expect(rules?.type).toBe("editor");
        expect(rules?.language).not.toBe("json");
        expect(rules?.hideGutter).not.toBe(true);
    });

    it("does nothing when the dialog is cancelled", async () => {
        const h = harness({rules: null});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.shownResult).toBeNull();
        expect(h.calls.stored).toEqual({});
    });

    it("does nothing when the submitted rules are blank", async () => {
        const h = harness({rules: "   "});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.shownResult).toBeNull();
        expect(h.calls.stored).toEqual({});
        expect(h.calls.toasts).toEqual([]);
    });

    it("toasts and stops when the request has no stored response", async () => {
        const h = harness({body: null});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.toasts[0]?.message).toMatch(/no response/i);
        expect(h.calls.shownResult).toBeNull();
    });

    it("toasts and stops when the body is not JSON", async () => {
        const h = harness({body: "not json"});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.toasts[0]?.message).toMatch(/not valid JSON/i);
        expect(h.calls.shownResult).toBeNull();
    });

    it("toasts the parse error for a malformed rule", async () => {
        const h = harness({rules: "$.result | nope"});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.toasts[0]?.message).toMatch(/unknown step/i);
        expect(h.calls.shownResult).toBeNull();
    });

    it("keeps the typed rules for next time even when they fail to parse", async () => {
        const h = harness({rules: "$.result | nope"});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.stored["rules:rq_1"]).toBe("$.result | nope");
    });

    it("still shows the result but warns when nothing matched", async () => {
        const h = harness({rules: "$.nowhere | hex>dec"});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.shownResult).not.toBeNull();
        expect(h.calls.toasts.some((t) => /no values matched/i.test(t.message))).toBe(true);
    });

    it("still shows the result but warns when matches could not be converted", async () => {
        const h = harness({rules: "$.jsonrpc | hex>dec"});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.shownResult).not.toBeNull();
        expect(
            h.calls.toasts.some((t) => /matched 1 value.*none could be converted/i.test(t.message)),
        ).toBe(true);
    });

    it("strips a BOM before parsing", async () => {
        const h = harness({body: `\uFEFF${RPC}`});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(JSON.parse(h.calls.shownResult!).result).toBe(25663111);
    });
});
