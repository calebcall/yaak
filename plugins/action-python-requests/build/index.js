"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  plugin: () => plugin
});
module.exports = __toCommonJS(src_exports);
var plugin = {
  httpRequestActions: [
    {
      label: "Copy as Python",
      icon: "info",
      async onSelect(ctx, args) {
        const rendered = await ctx.httpRequest.render({
          httpRequest: args.httpRequest,
          purpose: "preview"
        });
        const method = (rendered.method || "GET").toUpperCase();
        const url = rendered.url || "";
        const headerSource = args.httpRequest.headers && args.httpRequest.headers.length > 0 ? args.httpRequest.headers : rendered.headers || [];
        const enabledHeaders = headerSource.filter((h) => h.enabled !== false && h.name);
        const headersObj = {};
        for (const h of enabledHeaders) {
          headersObj[h.name] = h.value ?? "";
        }
        const paramsSource = args.httpRequest.urlParameters && args.httpRequest.urlParameters.length > 0 ? args.httpRequest.urlParameters : rendered.urlParameters || [];
        const enabledParams = paramsSource.filter((p) => p.enabled !== false && p.name);
        const paramsObj = {};
        for (const p of enabledParams) {
          paramsObj[p.name] = p.value ?? "";
        }
        const pyString = (s) => {
          return `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
        };
        const toPyDict = (o) => {
          const entries = Object.entries(o);
          if (entries.length === 0) return "{}";
          return "{" + entries.map(([k, v]) => `${pyString(k)}: ${pyString(v)}`).join(", ") + "}";
        };
        const toPyFromJson = (v) => {
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
        const authType = rendered.authenticationType ?? args.httpRequest.authenticationType;
        const auth = rendered.authentication ?? args.httpRequest.authentication ?? {};
        const authDisabled = auth?.disabled === true;
        let needsDigestImport = false;
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
            if (value) headersObj["Authorization"] = value;
          } else if (authType === "auth-aws-sig-v4") {
            if (auth?.sessionToken) headersObj["X-Amz-Security-Token"] = auth.sessionToken;
          }
        }
        const bodyType = rendered.bodyType ?? args.httpRequest.bodyType ?? "none";
        const body = rendered.body ?? args.httpRequest.body ?? {};
        let hasData = false;
        let hasFiles = false;
        const dataObj = {};
        const filesSpec = [];
        let dataText = null;
        let jsonObj = null;
        const contentTypeHeader = Object.keys(headersObj).find((k) => k.toLowerCase() === "content-type");
        const contentType = contentTypeHeader ? headersObj[contentTypeHeader] : "";
        const isMultipart = rendered.bodyType === "multipart/form-data" || /^multipart\/form-data/i.test(contentType || "");
        const isUrlEncoded = rendered.bodyType === "application/x-www-form-urlencoded" || /^application\/x-www-form-urlencoded/i.test(contentType || "");
        if ((isUrlEncoded || isMultipart) && Array.isArray(body?.form)) {
          for (const p of body.form.filter((x) => x?.enabled !== false)) {
            const nameRaw = typeof p.name === "string" ? p.name : void 0;
            const valueRaw = typeof p.value === "string" ? p.value : void 0;
            const setFile = (k, v, contentType2) => {
              hasFiles = true;
              filesSpec.push({ name: k, path: v.startsWith("@") ? v.slice(1) : v, contentType: contentType2 });
            };
            const setData = (k, v) => {
              hasData = true;
              dataObj[k] = v;
            };
            const tryToken = (token) => {
              if (!token) return false;
              const idx = token.indexOf("=");
              if (idx <= 0) return false;
              const k = token.slice(0, idx);
              const v = token.slice(idx + 1);
              if (v.startsWith("@")) setFile(k, v);
              else setData(k, v);
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
            if (nameRaw) setData(nameRaw, valueRaw ?? "");
          }
        } else if (bodyType === "graphql" && typeof body?.query === "string") {
          const variables = typeof body?.variables === "string" ? body.variables : "";
          let parsedVars = void 0;
          try {
            parsedVars = variables ? JSON.parse(variables) : void 0;
          } catch {
          }
          const payload = { query: body.query || "", variables: parsedVars };
          jsonObj = payload;
        } else if (bodyType !== "none" && typeof body?.text === "string") {
          if (/^application\/json/i.test(contentType || "")) {
            try {
              jsonObj = JSON.parse(body.text);
            } catch {
              dataText = body.text;
            }
          } else {
            dataText = body.text;
          }
        }
        const lines = [];
        lines.push("import requests");
        if (needsDigestImport) {
          lines.push("from requests.auth import HTTPDigestAuth");
        }
        lines.push("");
        lines.push(`url = ${pyString(url)}`);
        if (Object.keys(headersObj).length > 0) {
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
        } else if (typeof dataText === "string") {
          lines.push(`payload = ${pyString(dataText)}`);
        }
        if (hasFiles && filesSpec.length > 0) {
          const fileEntries = filesSpec.map((f) => `${pyString(f.name)}: (${pyString(f.path.split("/").pop() || "file")}, open(${pyString(f.path)}, 'rb')${f.contentType ? `, ${pyString(f.contentType)}` : ""})`);
          lines.push(`files = { ${fileEntries.join(", ")} }`);
        }
        const callParts = ["url"];
        if (Object.keys(headersObj).length > 0) callParts.push("headers=headers");
        if (Object.keys(paramsObj).length > 0) callParts.push("params=params");
        if (authCall) callParts.push(`auth=${authCall}`);
        if (hasFiles && filesSpec.length > 0) callParts.push("files=files");
        if (isMultipart || hasFiles) {
          if (hasData && Object.keys(dataObj).length > 0 || jsonObj !== null || typeof dataText === "string") callParts.push("data=payload");
        } else if (isUrlEncoded || bodyType === "application/x-www-form-urlencoded") {
          callParts.push("data=payload");
        } else if (jsonObj !== null || /^application\/json/i.test(contentType || "")) {
          callParts.push("json=payload");
        } else if (typeof dataText === "string") {
          callParts.push("data=payload");
        }
        lines.push("");
        lines.push(`response = requests.${method.toLowerCase()}(${callParts.join(", ")})`);
        lines.push("print(response.json())");
        const code = lines.join("\n");
        await ctx.clipboard.copyText(code);
        await ctx.toast.show({
          color: "success",
          message: "Copied python snippet to clipboard"
        });
      }
    }
  ]
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  plugin
});
