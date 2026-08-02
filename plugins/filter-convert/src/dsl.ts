import {RuleError} from "./errors";
import {STEPS} from "./steps";

export type ParsedStep = {name: string; args: string[]};
export type Rule = {selector: string; steps: ParsedStep[]};

/**
 * Split a rule line on `|` characters that sit outside brackets, parentheses
 * and quotes. JSONPath filters legitimately contain `||`, as in
 * `$[?(@.a || @.b)]`, and bracket-notation properties may themselves contain
 * a literal `|`, as in `$['a|b']` or `$["a|b"]`.
 *
 * Bracket/paren nesting is tracked with a single depth counter, not a stack
 * of bracket kinds, and this is NOT a JSONPath validator -- it only finds
 * pipes that sit outside any bracket/paren/quote. Two known consequences of
 * that narrowness, both deliberately accepted rather than fixed here:
 *
 * - A pathological selector whose brackets net to zero depth despite being
 *   mismatched (e.g. a stray `)(`) is not caught here -- it is left for
 *   Task 11's jsonpath-plus call to reject at evaluation time.
 * - More subtly, a *genuinely balanced* bracket or paren that appears before
 *   the pipe the user actually intended as the selector/step separator will
 *   absorb that pipe too, e.g. `$.a( | hex>dec ) | fixed 2` parses as
 *   selector `$.a( | hex>dec )` with the single step `fixed 2` -- the
 *   `hex>dec` step is silently swallowed into the selector text with no
 *   parser diagnostic. This is intentionally not treated as an error: the
 *   parser cannot know which pipe the user meant, and full JSONPath grammar
 *   validation (which alone could tell "real" filter syntax from stray
 *   punctuation) is out of scope for a module whose only job is splitting on
 *   pipes. The consequence is bounded and safe rather than silently wrong:
 *   `|` is not valid JSONPath outside a filter expression, so a mangled
 *   selector like `$.a( | hex>dec )` is not valid JSONPath either. Rather
 *   than throwing, jsonpath-plus returns an empty match set for it, so
 *   Task 12 reports "No values were converted -- check the selector" --
 *   the user is told to look at the right thing, even though the parser
 *   itself stayed silent.
 *
 * What *is* caught here, because it would otherwise silently swallow the
 * rest of the line (including every step) into the selector with no
 * downstream signal at all, is a selector whose depth never returns to
 * zero, or a quote that never closes.
 *
 * Inside a quoted section, a backslash escapes the next character so it
 * cannot prematurely close the quote, e.g. `$['a\'b']`. This is a
 * deliberate choice, mirroring ordinary string-escaping convention: without
 * it, an escaped quote inside bracket notation would flip the scanner's
 * quote state early and corrupt the split.
 */
function splitTopLevel(line: string): string[] {
    const chars = Array.from(line);
    const parts: string[] = [];
    let current = "";
    let depth = 0;
    let quote: string | null = null;

    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (ch === undefined) continue;

        if (quote != null) {
            if (ch === "\\" && i + 1 < chars.length) {
                const next = chars[i + 1];
                current += ch + (next ?? "");
                i += 1;
                continue;
            }
            if (ch === quote) quote = null;
            current += ch;
            continue;
        }

        if (ch === "'" || ch === '"') {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === "[" || ch === "(") depth += 1;
        if (ch === "]" || ch === ")") depth -= 1;
        if (ch === "|" && depth === 0) {
            parts.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    parts.push(current);

    if (quote != null) throw new RuleError(`unterminated quote in rule: ${line}`);
    if (depth !== 0) throw new RuleError(`unbalanced brackets or parentheses in rule: ${line}`);

    return parts;
}

export function parseRules(text: string): Rule[] {
    const rules: Rule[] = [];

    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#")) continue;

        const [selectorPart, ...stepParts] = splitTopLevel(line);
        const selector = (selectorPart ?? "").trim();

        if (selector === "") throw new RuleError(`empty selector in rule: ${line}`);
        if (stepParts.length === 0) throw new RuleError(`no step given in rule: ${line}`);

        const steps = stepParts.map((part) => parseStep(part.trim(), line));
        rules.push({selector, steps});
    }

    return rules;
}

function parseStep(text: string, line: string): ParsedStep {
    if (text === "") throw new RuleError(`empty step in rule: ${line}`);

    const [name, ...args] = text.split(/\s+/);
    const step = STEPS[name ?? ""];
    if (step == null) throw new RuleError(`unknown step "${name}" in rule: ${line}`);

    if (args.length !== step.arity) {
        const plural = step.arity === 1 ? "argument" : "arguments";
        throw new RuleError(
            `step "${name}" expects ${step.arity} ${plural}, got ${args.length} in rule: ${line}`,
        );
    }
    return {name: name ?? "", args};
}
