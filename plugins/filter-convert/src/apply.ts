import {JSONPath} from "jsonpath-plus";
import {RuleError, StepError} from "./errors";
import type {Rule} from "./dsl";
import {runStep} from "./steps";

export type ApplyResult = {value: unknown; converted: number; matched: number};

type Match = {value: unknown; parent: unknown; parentProperty: string | number | null};

export function applyRules(root: unknown, rules: Rule[]): ApplyResult {
    let current = root;
    let converted = 0;
    let matched = 0;

    for (const rule of rules) {
        let matches: Match[];
        try {
            // jsonpath-plus does not always throw for a document it cannot
            // traverse: a null/undefined `json` (e.g. a "null" or empty
            // response body) makes it return `undefined` instead of `[]`.
            // Treat any non-array result as zero matches rather than
            // assuming the call either throws or returns an array -- the
            // genuinely-throwing case (e.g. "$[(") is still caught below.
            const result: unknown = JSONPath({
                path: rule.selector,
                json: current as object,
                resultType: "all",
            });
            matches = Array.isArray(result) ? (result as Match[]) : [];
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            throw new RuleError(`invalid selector "${rule.selector}": ${detail}`);
        }

        matched += matches.length;

        for (const match of matches) {
            let value = match.value;
            try {
                for (const step of rule.steps) {
                    value = runStep(step.name, value, step.args);
                }
            } catch (err) {
                if (err instanceof StepError) continue; // soft failure: leave the value alone
                throw err;
            }

            if (match.parentProperty == null) {
                current = value; // the selector matched the document root
            } else {
                // Assumes match.parent is still a live reference reachable
                // from `current`. That holds today because every step
                // rejects object/array input, so a match whose own value is
                // a container can never survive a step chain to reach this
                // branch; only leaf (non-container) values get replaced
                // in-place through their parent. If a future step is added
                // that accepts container values, replacing one match before
                // a later match from the same call is processed could write
                // through a parent reference that this rule's earlier
                // replacement has already detached.
                (match.parent as Record<string | number, unknown>)[match.parentProperty] = value;
            }
            converted += 1;
        }
    }

    return {value: current, converted, matched};
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** BigInt cannot be serialised by JSON.stringify, so it is narrowed here. */
export function serialise(value: unknown): string {
    return JSON.stringify(
        value,
        (_key, v: unknown) => {
            if (typeof v !== "bigint") return v;
            return v <= MAX_SAFE && v >= -MAX_SAFE ? Number(v) : v.toString();
        },
        2,
    );
}
