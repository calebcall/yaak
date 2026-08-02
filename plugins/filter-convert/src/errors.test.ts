import {describe, expect, it} from "vitest";
import {RuleError, StepError} from "./errors";

describe("error types", () => {
    it("distinguishes soft step failures from fatal rule failures", () => {
        expect(new StepError("nope")).toBeInstanceOf(Error);
        expect(new RuleError("bad")).toBeInstanceOf(Error);
        expect(new StepError("nope")).not.toBeInstanceOf(RuleError);
    });

    it("carries its message", () => {
        expect(new StepError("not hex").message).toBe("not hex");
    });
});
