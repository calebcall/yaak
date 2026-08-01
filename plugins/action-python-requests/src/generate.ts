import type {HttpRequest} from "@yaakapp/api";

/** Methods `requests` exposes as a module-level helper, eg `requests.get(...)`. */
const METHOD_HELPERS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

const PY_ESCAPES: Record<string, string> = {
    "\\": "\\\\",
    "'": "\\'",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
};

/**
 * Render a Python single-quoted string literal.
 *
 * Escaping only backslashes and quotes is not enough: a literal newline inside
 * a single-quoted literal is a syntax error, which silently broke every
 * multi-line GraphQL query and raw body.
 */
const pyString = (s: string) =>
    `'${String(s).replace(/[\\'\n\r\t\x00-\x1f\x7f]/g, (ch) =>
        PY_ESCAPES[ch] ?? `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`)}'`;

const toPyFromJson = (v: unknown): string => {
    if (v === null || v === undefined) return "None";
    if (typeof v === "string") return pyString(v);
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "None";
    if (typeof v === "boolean") return v ? "True" : "False";
    if (Array.isArray(v)) return "[" + v.map(toPyFromJson).join(", ") + "]";
    if (typeof v === "object") {
        const parts = Object.entries(v).map(([k, vv]) => `${pyString(k)}: ${toPyFromJson(vv)}`);
        return "{" + parts.join(", ") + "}";
    }
    return "None";
};

type Pair = [name: string, value: string];

/**
 * Headers, query params and form fields may all legitimately repeat a name
 * (`?tag=a&tag=b`). A dict silently keeps only the last one, so pairs are held
 * in order and only collapsed to a dict when every name is unique — `requests`
 * accepts either form.
 */
const toPyPairs = (pairs: Pair[]) => {
    const names = pairs.map(([name]) => name);
    if (new Set(names).size !== names.length) {
        return "[" + pairs.map(([k, v]) => `(${pyString(k)}, ${pyString(v)})`).join(", ") + "]";
    }
    return "{" + pairs.map(([k, v]) => `${pyString(k)}: ${pyString(v)}`).join(", ") + "}";
};

const findPair = (pairs: Pair[], name: string) =>
    pairs.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? "";

/** Replace an existing name (case-insensitively) or append when absent. */
const setPair = (pairs: Pair[], name: string, value: string) => {
    const index = pairs.findIndex(([k]) => k.toLowerCase() === name.toLowerCase());
    if (index >= 0) pairs[index] = [name, value];
    else pairs.push([name, value]);
};

const removePair = (pairs: Pair[], name: string) => {
    const index = pairs.findIndex(([k]) => k.toLowerCase() === name.toLowerCase());
    if (index >= 0) pairs.splice(index, 1);
};

/**
 * Build a `requests` snippet for a rendered Yaak request.
 *
 * `original` is the pre-render request, used only as a fallback for the auth
 * and body fields when the rendered request omits them.
 */
