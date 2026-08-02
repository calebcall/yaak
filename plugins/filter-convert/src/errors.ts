/** A value could not be converted. The value is left untouched; not user-facing. */
export class StepError extends Error {
    override name = "StepError";
}

/** A rule could not be parsed, or the payload was not JSON. Aborts the whole filter. */
export class RuleError extends Error {
    override name = "RuleError";
}
