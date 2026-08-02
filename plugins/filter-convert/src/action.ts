import type {Context, HttpRequest} from "@yaakapp/api";
import {applyRules, serialise} from "./apply";
import {parseRules} from "./dsl";
import {RuleError} from "./errors";

export type Deps = {readBody(path: string): string};

const BOM = /^\uFEFF/;

const storeKey = (requestId: string) => `rules:${requestId}`;

const PLACEHOLDER = [
    "$.result | hex>dec",
    "$..value | hex>dec | div 1e18",
].join("\n");

export async function convertResponse(
    ctx: Context,
    httpRequest: HttpRequest,
    deps: Deps,
): Promise<void> {
    const responses = await ctx.httpResponse.find({requestId: httpRequest.id, limit: 1});
    const response = responses[0];
    if (response == null || response.bodyPath == null) {
        await ctx.toast.show({color: "warning", message: "No response to convert — send the request first"});
        return;
    }
    const bodyPath = response.bodyPath;

    const saved = (await ctx.store.get<string>(storeKey(httpRequest.id))) ?? "";

    const values = await ctx.prompt.form({
        id: "filter-convert-rules",
        title: "Convert response",
        confirmText: "Convert",
        inputs: [
            {
                type: "editor",
                name: "rules",
                label: "Rules",
                language: "text",
                defaultValue: saved,
                placeholder: PLACEHOLDER,
                description: "One rule per line: <jsonpath> | <step> | <step>",
            },
        ],
    });

    const rulesText = typeof values?.rules === "string" ? values.rules : null;
    if (rulesText == null) return; // cancelled

    // A deliberate blank submission is an explicit CLEAR, not a silent no-op.
    // Without this, once any rule (good or broken) is saved for a request,
    // there would be no path back to "no saved rule" -- clearing the box and
    // confirming would do nothing, and the stale value would keep reappearing
    // on every future run. Acknowledge it with a toast so it isn't mistaken
    // for the dialog swallowing the input.
    if (rulesText.trim() === "") {
        await ctx.store.delete(storeKey(httpRequest.id));
        await ctx.toast.show({color: "info", message: "Cleared the saved rules for this request"});
        return;
    }

    // Persist the raw text before it is validated at all. If parsing or
    // conversion fails below, the *typed* text (not the last-good save) is
    // what the editor prefills next time, so the user is fixing their last
    // attempt rather than retyping it from scratch.
    await ctx.store.set(storeKey(httpRequest.id), rulesText);

    let body: string;
    try {
        body = deps.readBody(bodyPath);
    } catch {
        await ctx.toast.show({color: "danger", message: "Could not read the response body"});
        return;
    }
    body = body.replace(BOM, "");

    let root: unknown;
    try {
        root = JSON.parse(body);
    } catch {
        await ctx.toast.show({color: "danger", message: "Response is not valid JSON"});
        return;
    }

    let output: string;
    let converted: number;
    let matched: number;
    try {
        const result = applyRules(root, parseRules(rulesText));
        output = serialise(result.value);
        converted = result.converted;
        matched = result.matched;
    } catch (err) {
        if (err instanceof RuleError) {
            await ctx.toast.show({color: "danger", message: err.message});
            return;
        }
        throw err;
    }

    if (matched === 0) {
        await ctx.toast.show({color: "warning", message: "No values matched — check the selector"});
    } else if (converted === 0) {
        const unit = matched === 1 ? "value" : "values";
        await ctx.toast.show({
            color: "warning",
            message: `Matched ${matched} ${unit} but none could be converted — check the steps`,
        });
    }

    await ctx.prompt.form({
        id: "filter-convert-result",
        title: "Converted response",
        confirmText: "Done",
        inputs: [
            {
                type: "editor",
                name: "result",
                label: "Result",
                language: "json",
                readOnly: true,
                defaultValue: output,
            },
        ],
    });
}
