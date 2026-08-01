import type {Context, HttpRequest} from "@yaakapp/api";
import {describe, expect, it} from "vitest";
import {generatePython} from "./generate";
import {plugin} from "./index";

function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
    return {
        model: "http_request",
        id: "rq_1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        workspaceId: "wk_1",
        folderId: null,
        authentication: {},
        authenticationType: null,
        body: {},
        bodyType: null,
        description: "",
        headers: [],
        method: "POST",
        name: "req",
        sortPriority: 0,
        url: "https://api.example.com/things",
        urlParameters: [],
        ...overrides,
    };
}

/** Records what the action did, and what it asked Yaak to render. */
function fakeContext(rendered: HttpRequest) {
    const calls = {
        copied: null as string | null,
        toasts: [] as unknown[],
        renderPurpose: null as string | null,
    };
    const ctx = {
        clipboard: {
            copyText: async (text: string) => {
                calls.copied = text;
            },
        },
        toast: {
            show: async (args: unknown) => {
                calls.toasts.push(args);
            },
        },
        httpRequest: {
            render: async (args: {purpose: string}) => {
                calls.renderPurpose = args.purpose;
                return rendered;
            },
        },
    } as unknown as Context;
    return {ctx, calls};
}

const action = plugin.httpRequestActions![0]!;

describe("plugin definition", () => {
    it("registers exactly one HTTP request action", () => {
        expect(plugin.httpRequestActions).toHaveLength(1);
    });

    it("exposes the Copy as Python action with a selectable handler", () => {
        expect(action.label).toBe("Copy as Python");
        expect(typeof action.onSelect).toBe("function");
    });

    it("uses the copy icon rather than the generic info icon", () => {
        expect(action.icon).toBe("copy");
    });
});

describe("Copy as Python action", () => {
    it("copies exactly what the generator produces", async () => {
        const httpRequest = request({
            bodyType: "graphql",
            body: {query: "query {\n  me\n}", variables: ""},
        });
        const {ctx, calls} = fakeContext(httpRequest);

        await action.onSelect(ctx, {httpRequest});

        expect(calls.copied).toBe(generatePython(httpRequest, httpRequest));
        expect(calls.copied).toContain("query {\\n  me\\n}");
    });

    it("renders with send semantics so template values are resolved", async () => {
        const httpRequest = request();
        const {ctx, calls} = fakeContext(httpRequest);

        await action.onSelect(ctx, {httpRequest});

        expect(calls.renderPurpose).toBe("send");
    });

    it("confirms the copy with a success toast", async () => {
        const httpRequest = request();
        const {ctx, calls} = fakeContext(httpRequest);

        await action.onSelect(ctx, {httpRequest});

        expect(calls.toasts).toEqual([
            {color: "success", message: "Copied python snippet to clipboard"},
        ]);
    });
});
