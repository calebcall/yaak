import type {Context, HttpRequest} from "@yaakapp/api";
import {describe, expect, it} from "vitest";
import {convertResponse} from "./action";

const REQUEST = {id: "rq_1", name: "block", url: "https://x"} as HttpRequest;
const RPC = JSON.stringify({jsonrpc: "2.0", id: 83, result: "0x1879687"});

/**
 * Records every side effect the action performs. The store is a real, stateful
 * Map (not just a spy) so tests can drive multiple invocations of
 * `convertResponse` against the same ctx and see earlier writes/deletes
 * reflected in later reads -- needed to test that a clear actually clears.
 */
function harness(options: {
    body?: string | null;
    rules?: string | null;
    saved?: string;
} = {}) {
    const calls = {
        toasts: [] as Array<{color?: string; message: string}>,
        formInputs: [] as unknown[],
        stored: {} as Record<string, unknown>,
        deleted: [] as string[],
        findRequestIds: [] as string[],
        shownResult: null as string | null,
    };
    const store = new Map<string, unknown>();
    if (options.saved !== undefined) store.set("rules:rq_1", options.saved);

    const ctx = {
        httpResponse: {
            find: async (args: {requestId: string; limit?: number}) => {
                calls.findRequestIds.push(args.requestId);
                return options.body === null ? [] : [{id: "rs_1", bodyPath: "/fake/body.json"}];
            },
        },
        store: {
            get: async (k: string) => store.get(k),
            set: async (k: string, v: unknown) => {
                store.set(k, v);
                calls.stored[k] = v;
            },
            delete: async (k: string) => {
                const had = store.has(k);
                store.delete(k);
                calls.deleted.push(k);
                return had;
            },
        },
        prompt: {
            text: async () => null,
            form: async (args: {inputs: unknown[]}) => {
                calls.formInputs.push(args.inputs);
                const inputs = args.inputs as Array<{name?: string; defaultValue?: string}>;
                // Distinguish the two dialogs this action shows by which named
                // input they carry, not by call order -- a test may drive
                // `convertResponse` more than once against the same harness.
                if (inputs.some((i) => i.name === "rules")) {
                    return options.rules === null ? null : {rules: options.rules ?? "$.result | hex>dec"};
                }
                const input = inputs.find((i) => i.name === "result");
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

    it("looks up the response for this request's id", async () => {
        const h = harness();
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.findRequestIds).toEqual(["rq_1"]);
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

    it("clears a previously saved rule when the submission is blank", async () => {
        const h = harness({saved: "$.saved | hex>dec", rules: "   "});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.deleted).toEqual(["rules:rq_1"]);
        expect(h.calls.toasts.some((t) => /cleared/i.test(t.message))).toBe(true);
        expect(h.calls.stored).toEqual({}); // no save attempted
        expect(h.calls.shownResult).toBeNull(); // no conversion attempted
    });

    it("clears without crashing when there was never a saved rule", async () => {
        const h = harness({rules: "   "});
        await expect(convertResponse(h.ctx, REQUEST, h.deps)).resolves.toBeUndefined();
        expect(h.calls.deleted).toEqual(["rules:rq_1"]);
        expect(h.calls.shownResult).toBeNull();
    });

    it("prefills the editor empty on the next open after a clear", async () => {
        const h = harness({saved: "$.saved | hex>dec", rules: "   "});
        await convertResponse(h.ctx, REQUEST, h.deps); // clears the saved rule
        await convertResponse(h.ctx, REQUEST, h.deps); // reopens against the same store

        const rulesPrefills = h.calls.formInputs
            .map((inputs) =>
                (inputs as Array<{name?: string; defaultValue?: string}>).find((i) => i.name === "rules"),
            )
            .filter((i): i is {name?: string; defaultValue?: string} => i != null);
        expect(rulesPrefills).toHaveLength(2);
        expect(rulesPrefills[1]?.defaultValue).toBe("");
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

    it("toasts distinctly when the response body cannot be read", async () => {
        const h = harness();
        h.deps.readBody = () => {
            throw new Error("ENOENT: no such file or directory");
        };
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.toasts[0]?.message).toMatch(/could not read/i);
        expect(h.calls.toasts[0]?.message).not.toMatch(/not valid json/i);
        expect(h.calls.shownResult).toBeNull();
    });

    it("propagates an unexpected exception that isn't from reading the body", async () => {
        const h = harness();
        h.ctx.store.set = async () => {
            throw new Error("store is unavailable");
        };
        await expect(convertResponse(h.ctx, REQUEST, h.deps)).rejects.toThrow("store is unavailable");
    });
});
