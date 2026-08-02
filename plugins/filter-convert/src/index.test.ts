import {describe, expect, it} from "vitest";
import {plugin} from "./index";

describe("plugin definition", () => {
    it("registers exactly one HTTP request action", () => {
        expect(plugin.httpRequestActions).toHaveLength(1);
    });

    it("labels the action Convert response", () => {
        expect(plugin.httpRequestActions?.[0]?.label).toBe("Convert response");
        expect(typeof plugin.httpRequestActions?.[0]?.onSelect).toBe("function");
    });
});
