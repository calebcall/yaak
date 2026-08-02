import type {FormInputSelectOption} from "@yaakapp/api";
import {STEPS} from "./steps";

export type ConversionEdge = {step: string; from: string; to: string};

/**
 * Steps that take a numeric argument rather than converting between two
 * representations. These are surfaced in the Simple form as the Then/Amount
 * controls, never as a From or To option.
 */
const NON_CONVERSION_STEPS = new Set(["div", "mul", "fixed"]);

/**
 * Bare-named steps (no `>` in the name) that decode FROM the labelled
 * encoding INTO text. Their own step name doubles as the token looked up in
 * TOKEN_LABELS below, so the label is never hand-duplicated here.
 */
const DECODE_ALIAS_STEPS = new Set(["base64", "base64url", "hexbytes", "urlenc"]);

/**
 * Structured steps whose name gives no hint at all about its from/to shape
 * (unlike e.g. `hex>dec`, there is no token to derive a label from), so the
 * pair is spelled out explicitly. This is the minimum irreducible knowledge
 * needed for these two steps -- everything else in this module is derived
 * from `STEPS`'s own keys.
 */
const STRUCTURED_EDGES: Record<string, {from: string; to: string}> = {
    json: {from: "JSON string", to: "value"},
    jwt: {from: "JWT", to: "claims"},
};

/**
 * Human-readable labels for every token that appears on either side of an
 * `a>b`-named step, plus the decode-alias step names themselves (looked up
 * by their own name, since those steps have no `>`). `ms` and `epoch_ms`
 * deliberately share a label: both denote "a number of milliseconds", one as
 * a timestamp (`epoch_ms>date`) and one as a plain duration count
 * (`ms>duration`).
 */
const TOKEN_LABELS: Record<string, string> = {
    hex: "hex",
    dec: "decimal",
    bin: "binary",
    oct: "octal",
    epoch_s: "epoch seconds",
    epoch_ms: "epoch millis",
    ms: "epoch millis",
    date: "ISO date",
    duration: "duration",
    text: "text",
    base64: "base64",
    base64url: "base64url",
    hexbytes: "hex bytes",
    urlenc: "URL-encoded",
};

/**
 * Overrides the DISPLAYED label for a handful of internal type ids whose
 * plain name reads as ambiguous next to a similarly-worded sibling --
 * `hex` (a base-16 *number*) sitting beside `hex bytes` (a hex-encoded
 * *byte string* that decodes to text) is the motivating case (#19 review):
 * a user who has never read the README could easily pick the wrong one and
 * get a nonsensical result. This is a display-only layer: `CONVERSION_EDGES`,
 * `toOptionsFor`'s filtering, `FormInputSelectOption.value`, and everything
 * persisted to the store all keep using the plain id (`"hex"`, `"hex
 * bytes"`, ...) below -- only the text shown in the dropdown changes, so
 * this never invalidates a previously-saved selection.
 */
const DISPLAY_LABEL_OVERRIDES: Record<string, string> = {
    hex: "hex number",
    "hex bytes": "hex bytes (text)",
};

function displayLabel(id: string): string {
    return DISPLAY_LABEL_OVERRIDES[id] ?? id;
}

/**
 * Derives every from->to conversion edge straight from `STEPS`'s own keys,
 * so the Simple-mode form can never silently drop a step as the registry
 * grows: a step this module doesn't know how to label throws immediately at
 * import time (surfaced by a test, not a silently-missing dropdown entry).
 */
function deriveEdges(): ConversionEdge[] {
    const edges: ConversionEdge[] = [];

    for (const step of Object.keys(STEPS)) {
        if (NON_CONVERSION_STEPS.has(step)) continue;

        const structured = STRUCTURED_EDGES[step];
        if (structured != null) {
            edges.push({step, from: structured.from, to: structured.to});
            continue;
        }

        if (DECODE_ALIAS_STEPS.has(step)) {
            const label = TOKEN_LABELS[step];
            if (label == null) {
                throw new Error(`filter-convert: no label for decode-alias step "${step}"`);
            }
            edges.push({step, from: label, to: "text"});
            continue;
        }

        const arrow = step.indexOf(">");
        if (arrow === -1) {
            throw new Error(
                `filter-convert: step "${step}" has no known from/to mapping for the Simple form`,
            );
        }
        const fromToken = step.slice(0, arrow);
        const toToken = step.slice(arrow + 1);
        const from = TOKEN_LABELS[fromToken];
        const to = TOKEN_LABELS[toToken];
        if (from == null || to == null) {
            const badToken = from == null ? fromToken : toToken;
            throw new Error(`filter-convert: no label for token "${badToken}" in step "${step}"`);
        }
        edges.push({step, from, to});
    }

    return edges;
}

/** Every from->to conversion edge, derived from the registry -- never hand-maintained. */
export const CONVERSION_EDGES: ConversionEdge[] = deriveEdges();

/** The set of step names covered by `CONVERSION_EDGES`, i.e. every registered
 * step except the documented div/mul/fixed exceptions. */
export function conversionStepNames(): Set<string> {
    return new Set(CONVERSION_EDGES.map((e) => e.step));
}

/** From options for the Simple-mode select, in registry-discovery order,
 * deduplicated. `value` is the stable internal id (also what's persisted to
 * the store); `label` is the possibly-overridden display text. */
export const FROM_OPTIONS: FormInputSelectOption[] = (() => {
    const seen = new Set<string>();
    const options: FormInputSelectOption[] = [];
    for (const edge of CONVERSION_EDGES) {
        if (seen.has(edge.from)) continue;
        seen.add(edge.from);
        options.push({label: displayLabel(edge.from), value: edge.from});
    }
    return options;
})();

/** To options for a given From id. The option's `value` is the step name
 * itself, so picking a To option fully determines which step to run --
 * there is no separate from+to -> step lookup to keep in sync. `label` is
 * the possibly-overridden display text for the To id. */
export function toOptionsFor(from: string): FormInputSelectOption[] {
    return CONVERSION_EDGES.filter((e) => e.from === from).map((e) => ({
        label: displayLabel(e.to),
        value: e.step,
    }));
}

const firstFrom = FROM_OPTIONS[0];
if (firstFrom == null) {
    throw new Error("filter-convert: no conversion steps registered");
}
/** The Simple form's default From, matching the plugin's historical default rule. */
export const DEFAULT_FROM: string = firstFrom.value;

const firstTo = toOptionsFor(DEFAULT_FROM)[0];
if (firstTo == null) {
    throw new Error(`filter-convert: no To options for default From "${DEFAULT_FROM}"`);
}
/** The Simple form's default To (a step name), matching the plugin's historical default rule. */
export const DEFAULT_TO_STEP: string = firstTo.value;
