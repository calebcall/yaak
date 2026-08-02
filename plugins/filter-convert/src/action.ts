import type {Context, DynamicPromptFormArg, FormInputSelectOption, HttpRequest} from "@yaakapp/api";
import {applyRules, serialise} from "./apply";
import {DEFAULT_FROM, DEFAULT_TO_STEP, FROM_OPTIONS, edgeForStep, toOptionsFor} from "./conversionTypes";
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

export type Mode = "simple" | "advanced";
export type ThenOp = "none" | "div" | "mul" | "fixed";

/** Everything the convert form can hold, for either mode at once -- so
 * switching modes never discards the other half's selections. */
export type FormState = {
    mode: Mode;
    field: string;
    from: string;
    to: string; // a step name, e.g. "hex>dec"
    then: ThenOp;
    amount: string;
    rules: string;
};

const DEFAULT_STATE: FormState = {
    mode: "simple",
    field: "$.result",
    from: DEFAULT_FROM,
    to: DEFAULT_TO_STEP,
    then: "none",
    amount: "",
    rules: "",
};

const MODE_OPTIONS: FormInputSelectOption[] = [
    {label: "Simple", value: "simple"},
    {label: "Advanced", value: "advanced"},
];

const THEN_OPTIONS: FormInputSelectOption[] = [
    {label: "none", value: "none"},
    {label: "divide by", value: "div"},
    {label: "multiply by", value: "mul"},
    {label: "round to N places", value: "fixed"},
];

function isThenOp(value: unknown): value is ThenOp {
    return value === "none" || value === "div" || value === "mul" || value === "fixed";
}

function isValidFrom(value: unknown): value is string {
    return typeof value === "string" && FROM_OPTIONS.some((o) => o.value === value);
}

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

/**
 * Attempts to represent a legacy (pre-#19) DSL string as Simple-mode field
 * values. Reuses `parseRules` rather than writing a second parser -- it
 * already owns step-name/arity validation, and a `RuleError` from it simply
 * means "not representable in Simple, fall back to Advanced", not a crash.
 *
 * Returns `null` (meaning: stay in Advanced) unless ALL of these hold:
 * - the text is exactly one rule (one non-comment, non-blank line)
 * - that rule's first step is a registered from/to conversion step
 * - the rule has either no second step, or exactly one second step that is
 *   `div`/`mul`/`fixed` with its single (already arity-checked) argument
 *
 * Anything else -- multiple rules, a chain of two or more conversions, an
 * unmappable first step -- is out of Simple mode's reach and stays Advanced.
 */
function tryMigrateLegacyToSimple(
    rulesText: string,
): Pick<FormState, "field" | "from" | "to" | "then" | "amount"> | null {
    let parsed: ReturnType<typeof parseRules>;
    try {
        parsed = parseRules(rulesText);
    } catch (err) {
        if (err instanceof RuleError) return null;
        throw err;
    }

    if (parsed.length !== 1) return null;
    const rule = parsed[0];
    if (rule == null) return null;

    const [first, second, ...rest] = rule.steps;
    if (first == null || rest.length > 0) return null;

    const edge = edgeForStep(first.name);
    if (edge == null) return null;

    if (second == null) {
        return {field: rule.selector, from: edge.from, to: edge.step, then: "none", amount: ""};
    }

    if (second.name !== "div" && second.name !== "mul" && second.name !== "fixed") return null;
    const amount = second.args[0];
    if (amount == null) return null;

    return {field: rule.selector, from: edge.from, to: edge.step, then: second.name, amount};
}

/**
 * Normalises whatever is under the store key into a full `FormState`.
 *
 * A pre-#19 saved entry is a plain DSL string. If it can be represented in
 * Simple mode (see `tryMigrateLegacyToSimple`), it migrates there directly
 * -- most legacy rules were exactly this shape, and defaulting them all into
 * Advanced made Simple mode effectively unreachable for anyone who'd used
 * the plugin before #19 landed. Only a rule Simple genuinely cannot express
 * falls back to Advanced. Either way the original text is kept in `rules`
 * unchanged, so switching to Advanced (or Simple mode failing to reproduce
 * it for any reason) never loses it. Anything else unexpected (corrupt
 * data, a future schema change) falls back field-by-field to
 * `DEFAULT_STATE` rather than being treated as a hard failure.
 */
