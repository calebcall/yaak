import type {HttpRequest} from "@yaakapp/api";
import {describe, expect, it} from "vitest";
import {generatePython} from "./generate";
import {hasPython, pythonSyntaxError, undefinedNames} from "./testing/python";

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
        method: "GET",
        name: "req",
        sortPriority: 0,
        url: "https://api.example.com/things",
        urlParameters: [],
        ...overrides,
    };
}

/** Every snippet the generator emits must parse as Python and define what it uses. */
function expectRunnable(code: string) {
    if (!hasPython) return;
    expect(pythonSyntaxError(code)).toBeNull();
    expect(undefinedNames(code)).toEqual([]);
}

describe("shapes that already worked", () => {
    it("emits a bare GET", () => {
        const code = generatePython(request());
        expect(code).toBe(
            [
                "import requests",
                "",
                "url = 'https://api.example.com/things'",
                "",
                "response = requests.get(url)",
                "print(response.text)",
            ].join("\n"),
        );
        expectRunnable(code);
    });

    it("emits a JSON POST with headers", () => {
        const code = generatePython(
            request({
                method: "POST",
                bodyType: "application/json",
                body: {text: '{"a":1,"b":[1,2],"c":null}'},
                headers: [{name: "Content-Type", value: "application/json"}],
            }),
        );
        expect(code).toContain("payload = {'a': 1, 'b': [1, 2], 'c': None}");
        expect(code).toContain("response = requests.post(url, headers=headers, json=payload)");
        expectRunnable(code);
    });

    it("emits basic auth as a credentials tuple", () => {
        const code = generatePython(
            request({authenticationType: "basic", authentication: {username: "u", password: "p"}}),
        );
        expect(code).toContain("auth=('u', 'p')");
        expectRunnable(code);
    });

    it("emits multipart files and lets requests set the boundary", () => {
        const code = generatePython(
            request({
                method: "POST",
                bodyType: "multipart/form-data",
                body: {form: [{name: "f", file: "/tmp/a.txt"}]},
                headers: [{name: "Content-Type", value: "multipart/form-data"}],
            }),
        );
        expect(code).toContain("files = { 'f': ('a.txt', open('/tmp/a.txt', 'rb')) }");
        expect(code).not.toContain("multipart/form-data'}");
        expectRunnable(code);
    });
});

describe("defect 1: strings containing newlines", () => {
    it("escapes a multi-line GraphQL query", () => {
        const code = generatePython(
            request({
                method: "POST",
                bodyType: "graphql",
                body: {query: "query {\n  me\n}", variables: '{"a":1}'},
            }),
        );
        expect(code).toContain("\\n");
        expect(code.split("\n").filter((l) => l.startsWith("payload = "))).toHaveLength(1);
        expectRunnable(code);
    });

    it("escapes a multi-line raw body", () => {
        const code = generatePython(
            request({
                method: "POST",
                bodyType: "other",
                body: {text: "<root>\n  <a>1</a>\n</root>"},
                headers: [{name: "Content-Type", value: "application/xml"}],
            }),
        );
        expectRunnable(code);
    });

    it("escapes a JSON body that fails to parse", () => {
        const code = generatePython(
            request({
                method: "POST",
                bodyType: "application/json",
                body: {text: '{\n  "a": 1,\n}'},
                headers: [{name: "Content-Type", value: "application/json"}],
            }),
        );
        expectRunnable(code);
    });

    it("escapes newlines, tabs and quotes in header values", () => {
        const code = generatePython(
            request({headers: [{name: "X-Note", value: "line1\nline2\t'q'\\z"}]}),
        );
        expect(code).toContain("\\n");
        expect(code).toContain("\\t");
        expectRunnable(code);
    });
});

describe("defect 2: payload referenced but never assigned", () => {
    it("omits json=payload for a GET with a JSON content-type and no body", () => {
        const code = generatePython(
            request({headers: [{name: "Content-Type", value: "application/json"}]}),
        );
        expect(code).not.toContain("payload");
        expectRunnable(code);
    });

    it("omits data=payload for a urlencoded body with no fields", () => {
        const code = generatePython(
            request({
                method: "POST",
                bodyType: "application/x-www-form-urlencoded",
                body: {form: []},
            }),
        );
        expect(code).not.toContain("payload");
        expectRunnable(code);
    });

    it("assigns payload when the body is literally null", () => {
        const code = generatePython(
            request({
                method: "POST",
                bodyType: "application/json",
                body: {text: "null"},
                headers: [{name: "Content-Type", value: "application/json"}],
            }),
        );
        expect(code).toContain("payload = None");
        expectRunnable(code);
    });
});

describe("defect 3: methods without a requests helper", () => {
    it("uses requests.request for a non-standard method", () => {
        const code = generatePython(request({method: "PURGE"}));
        expect(code).toContain("response = requests.request('PURGE', url)");
        expectRunnable(code);
    });

    it("still uses the helper for standard methods", () => {
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
            const code = generatePython(request({method}));
            expect(code).toContain(`response = requests.${method.toLowerCase()}(url)`);
        }
    });
});

describe("defect 4: duplicate header and param keys", () => {
    it("preserves repeated query parameters", () => {
        const code = generatePython(
            request({
                urlParameters: [
                    {name: "tag", value: "a"},
                    {name: "tag", value: "b"},
                ],
            }),
        );
        expect(code).toContain("params = [('tag', 'a'), ('tag', 'b')]");
        expectRunnable(code);
    });

    it("preserves repeated headers", () => {
        const code = generatePython(
            request({
                headers: [
                    {name: "X-Tag", value: "a"},
                    {name: "X-Tag", value: "b"},
                ],
            }),
        );
        expect(code).toContain("headers = [('X-Tag', 'a'), ('X-Tag', 'b')]");
        expectRunnable(code);
    });

    it("still emits a dict when keys are unique", () => {
        const code = generatePython(request({urlParameters: [{name: "a", value: "1"}]}));
        expect(code).toContain("params = {'a': '1'}");
        expectRunnable(code);
    });
});

describe("defect 5: binary body", () => {
    it("streams the file rather than dropping the body", () => {
        const code = generatePython(
            request({method: "POST", bodyType: "binary", body: {filePath: "/tmp/a.bin"}}),
        );
        expect(code).toContain("payload = open('/tmp/a.bin', 'rb')");
        expect(code).toContain("data=payload");
        expectRunnable(code);
    });
});

describe.skipIf(!hasPython)("the syntax checker itself", () => {
    it("rejects a snippet with an unterminated literal", () => {
        expect(pythonSyntaxError("payload = 'oops\nmore'")).toMatch(/SyntaxError|EOL|unterminated/i);
    });

    it("reports names that are used but never assigned", () => {
        expect(undefinedNames("import requests\nrequests.get(url, data=payload)")).toEqual([
            "payload",
            "url",
        ]);
    });
});
