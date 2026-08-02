import type {Context, HttpRequest} from "@yaakapp/api";
import {describe, expect, it} from "vitest";
import {convertResponse} from "./action";
import {resolveRulesFormValues} from "./testSupport";

/**
 * Drives the real action end-to-end (dsl -> apply -> steps -> serialise) with a
 * fake ctx, returning the JSON shown in the result dialog. The two `prompt.form`
 * dialogs this action shows are disambiguated by which named input they carry
 * (mirroring action.test.ts's harness), not by call order, so the fixtures
 * can't be fooled by a reordered exchange.
 */
async function call(payload: unknown, rules: string): Promise<string> {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    let shown = "";

    const ctx = {
        httpResponse: {find: async () => [{id: "rs_1", bodyPath: "/fake/body.json"}]},
        store: {get: async () => undefined, set: async () => {}, delete: async () => true},
        prompt: {
            text: async () => null,
            form: async (args: {inputs: Array<{name?: string; defaultValue?: string}>}) => {
                // Shares action.test.ts's model of what the rules dialog
                // resolves to (see testSupport.ts) rather than maintaining a
                // second, independent fake of the same interface.
                if (args.inputs.some((i) => i.name === "rules")) return resolveRulesFormValues({rules});
                shown = args.inputs.find((i) => i.name === "result")?.defaultValue ?? "";
                return {};
            },
        },
        toast: {show: async () => {}},
    } as unknown as Context;

    await convertResponse(ctx, {id: "rq_1"} as HttpRequest, {readBody: () => body});
    return shown;
}

describe("eth_blockNumber", () => {
    it("converts the block number", async () => {
        const content = await call({jsonrpc: "2.0", id: 83, result: "0x1879687"}, "$.result | hex>dec");
        expect(JSON.parse(content).result).toBe(25663111);
    });
});

describe("eth_getBlockByNumber", () => {
    const block = {
        jsonrpc: "2.0",
        id: 1,
        result: {
            number: "0x1879687",
            timestamp: "0x67a28b40",
            gasUsed: "0x5208",
            transactions: [{value: "0xde0b6b3a7640000"}, {value: "0x6f05b59d3b20000"}],
        },
    };

    it("converts nested transaction values to ether", async () => {
        const content = await call(block, "$..transactions[*].value | hex>dec | div 1e18");
        expect(JSON.parse(content).result.transactions).toEqual([{value: "1"}, {value: "0.5"}]);
    });

    it("converts a hex timestamp through two steps", async () => {
        const content = await call(block, "$.result.timestamp | hex>dec | epoch_s>date");
        expect(JSON.parse(content).result.timestamp).toBe("2025-02-04T21:48:48Z");
    });

    it("applies several rules at once", async () => {
        const content = await call(block, "$.result.number | hex>dec\n$.result.gasUsed | hex>dec");
        const parsed = JSON.parse(content).result;
        expect(parsed.number).toBe(25663111);
        expect(parsed.gasUsed).toBe(21000);
    });
});

describe("eth_getBalance at 256-bit magnitude", () => {
    it("emits an oversized integer as a string rather than rounding it", async () => {
        const payload = {result: "0x21e19e0c9bab2400000"};
        const content = await call(payload, "$.result | hex>dec");
        expect(JSON.parse(content).result).toBe("10000000000000000000000");
    });
});

describe("a non-blockchain payload", () => {
    const header = Buffer.from('{"alg":"HS256"}').toString("base64url");
    const claims = Buffer.from('{"sub":"u_1","admin":true}').toString("base64url");

    const response = {
        createdAt: 1738705728123,
        token: `${header}.${claims}.sig`,
        meta: '{"region":"us-east-1","retries":3}',
        sizeBytes: 1536,
    };

    it("converts an epoch timestamp", async () => {
        const content = await call(response, "$.createdAt | epoch_ms>date");
        expect(JSON.parse(content).createdAt).toBe("2025-02-04T21:48:48.123Z");
    });

    it("decodes a JWT without verifying it", async () => {
        const content = await call(response, "$.token | jwt");
        expect(JSON.parse(content).token).toEqual({
            header: {alg: "HS256"},
            payload: {sub: "u_1", admin: true},
        });
    });

    it("parses an embedded JSON string", async () => {
        const content = await call(response, "$.meta | json");
        expect(JSON.parse(content).meta).toEqual({region: "us-east-1", retries: 3});
    });
});

describe("eth_getBlockByNumber batch, two levels of array nesting", () => {
    // A list of blocks, each carrying its own list of transactions -- the
    // selector has to cross two nested arrays, and each matched leaf runs
    // through a two-step chain (hex>dec, then div 1e18), before the whole
    // thing is re-serialised with the array structure intact.
    const batch = {
        jsonrpc: "2.0",
        id: 1,
        result: [
            {
                number: "0x1",
                transactions: [{value: "0xde0b6b3a7640000"}, {value: "0x6f05b59d3b20000"}],
            },
            {
                number: "0x2",
                transactions: [{value: "0x1bc16d674ec80000"}],
            },
        ],
    };

    it("converts every transaction value across every block to ether", async () => {
        const content = await call(batch, "$.result[*].transactions[*].value | hex>dec | div 1e18");
        const parsed = JSON.parse(content).result;
        expect(parsed).toEqual([
            {number: "0x1", transactions: [{value: "1"}, {value: "0.5"}]},
            {number: "0x2", transactions: [{value: "2"}]},
        ]);
    });
});

describe("256-bit magnitude nested inside an array", () => {
    // Same string-vs-number serialisation rule as the top-level balance
    // fixture above, but proven for a value that only appears once it is
    // nested inside an array element rather than sitting at the object root.
    it("keeps the oversized element a string while a same-array safe integer stays a number", async () => {
        const payload = {result: ["0x21e19e0c9bab2400000", "0x1"]};
        const content = await call(payload, "$.result[*] | hex>dec");
        const parsed = JSON.parse(content).result;
        expect(parsed).toEqual(["10000000000000000000000", 1]);
        expect(typeof parsed[0]).toBe("string");
        expect(typeof parsed[1]).toBe("number");
    });
});
