import type {Context, HttpRequest} from "@yaakapp/api";
import {applyRules, serialise} from "./apply";
import {parseRules} from "./dsl";
import {RuleError} from "./errors";
import {STEPS} from "./steps";

export type Deps = {readBody(path: string): string};

const BOM = /^\uFEFF/;

const storeKey = (requestId: string) => `rules:${requestId}`;

const PLACEHOLDER = [
    "$.result | hex>dec",
    "$..value | hex>dec | div 1e18",
].join("\n");

/**
 * Groups every step actually registered in `STEPS` into families for the
 * reference card shown above the rules editor, so the list can never drift
 * from what the DSL really supports. Each pattern is checked in order and a
 * step is claimed by the first family it matches; anything left over (e.g. a
 * future step that doesn't fit an existing family) still gets listed under
 * "other" rather than silently vanishing from the reference.
 */
const STEP_FAMILIES: Array<{label: string; match: (name: string) => boolean}> = [
    {label: "numeric base", match: (n) => /^(hex|bin|oct|dec)>/.test(n)},
    {label: "scaling", match: (n) => n === "div" || n === "mul" || n === "fixed"},
    {label: "time", match: (n) => /(epoch|date|duration)/.test(n)},
    {label: "encoding", match: (n) => /(base64|hexbytes|urlenc)/.test(n)},
    {label: "structured", match: (n) => n === "json" || n === "jwt"},
];

/**
 * Renders a step for the reference card with its argument placeholders
 * inline (e.g. `div <n>`), derived from the registry's own `arity` rather
 * than a hardcoded list of "which steps take an argument" -- so this stays
 * honest if a step's arity ever changes.
 *
 * Every name is wrapped in backticks so it renders as an inline code span.
 * This is not just cosmetic: Yaak renders this markdown with react-markdown
 * + remark-gfm and no rehype-raw, so a bare `<n>` outside a code span is
 * parsed as an (unrecognised) raw HTML tag and silently dropped -- the
 * arity hint would vanish from the UI entirely, leaving "div , fixed , mul"
 * with a dangling space. Backticks sidestep that for every step, including
 * zero-arity ones, since they read better and stay future-proof if a step's
 * arity ever changes to include a placeholder.
 */
function formatStepName(name: string): string {
    const arity = STEPS[name]?.arity ?? 0;
    if (arity === 0) return `\`${name}\``;
    if (arity === 1) return `\`${name} <n>\``;
    const args = Array.from({length: arity}, (_, i) => `<arg${i + 1}>`);
    return `\`${name} ${args.join(" ")}\``;
}

/**
 * The GENERATED half of the reference card -- every step in `STEPS`,
 * grouped by family, with no hand-written text. Exported separately (rather
 * than folded straight into the full card) so a drift-guard test can assert
 * a step name appears in *this* string specifically. Asserting against the
 * full card (generated sections + hand-written examples) would be a weaker
 * guard: `hex>dec` and `jwt` also happen to appear in the examples below, so
 * a substring check over the whole card could pass even if the generator
 * silently dropped them from the generated sections.
 */
export function buildStepFamilySections(): string {
    const remaining = new Set(Object.keys(STEPS));
    const lines: string[] = [];
    for (const {label, match} of STEP_FAMILIES) {
        const names = Array.from(remaining).filter(match).sort();
        if (names.length === 0) continue;
        names.forEach((n) => remaining.delete(n));
        lines.push(`- **${label}**: ${names.map(formatStepName).join(", ")}`);
    }
    if (remaining.size > 0) {
        const leftover = Array.from(remaining).sort();
        lines.push(`- **other**: ${leftover.map(formatStepName).join(", ")}`);
    }
    return lines.join("\n");
}

const STEP_FAMILY_SECTIONS = buildStepFamilySections();

function buildStepReference(): string {
    return [
        "One rule per line: `$.path | step | step`",
        "",
        STEP_FAMILY_SECTIONS,
        "",
        "Examples:",
        "- `$.result | hex>dec`",
        "- `$..value | hex>dec | div 1e18`",
        "- `$.payload | base64 | json`",
        "- `$.token | jwt`",
    ].join("\n");
}

const STEP_REFERENCE = buildStepReference();

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
            {type: "markdown", content: STEP_REFERENCE},
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

    // A genuine cancel (backdrop click, escape, explicit Cancel) resolves
    // `values` itself to `null`. Do nothing at all -- not even a store read
    // was meant to matter here.
    if (values == null) return;

    // Yaak's prompt value state starts as `{}` and is populated ONLY by the
    // rules field's `onChange`, which fires only when the user actually
    // edits it (see apps/yaak-client/components/core/Prompt.tsx). So
    // `values.rules` being `undefined` does NOT mean the field was blank --
    // it means the user confirmed a prefilled dialog without touching it.
    // Treating that the same as a cancel is exactly the bug this fixes: it
    // must fall back to the value the field was actually showing, i.e. the
    // rules already saved for this request.
    const edited = typeof values.rules === "string";
    const rulesText = edited ? (values.rules as string) : saved;

    // A blank rules text now means one of two different things depending on
    // how it got here, and they must not be conflated:
    if (rulesText.trim() === "") {
        if (edited) {
            // The user actively cleared a field that had content -- clearing
            // a prefilled field IS an edit, so `onChange` still fires with
            // `""`. Treat it as an explicit CLEAR: without this, once any
            // rule (good or broken) is saved for a request, there would be
            // no path back to "no saved rule" -- clearing the box and
            // confirming would do nothing, and the stale value would keep
            // reappearing on every future run. Acknowledge it with a toast
            // so the action isn't mistaken for the dialog swallowing input.
            await ctx.store.delete(storeKey(httpRequest.id));
            await ctx.toast.show({color: "info", message: "Cleared the saved rules for this request"});
        } else {
            // Confirmed without editing, and there was nothing saved to fall
            // back to either -- there is nothing to clear and nothing to
            // convert. "Cleared" would be a lie here, so say what actually
            // happened instead.
            await ctx.toast.show({color: "warning", message: "No rules entered"});
        }
        return;
    }

    // Persist the raw text before it is validated at all. If parsing or
    // conversion fails below, the *typed* text (not the last-good save) is
    // what the editor prefills next time, so the user is fixing their last
    // attempt rather than retyping it from scratch.
    //
    // Everything from here on is wrapped in one outer try/catch. `RuleError`
    // still gets its own specific, actionable message below, but ANY other
    // unexpected exception -- a raw RangeError from `serialise` overflowing
    // the stack on a pathologically deep body, a store/host call failing,
    // whatever -- must still end in a toast, not an exception thrown into
    // the host. A plugin that throws past this boundary gives the user a
    // bare, contextless runtime error; a toast can at least name what went
    // wrong.
    try {
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
            converted = result.converted;
            matched = result.matched;
            output = serialise(result.value);
        } catch (err) {
            if (err instanceof RuleError) {
                await ctx.toast.show({color: "danger", message: err.message});
                return;
            }
            throw err; // handled by the outer catch below
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
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        await ctx.toast.show({color: "danger", message: `Could not convert the response: ${detail}`});
    }
}
