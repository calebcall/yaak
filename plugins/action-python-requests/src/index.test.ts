import {describe, expect, it} from "vitest";
import {plugin} from "./index";

describe("plugin definition", () => {
    it("registers exactly one HTTP request action", () => {
        expect(plugin.httpRequestActions).toHaveLength(1);
    });

    it("exposes the Copy as Python action with a selectable handler", () => {
        const action = plugin.httpRequestActions?.[0];
        expect(action?.label).toBe("Copy as Python");
        expect(typeof action?.onSelect).toBe("function");
    });
});
