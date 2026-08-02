import {JSONPath} from "jsonpath-plus";
import {RuleError, StepError} from "./errors";
import type {Rule} from "./dsl";
import {runStep} from "./steps";

export type ApplyResult = {value: unknown; converted: number};

type Match = {value: unknown; parent: unknown; parentProperty: string | number | null};

export function applyRules(root: unknown, rules: Rule[]): ApplyResult {
    let current = root;
    let converted = 0;

    for (const rule of rules) {
        let matches: Match[];
        try {
            matches = JSONPath({path: rule.selector, json: current as object, resultType: "all"}) as Match[];
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            throw new RuleError(`invalid selector "${rule.selector}": ${detail}`);
        }

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
                (match.parent as Record<string | number, unknown>)[match.parentProperty] = value;
            }
            converted += 1;
        }
    }

    return {value: current, converted};
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