export function normalizeSaved(raw: unknown): FormState {
    if (typeof raw === "string") {
        const migrated = tryMigrateLegacyToSimple(raw);
        if (migrated != null) {
            return {...DEFAULT_STATE, ...migrated, mode: "simple", rules: raw};
        }
        return {...DEFAULT_STATE, mode: "advanced", rules: raw};
    }
    if (raw != null && typeof raw === "object") {
        const obj = raw as Partial<Record<keyof FormState, unknown>>;
        const from = isValidFrom(obj.from) ? obj.from : DEFAULT_STATE.from;
        const requestedTo = typeof obj.to === "string" ? obj.to : DEFAULT_STATE.to;
        const validTo = toOptionsFor(from);
        const to = validTo.some((o) => o.value === requestedTo) ? requestedTo : (validTo[0]?.value ?? DEFAULT_STATE.to);
        return {
            mode: obj.mode === "advanced" ? "advanced" : "simple",
            field: typeof obj.field === "string" ? obj.field : DEFAULT_STATE.field,
            from,
            to,
            then: isThenOp(obj.then) ? obj.then : DEFAULT_STATE.then,
            amount: typeof obj.amount === "string" ? obj.amount : DEFAULT_STATE.amount,
            rules: typeof obj.rules === "string" ? obj.rules : DEFAULT_STATE.rules,
        };
    }
    return DEFAULT_STATE;
}

/**
 * Resolves one field of the confirmed (or in-flight, for `dynamic`) form
 * values against the saved state: an edited field (present in `values`,
 * even as `""`) wins; an untouched one (absent) falls back to what the
 * dialog was actually showing (`saved`), never to a blank. This is the
 * per-field trap the whole form has to get right -- see #19 and #17.
 */
function resolveString(values: Record<string, unknown>, name: string, fallback: string): string {
    const value = values[name];
    return typeof value === "string" ? value : fallback;
}

/**
 * Resolves the full live state of the form from whatever partial values are
 * currently known (either the final confirmed values, or the in-progress
 * values `dynamic` is re-evaluated against) plus the saved state as the
 * per-field fallback. Also re-validates `to` against the resolved `from`:
 * if the user just changed From, a stale To value from before the change is
 * replaced with the first option valid for the new From, rather than being
 * carried forward as a mismatched pair.
 */
function resolveLiveState(values: Record<string, unknown>, saved: FormState): FormState {
    const modeRaw = resolveString(values, "mode", saved.mode);
    const mode: Mode = modeRaw === "advanced" ? "advanced" : "simple";

    const field = resolveString(values, "field", saved.field);

    const fromRaw = resolveString(values, "from", saved.from);
    const from = isValidFrom(fromRaw) ? fromRaw : DEFAULT_FROM;

    const validTo = toOptionsFor(from);
    const requestedTo = resolveString(values, "to", saved.to);
    const to = validTo.some((o) => o.value === requestedTo) ? requestedTo : (validTo[0]?.value ?? DEFAULT_TO_STEP);

    const thenRaw = resolveString(values, "then", saved.then);
    const then: ThenOp = isThenOp(thenRaw) ? thenRaw : "none";

    const amount = resolveString(values, "amount", saved.amount);
    const rules = resolveString(values, "rules", saved.rules);

    return {mode, field, from, to, then, amount, rules};
}

/** Composes the Simple-mode selections into exactly one DSL rule, fed
 * through the same `parseRules`/`applyRules` engine Advanced mode uses --
 * there is no second execution path. */
function buildSimpleRuleText(state: FormState): string {
    let rule = `${state.field} | ${state.to}`;
    if (state.then !== "none") {
        rule += ` | ${state.then} ${state.amount}`;
    }
    return rule;
}

/**
 * Yaak's real `DynamicPromptFormArg` type attaches `dynamic` to each
 * individual input, not once to the whole form: every re-evaluation gets
 * the form's full live `values` map, but may only return a partial update
 * to the ONE input it belongs to (its own `hidden`/`options`/`defaultValue`
 * etc.), not the input array as a whole. So every conditionally-visible
 * input below carries its own small `dynamic` callback, each independently
 * re-deriving the live `FormState` from `args.values` (falling back to
 * `saved` per field, via `resolveLiveState`) and reading off just the one
 * property it owns.
 */