export function generatePython(rendered: HttpRequest, original?: Partial<HttpRequest>): string {
    const method = (rendered.method || "GET").toUpperCase();
    const url = rendered.url || "";

    const headers: Pair[] = (rendered.headers || [])
        .filter(h => h.enabled !== false && h.name)
        .map(h => [h.name, h.value ?? ""]);

    const params: Pair[] = (rendered.urlParameters || [])
        .filter(p => p.enabled !== false && p.name)
        .map(p => [p.name, p.value ?? ""]);

    // Authentication handling
    const authType = rendered.authenticationType ?? original?.authenticationType;
    const auth = rendered.authentication ?? original?.authentication ?? {} as Record<string, any>;
    const authDisabled = auth?.disabled === true;
    let needsDigestImport = false;
    let needsNtlmImport = false;
    let authCall: string | null = null;
    if (!authDisabled) {
        if (authType === "basic") {
            const u = auth?.username ?? "";
            const p = auth?.password ?? "";
            authCall = `(${pyString(u)}, ${pyString(p)})`;
        } else if (authType === "digest") {
            const u = auth?.username ?? "";
            const p = auth?.password ?? "";
            needsDigestImport = true;
            authCall = `HTTPDigestAuth(${pyString(u)}, ${pyString(p)})`;
        } else if (authType === "bearer") {
            const value = `${auth?.prefix ?? "Bearer"} ${auth?.token ?? ""}`.trim();
            if (value) setPair(headers, "Authorization", value);
        } else if (authType === "auth-aws-sig-v4") {
            if (auth?.sessionToken) setPair(headers, "X-Amz-Security-Token", auth.sessionToken);
        } else if (authType === "apikey") {
            const key = auth?.key ?? "";
            const value = String(auth?.value ?? "");
            if (key) {
                if (auth?.location === "query") setPair(params, key, value);
                else setPair(headers, key, value);
            }
        } else if (authType === "windows") {
            const domain = auth?.domain ?? "";
            const username = auth?.username ?? "";
            const password = auth?.password ?? "";
            const ntlmUser = domain ? `${domain}\\${username}` : username;
            needsNtlmImport = true;
            authCall = `HttpNtlmAuth(${pyString(ntlmUser)}, ${pyString(password)})`;
        }
    }

    // Body handling
    const bodyType = rendered.bodyType ?? original?.bodyType ?? "none";
    const body = rendered.body ?? original?.body ?? {} as any;
    const formFields: Pair[] = [];
    const filesSpec: Array<{ name: string; path: string; contentType?: string }> = [];
    let dataText: string | null = null;
    let binaryPath: string | null = null;
    // `undefined` means "no JSON body"; `null` means the body is literally `null`.
    let jsonObj: unknown = undefined;

    const contentType = findPair(headers, "content-type");
    const isMultipart = bodyType === "multipart/form-data" || /^multipart\/form-data/i.test(contentType);
    const isUrlEncoded = bodyType === "application/x-www-form-urlencoded"
        || /^application\/x-www-form-urlencoded/i.test(contentType);

    if ((isUrlEncoded || isMultipart) && Array.isArray(body?.form)) {
        for (const p of (body.form as Array<any>).filter((x) => x?.enabled !== false)) {
            const nameRaw = typeof p.name === "string" ? p.name : undefined;
            const valueRaw = typeof p.value === "string" ? p.value : undefined;

            const setFile = (k: string, v: string, contentType?: string) => {
                filesSpec.push({name: k, path: v.startsWith("@") ? v.slice(1) : v, contentType});
            };
            const tryToken = (token?: string): boolean => {
                if (!token) return false;
                const idx = token.indexOf("=");
                if (idx <= 0) return false;
                const k = token.slice(0, idx);
                const v = token.slice(idx + 1);
                if (v.startsWith("@")) setFile(k, v);
                else formFields.push([k, v]);
                return true;
            };

            // Explicit file param provided by Yaak form model
            if (p.file && nameRaw) {
                setFile(nameRaw, p.file, p.contentType);
                continue;
            }

            // Handle value token like 'key=value' (eg name missing or generic 'form')
            if (!nameRaw || nameRaw === "form" || nameRaw === valueRaw) {
                if (tryToken(valueRaw)) continue;
            }

            // Handle name token like 'key=value' (value may be undefined or redundant)
            if (tryToken(nameRaw)) continue;

            // Fallback: plain key/value
            if (nameRaw) formFields.push([nameRaw, valueRaw ?? ""]);
        }
    } else if (bodyType === "graphql" && typeof body?.query === "string") {
        const variables = typeof body?.variables === "string" ? body.variables : "";
        let parsedVars: unknown = undefined;
        try {
            parsedVars = variables ? JSON.parse(variables) : undefined;
        } catch {
            // A half-typed variables editor is not worth failing the whole snippet over
        }
        jsonObj = {query: body.query || "", variables: parsedVars};
    } else if (bodyType === "binary" && typeof body?.filePath === "string" && body.filePath) {
        binaryPath = body.filePath;
    } else if (bodyType !== "none" && typeof body?.text === "string") {
        // If JSON, capture as object; otherwise keep as raw text
        if (/^application\/json/i.test(contentType)) {
            try {
                jsonObj = JSON.parse(body.text);
            } catch {
                dataText = body.text;
            }
        } else {
            dataText = body.text;
        }
    }

    // Let requests set the boundary header for multipart
    if (isMultipart) removePair(headers, "content-type");

    // A `payload` reference is only emitted when there is a `payload = ...` to match
    let payloadExpr: string | null = null;
    if (formFields.length > 0) payloadExpr = toPyPairs(formFields);
    else if (jsonObj !== undefined) payloadExpr = toPyFromJson(jsonObj);
    else if (dataText !== null) payloadExpr = pyString(dataText);
    else if (binaryPath !== null) payloadExpr = `open(${pyString(binaryPath)}, 'rb')`;

    // Raw text that failed to parse as JSON is sent as-is rather than re-encoded
    const asJson = jsonObj !== undefined && !isMultipart && !isUrlEncoded && filesSpec.length === 0;

    const lines: string[] = ["import requests"];
    if (needsDigestImport) lines.push("from requests.auth import HTTPDigestAuth");
    if (needsNtlmImport) lines.push("from requests_ntlm import HttpNtlmAuth");
    lines.push("");
    lines.push(`url = ${pyString(url)}`);
    if (headers.length > 0) lines.push(`headers = ${toPyPairs(headers)}`);
    if (params.length > 0) lines.push(`params = ${toPyPairs(params)}`);
    if (payloadExpr !== null) lines.push(`payload = ${payloadExpr}`);
    if (filesSpec.length > 0) {
        // Build simple files dict; users may need to adjust content types
        const fileEntries = filesSpec.map(f =>
            `${pyString(f.name)}: (${pyString(f.path.split("/").pop() || "file")}, open(${pyString(f.path)}, 'rb')${f.contentType ? `, ${pyString(f.contentType)}` : ""})`);
        lines.push(`files = { ${fileEntries.join(", ")} }`);
    }

    const callParts: string[] = ["url"];
    if (headers.length > 0) callParts.push("headers=headers");
    if (params.length > 0) callParts.push("params=params");
    if (authCall) callParts.push(`auth=${authCall}`);
    if (filesSpec.length > 0) callParts.push("files=files");
    if (payloadExpr !== null) callParts.push(asJson ? "json=payload" : "data=payload");

    const verb = method.toLowerCase();
    const call = METHOD_HELPERS.has(verb)
        ? `requests.${verb}(${callParts.join(", ")})`
        : `requests.request(${pyString(method)}, ${callParts.join(", ")})`;

    lines.push("");
    lines.push(`response = ${call}`);
    lines.push("print(response.text)");

    return lines.join("\n");
}
