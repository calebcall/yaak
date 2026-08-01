import {PluginDefinition} from "@yaakapp/api";

export const plugin: PluginDefinition = {
    httpRequestActions: [
        {
            label: "Copy as Python",
            icon: "info",
            async onSelect(ctx, args) {
                const rendered = await ctx.httpRequest.render({
                    httpRequest: args.httpRequest,
                    purpose: "send",
                });

                const method = (rendered.method || "GET").toUpperCase();
                const url = rendered.url || "";

                const enabledHeaders = (rendered.headers || []).filter(h => h.enabled !== false && h.name);
                const headersObj: Record<string, string> = {};
                for (const h of enabledHeaders) {
                    headersObj[h.name] = h.value ?? "";
                }

                const enabledParams = (rendered.urlParameters || []).filter(p => p.enabled !== false && p.name);
                const paramsObj: Record<string, string> = {};
                for (const p of enabledParams) {
                    paramsObj[p.name] = p.value ?? "";
                }

                const pyString = (s: string) => {
                    return `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
                };

                const toPyDict = (o: Record<string, string>) => {
                    const entries = Object.entries(o);
                    if (entries.length === 0) return "{}";
                    return "{" + entries.map(([k, v]) => `${pyString(k)}: ${pyString(v)}`).join(", ") + "}";
                };

                const toPyFromJson = (v: any): string => {
                    if (v === null) return "None";
                    if (typeof v === "string") return pyString(v);
                    if (typeof v === "number") return String(v);
                    if (typeof v === "boolean") return v ? "True" : "False";
                    if (Array.isArray(v)) return "[" + v.map(toPyFromJson).join(", ") + "]";
                    if (typeof v === "object") {
                        const parts = Object.entries(v).map(([k, vv]) => `${pyString(k)}: ${toPyFromJson(vv)}`);
                        return "{" + parts.join(", ") + "}";
                    }
                    return "None";
                };

                // Authentication handling
                const authType = rendered.authenticationType ?? args.httpRequest.authenticationType;
                const auth = rendered.authentication ?? args.httpRequest.authentication ?? {} as Record<string, any>;
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
                        if (value) headersObj["Authorization"] = value;
                    } else if (authType === "auth-aws-sig-v4") {
                        if (auth?.sessionToken) headersObj["X-Amz-Security-Token"] = auth.sessionToken;
                    } else if (authType === "apikey") {
                        const key = auth?.key ?? "";
                        const value = String(auth?.value ?? "");
                        if (key) {
                            if (auth?.location === "query") {
                                paramsObj[key] = value;
                            } else {
                                headersObj[key] = value;
                            }
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
                const bodyType = rendered.bodyType ?? args.httpRequest.bodyType ?? 'none';
                const body = rendered.body ?? args.httpRequest.body ?? {} as any;
                let hasData = false;
                let hasFiles = false;
                const dataObj: Record<string, string> = {};
                const filesSpec: Array<{ name: string; path: string; contentType?: string }> = [];
                let dataText: string | null = null;
                let jsonObj: any | null = null;

                const contentTypeHeader = Object.keys(headersObj).find(k => k.toLowerCase() === 'content-type');
                const contentType = contentTypeHeader ? headersObj[contentTypeHeader] : '';
                const isMultipart = (rendered.bodyType === 'multipart/form-data') || /^multipart\/form-data/i.test(contentType || '');
                const isUrlEncoded = (rendered.bodyType === 'application/x-www-form-urlencoded') || /^application\/x-www-form-urlencoded/i.test(contentType || '');

                if ((isUrlEncoded || isMultipart) && Array.isArray(body?.form)) {
                    for (const p of (body.form as Array<any>).filter((x) => x?.enabled !== false)) {
                        const nameRaw = typeof p.name === 'string' ? p.name : undefined;
                        const valueRaw = typeof p.value === 'string' ? p.value : undefined;

                        const setFile = (k: string, v: string, contentType?: string) => {
                            hasFiles = true;
                            filesSpec.push({ name: k, path: v.startsWith('@') ? v.slice(1) : v, contentType });
                        };
                        const setData = (k: string, v: string) => {
                            hasData = true;
                            dataObj[k] = v;
                        };
                        const tryToken = (token?: string): boolean => {
                            if (!token) return false;
                            const idx = token.indexOf('=');
                            if (idx <= 0) return false;
                            const k = token.slice(0, idx);
                            const v = token.slice(idx + 1);
                            if (v.startsWith('@')) setFile(k, v);
                            else setData(k, v);
                            return true;
                        };

                        // Explicit file param provided by Yaak form model
                        if (p.file && nameRaw) {
                            setFile(nameRaw, p.file, p.contentType);
                            continue;
                        }

                        // Handle value token like 'key=value' (eg name missing or generic 'form')
                        if (!nameRaw || nameRaw === 'form' || nameRaw === valueRaw) {
                            if (tryToken(valueRaw)) continue;
                        }

                        // Handle name token like 'key=value' (value may be undefined or redundant)
                        if (tryToken(nameRaw)) continue;

                        // Fallback: plain key/value
                        if (nameRaw) setData(nameRaw, valueRaw ?? '');
                    }
                } else if (bodyType === 'graphql' && typeof body?.query === 'string') {
                    const variables = typeof body?.variables === 'string' ? body.variables : '';
                    let parsedVars: any = undefined;
                    try { parsedVars = variables ? JSON.parse(variables) : undefined; } catch {}
                    const payload = { query: body.query || '', variables: parsedVars };
                    jsonObj = payload;
                } else if (bodyType !== 'none' && typeof body?.text === 'string') {
                    // If JSON, capture as object; otherwise keep as raw text
                    if (/^application\/json/i.test(contentType || '') ) {
                        try { jsonObj = JSON.parse(body.text); } catch { dataText = body.text; }
                    } else {
                        dataText = body.text;
                    }
                }

                const lines: string[] = [];
                lines.push("import requests");
                if (needsDigestImport) {
                    lines.push("from requests.auth import HTTPDigestAuth");
                }
                if (needsNtlmImport) {
                    lines.push("from requests_ntlm import HttpNtlmAuth");
                }
                lines.push("");
                lines.push(`url = ${pyString(url)}`);
                if (Object.keys(headersObj).length > 0) {
                    // Let requests set boundary header for multipart
                    if (isMultipart && contentTypeHeader) {
                        delete headersObj[contentTypeHeader];
                    }
                    lines.push(`headers = ${toPyDict(headersObj)}`);
                }
                if (Object.keys(paramsObj).length > 0) {
                    lines.push(`params = ${toPyDict(paramsObj)}`);
                }
                if (hasData && Object.keys(dataObj).length > 0) {
                    lines.push(`payload = ${toPyDict(dataObj)}`);
                } else if (jsonObj !== null) {
                    lines.push(`payload = ${toPyFromJson(jsonObj)}`);
                } else if (typeof dataText === 'string') {
                    lines.push(`payload = ${pyString(dataText)}`);
                }
                if (hasFiles && filesSpec.length > 0) {
                    // Build simple files dict; users may need to adjust content types
                    const fileEntries = filesSpec.map(f => `${pyString(f.name)}: (${pyString(f.path.split('/').pop() || 'file')}, open(${pyString(f.path)}, 'rb')${f.contentType ? `, ${pyString(f.contentType)}` : ''})`);
                    lines.push(`files = { ${fileEntries.join(', ')} }`);
                }

                const callParts: string[] = ["url"];
                if (Object.keys(headersObj).length > 0) callParts.push("headers=headers");
                if (Object.keys(paramsObj).length > 0) callParts.push("params=params");
                if (authCall) callParts.push(`auth=${authCall}`);
                if (hasFiles && filesSpec.length > 0) callParts.push("files=files");
                // Choose between json= and data=
                if (isMultipart || hasFiles) {
                    if ((hasData && Object.keys(dataObj).length > 0) || jsonObj !== null || typeof dataText === 'string') callParts.push("data=payload");
                } else if (isUrlEncoded || bodyType === 'application/x-www-form-urlencoded') {
                    callParts.push("data=payload");
                } else if (jsonObj !== null || /^application\/json/i.test(contentType || '')) {
                    callParts.push("json=payload");
                } else if (typeof dataText === 'string') {
                    callParts.push("data=payload");
                }

                lines.push("");
                lines.push(`response = requests.${method.toLowerCase()}(${callParts.join(", ")})`);
                lines.push("print(response.json())");

                const code = lines.join("\n");
                await ctx.clipboard.copyText(code);
                await ctx.toast.show({
                    color: "success",
                    message: "Copied python snippet to clipboard",
                });
            },
        },
    ],
};