function buildInputs(saved: FormState): DynamicPromptFormArg[] {
    const initial = saved;
    const liveState = (values: Record<string, unknown>) => resolveLiveState(values, saved);

    return [
        {
            type: "select",
            name: "mode",
            label: "Mode",
            options: MODE_OPTIONS,
            defaultValue: initial.mode,
        },
        {
            type: "text",
            name: "field",
            label: "Field",
            defaultValue: initial.field,
            placeholder: DEFAULT_STATE.field,
            description: "JSONPath to the value(s) to convert",
            hidden: initial.mode !== "simple",
            dynamic: (_ctx, args) => ({hidden: liveState(args.values).mode !== "simple"}),
        },
        {
            type: "select",
            name: "from",
            label: "From",
            options: FROM_OPTIONS,
            defaultValue: initial.from,
            hidden: initial.mode !== "simple",
            dynamic: (_ctx, args) => ({hidden: liveState(args.values).mode !== "simple"}),
        },
        {
            type: "select",
            name: "to",
            label: "To",
            options: toOptionsFor(initial.from),
            defaultValue: initial.to,
            hidden: initial.mode !== "simple",
            dynamic: (_ctx, args) => {
                const state = liveState(args.values);
                return {hidden: state.mode !== "simple", options: toOptionsFor(state.from), defaultValue: state.to};
            },
        },
        {
            type: "select",
            name: "then",
            label: "Then",
            options: THEN_OPTIONS,
            defaultValue: initial.then,
            hidden: initial.mode !== "simple",
            dynamic: (_ctx, args) => ({hidden: liveState(args.values).mode !== "simple"}),
        },
        {
            type: "text",
            name: "amount",
            label: "Amount",
            defaultValue: initial.amount,
            optional: true,
            hidden: initial.mode !== "simple" || initial.then === "none",
            dynamic: (_ctx, args) => {
                const state = liveState(args.values);
                return {hidden: state.mode !== "simple" || state.then === "none"};
            },
        },
        {
            type: "markdown",
            content: STEP_REFERENCE,
            hidden: initial.mode !== "advanced",
            dynamic: (_ctx, args) => ({hidden: liveState(args.values).mode !== "advanced"}),
        },
        {
            type: "editor",
            name: "rules",
            label: "Rules",
            language: "text",
            defaultValue: initial.rules,
            placeholder: PLACEHOLDER,
            description: "One rule per line: <jsonpath> | <step> | <step>",
            hidden: initial.mode !== "advanced",
            dynamic: (_ctx, args) => ({hidden: liveState(args.values).mode !== "advanced"}),
        },
    ];
}

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

    const saved = normalizeSaved(await ctx.store.get<unknown>(storeKey(httpRequest.id)));

    const values = await ctx.prompt.form({
        id: "filter-convert-rules",
        title: "Convert response",
        confirmText: "Convert",
        inputs: buildInputs(saved),
    });

    // A genuine cancel (backdrop click, escape, explicit Cancel) resolves
    // `values` itself to `null`. Do nothing at all -- not even a store read
    // was meant to matter here.
    if (values == null) return;

    // Yaak's prompt value state starts as `{}` and is populated ONLY by each
    // input's own `onChange`, which fires only when the user actually edits
    // it (see apps/yaak-client/components/core/Prompt.tsx). So a field being
    // `undefined` here does NOT mean it was blank/unselected -- it means the
    // user confirmed without touching it. Every field is resolved
    // independently against the saved state; a partially-filled `values`
    // object must never be treated as a cancel, nor must an untouched field
    // be treated as empty.
    const state = resolveLiveState(values, saved);

    // Which text field decides "was this actively cleared" depends on the
    // resolved mode: Field in Simple, Rules in Advanced -- mirroring the
    // single-editor behaviour this form replaces (see #17).
    const editedKey = state.mode === "advanced" ? "rules" : "field";
    const edited = typeof values[editedKey] === "string";
    const primaryText = state.mode === "advanced" ? state.rules : state.field;

    // A blank primary text now means one of two different things depending
    // on how it got here, and they must not be conflated:
    if (primaryText.trim() === "") {
        if (edited) {
            // The user actively cleared a field that had content -- clearing
            // a prefilled field IS an edit, so `onChange` still fires with
            // `""`. Treat it as an explicit CLEAR: without this, once any
            // conversion (good or broken) is saved for a request, there
            // would be no path back to "nothing saved" -- clearing the box
            // and confirming would do nothing, and the stale value would
            // keep reappearing on every future run. Acknowledge it with a
            // toast so the action isn't mistaken for the dialog swallowing
            // input.
            await ctx.store.delete(storeKey(httpRequest.id));
            await ctx.toast.show({color: "info", message: "Cleared the saved conversion for this request"});
        } else {
            // Confirmed without editing, and there was nothing saved to fall
            // back to either -- there is nothing to clear and nothing to
            // convert. "Cleared" would be a lie here, so say what actually
            // happened instead.
            const message = state.mode === "advanced" ? "No rules entered" : "No field entered";
            await ctx.toast.show({color: "warning", message});
        }
        return;
    }

    const rulesText = state.mode === "advanced" ? state.rules : buildSimpleRuleText(state);

    // Persist the resolved structured state before it is validated at all.
    // If parsing or conversion fails below, this is what the dialog
    // prefills next time, so the user is fixing their last attempt rather
    // than retyping it from scratch.
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
        await ctx.store.set(storeKey(httpRequest.id), state);

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
