
//#region src/generate.ts
/** Methods `requests` exposes as a module-level helper, eg `requests.get(...)`. */
const METHOD_HELPERS = new Set([
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"head",
	"options"
]);
const PY_ESCAPES = {
	"\\": "\\\\",
	"'": "\\'",
	"\n": "\\n",
	"\r": "\\r",
	"	": "\\t"
};
/**
* Render a Python single-quoted string literal.
*
* Escaping only backslashes and quotes is not enough: a literal newline inside
* a single-quoted literal is a syntax error, which silently broke every
* multi-line GraphQL query and raw body.
*/
const pyString = (s) => `'${String(s).replace(/[\\'\n\r\t\x00-\x1f\x7f]/g, (ch) => PY_ESCAPES[ch] ?? `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`)}'`;
const toPyFromJson = (v) => {
	if (v === null || v === void 0) return "None";
	if (typeof v === "string") return pyString(v);
	if (typeof v === "number") return Number.isFinite(v) ? String(v) : "None";
	if (typeof v === "boolean") return v ? "True" : "False";
	if (Array.isArray(v)) return "[" + v.map(toPyFromJson).join(", ") + "]";
	if (typeof v === "object") return "{" + Object.entries(v).map(([k, vv]) => `${pyString(k)}: ${toPyFromJson(vv)}`).join(", ") + "}";
	return "None";
};
/**
* Headers, query params and form fields may all legitimately repeat a name
* (`?tag=a&tag=b`). A dict silently keeps only the last one, so pairs are held
* in order and only collapsed to a dict when every name is unique — `requests`
* accepts either form.
*/
const toPyPairs = (pairs) => {
	const names = pairs.map(([name]) => name);
	if (new Set(names).size !== names.length) return "[" + pairs.map(([k, v]) => `(${pyString(k)}, ${pyString(v)})`).join(", ") + "]";
	return "{" + pairs.map(([k, v]) => `${pyString(k)}: ${pyString(v)}`).join(", ") + "}";
};
const findPair = (pairs, name) => pairs.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? "";
/** Replace an existing name (case-insensitively) or append when absent. */
const setPair = (pairs, name, value) => {
	const index = pairs.findIndex(([k]) => k.toLowerCase() === name.toLowerCase());
	if (index >= 0) pairs[index] = [name, value];
	else pairs.push([name, value]);
};
const removePair = (pairs, name) => {
	const index = pairs.findIndex(([k]) => k.toLowerCase() === name.toLowerCase());
	if (index >= 0) pairs.splice(index, 1);
};
/**
* Build a `requests` snippet for a rendered Yaak request.
*
* `original` is the pre-render request, used only as a fallback for the auth
* and body fields when the rendered request omits them.
*/
function generatePython(rendered, original) {
	const method = (rendered.method || "GET").toUpperCase();
	const url = rendered.url || "";
	const headers = (rendered.headers || []).filter((h) => h.enabled !== false && h.name).map((h) => [h.name, h.value ?? ""]);
	const params = (rendered.urlParameters || []).filter((p) => p.enabled !== false && p.name).map((p) => [p.name, p.value ?? ""]);
	const authType = rendered.authenticationType ?? original?.authenticationType;
	const auth = rendered.authentication ?? original?.authentication ?? {};
	const authDisabled = auth?.disabled === true;
	let needsDigestImport = false;
	let needsNtlmImport = false;
	let authCall = null;
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
			if (key) if (auth?.location === "query") setPair(params, key, value);
			else setPair(headers, key, value);
		} else if (authType === "windows") {
			const domain = auth?.domain ?? "";
			const username = auth?.username ?? "";
			const password = auth?.password ?? "";
			const ntlmUser = domain ? `${domain}\\${username}` : username;
			needsNtlmImport = true;
			authCall = `HttpNtlmAuth(${pyString(ntlmUser)}, ${pyString(password)})`;
		}
	}
	const bodyType = rendered.bodyType ?? original?.bodyType ?? "none";
	const body = rendered.body ?? original?.body ?? {};
	const formFields = [];
	const filesSpec = [];
	let dataText = null;
	let binaryPath = null;
	let jsonObj = void 0;
	const contentType = findPair(headers, "content-type");
	const isMultipart = bodyType === "multipart/form-data" || /^multipart\/form-data/i.test(contentType);
	const isUrlEncoded = bodyType === "application/x-www-form-urlencoded" || /^application\/x-www-form-urlencoded/i.test(contentType);
	if ((isUrlEncoded || isMultipart) && Array.isArray(body?.form)) for (const p of body.form.filter((x) => x?.enabled !== false)) {
		const nameRaw = typeof p.name === "string" ? p.name : void 0;
		const valueRaw = typeof p.value === "string" ? p.value : void 0;
		const setFile = (k, v, contentType$1) => {
			filesSpec.push({
				name: k,
				path: v.startsWith("@") ? v.slice(1) : v,
				contentType: contentType$1
			});
		};
		const tryToken = (token) => {
			if (!token) return false;
			const idx = token.indexOf("=");
			if (idx <= 0) return false;
			const k = token.slice(0, idx);
			const v = token.slice(idx + 1);
			if (v.startsWith("@")) setFile(k, v);
			else formFields.push([k, v]);
			return true;
		};
		if (p.file && nameRaw) {
			setFile(nameRaw, p.file, p.contentType);
			continue;
		}
		if (!nameRaw || nameRaw === "form" || nameRaw === valueRaw) {
			if (tryToken(valueRaw)) continue;
		}
		if (tryToken(nameRaw)) continue;
		if (nameRaw) formFields.push([nameRaw, valueRaw ?? ""]);
	}
	else if (bodyType === "graphql" && typeof body?.query === "string") {
		const variables = typeof body?.variables === "string" ? body.variables : "";
		let parsedVars = void 0;
		try {
			parsedVars = variables ? JSON.parse(variables) : void 0;
		} catch {}
		jsonObj = {
			query: body.query || "",
			variables: parsedVars
		};
	} else if (bodyType === "binary" && typeof body?.filePath === "string" && body.filePath) binaryPath = body.filePath;
	else if (bodyType !== "none" && typeof body?.text === "string") if (/^application\/json/i.test(contentType)) try {
		jsonObj = JSON.parse(body.text);
	} catch {
		dataText = body.text;
	}
	else dataText = body.text;
	if (isMultipart) removePair(headers, "content-type");
	let payloadExpr = null;
	if (formFields.length > 0) payloadExpr = toPyPairs(formFields);
	else if (jsonObj !== void 0) payloadExpr = toPyFromJson(jsonObj);
	else if (dataText !== null) payloadExpr = pyString(dataText);
	else if (binaryPath !== null) payloadExpr = `open(${pyString(binaryPath)}, 'rb')`;
	const asJson = jsonObj !== void 0 && !isMultipart && !isUrlEncoded && filesSpec.length === 0;
	const lines = ["import requests"];
	if (needsDigestImport) lines.push("from requests.auth import HTTPDigestAuth");
	if (needsNtlmImport) lines.push("from requests_ntlm import HttpNtlmAuth");
	lines.push("");
	lines.push(`url = ${pyString(url)}`);
	if (headers.length > 0) lines.push(`headers = ${toPyPairs(headers)}`);
	if (params.length > 0) lines.push(`params = ${toPyPairs(params)}`);
	if (payloadExpr !== null) lines.push(`payload = ${payloadExpr}`);
	if (filesSpec.length > 0) {
		const fileEntries = filesSpec.map((f) => `${pyString(f.name)}: (${pyString(f.path.split("/").pop() || "file")}, open(${pyString(f.path)}, 'rb')${f.contentType ? `, ${pyString(f.contentType)}` : ""})`);
		lines.push(`files = { ${fileEntries.join(", ")} }`);
	}
	const callParts = ["url"];
	if (headers.length > 0) callParts.push("headers=headers");
	if (params.length > 0) callParts.push("params=params");
	if (authCall) callParts.push(`auth=${authCall}`);
	if (filesSpec.length > 0) callParts.push("files=files");
	if (payloadExpr !== null) callParts.push(asJson ? "json=payload" : "data=payload");
	const verb = method.toLowerCase();
	const call = METHOD_HELPERS.has(verb) ? `requests.${verb}(${callParts.join(", ")})` : `requests.request(${pyString(method)}, ${callParts.join(", ")})`;
	lines.push("");
	lines.push(`response = ${call}`);
	lines.push("print(response.text)");
	return lines.join("\n");
}

//#endregion
//#region src/index.ts
const plugin = { httpRequestActions: [{
	label: "Copy as Python",
	icon: "copy",
	async onSelect(ctx, args) {
		const rendered = await ctx.httpRequest.render({
			httpRequest: args.httpRequest,
			purpose: "send"
		});
		await ctx.clipboard.copyText(generatePython(rendered, args.httpRequest));
		await ctx.toast.show({
			color: "success",
			message: "Copied python snippet to clipboard"
		});
	}
}] };

//#endregion
exports.plugin = plugin;