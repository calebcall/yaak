import type {Context, HttpRequest} from "@yaakapp/api";
import {describe, expect, it} from "vitest";
import {buildStepFamilySections, convertResponse} from "./action";
import {STEPS} from "./steps";
import type {ConvertFormOptions} from "./testSupport";
import {resolveConvertFormValues} from "./testSupport";

const REQUEST = {id: "rq_1", name: "block", url: "https://x"} as HttpRequest;
const RPC = JSON.stringify({jsonrpc: "2.0", id: 83, result: "0x1879687"});

type DynamicFn = (
    ctx: unknown,
    args: {values: Record<string, unknown>},
) => Partial<FormInput> | Promise<Partial<FormInput>>;

type FormInput = {
    name?: string;
    type?: string;
    label?: string;
    defaultValue?: string;
    hidden?: boolean;
    content?: string;
    language?: string;
    options?: Array<{label: string; value: string}>;
    dynamic?: DynamicFn;
};

/**
 * Records every side effect the action performs. The store is a real, stateful
 * Map (not just a spy) so tests can drive multiple invocations of
 * `convertResponse` against the same ctx and see earlier writes/deletes
 * reflected in later reads -- needed to test that a clear actually clears.
 */
function harness(options: {
    body?: string | null;
    /** Whatever is currently under the store key: `undefined` (nothing saved
     * yet), a legacy plain string, or a structured settings object. */
    saved?: unknown;
    /**
     * What the settings dialog resolves to on confirm. Defaults to `{}`
     * (confirmed without editing anything) -- shares
     * `resolveConvertFormValues` with fixtures.test.ts rather than
     * maintaining a second, independent model of the dialog.
     */
    values?: ConvertFormOptions;
} = {}) {
    const calls = {
        toasts: [] as Array<{color?: string; message: string}>,
        formInputs: [] as FormInput[][],
        stored: {} as Record<string, unknown>,
        deleted: [] as string[],
        findRequestIds: [] as string[],
        shownResult: null as string | null,
    };
    const store = new Map<string, unknown>();
    if (options.saved !== undefined) store.set("rules:rq_1", options.saved);

    const ctx = {
        httpResponse: {
            find: async (args: {requestId: string; limit?: number}) => {
                calls.findRequestIds.push(args.requestId);
                return options.body === null ? [] : [{id: "rs_1", bodyPath: "/fake/body.json"}];
            },
        },
        store: {
            get: async (k: string) => store.get(k),
            set: async (k: string, v: unknown) => {
                store.set(k, v);
                calls.stored[k] = v;
            },
            delete: async (k: string) => {
                const had = store.has(k);
                store.delete(k);
                calls.deleted.push(k);
                return had;
            },
        },
        prompt: {
            text: async () => null,
            form: async (args: {inputs: FormInput[]}) => {
                calls.formInputs.push(args.inputs);
                // Distinguish the two dialogs this action shows by which named
                // input they carry, not by call order -- a test may drive
                // `convertResponse` more than once against the same harness.
                // Only the settings dialog carries a "mode" input.
                if (args.inputs.some((i) => i.name === "mode")) {
                    return resolveConvertFormValues(options.values ?? {});
                }
                const input = args.inputs.find((i) => i.name === "result");
                calls.shownResult = input?.defaultValue ?? null;
                return {};
            },
        },
        toast: {show: async (t: {color?: string; message: string}) => void calls.toasts.push(t)},
    } as unknown as Context;

    const deps = {readBody: () => options.body ?? RPC};
    return {ctx, deps, calls};
}

describe("convertResponse", () => {
    describe("Simple mode defaults", () => {
        it("converts the motivating payload with no syntax typed", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(JSON.parse(h.calls.shownResult!)).toEqual({jsonrpc: "2.0", id: 83, result: 25663111});
        });

        it("defaults to Simple mode, Field $.result, From hex, To decimal, Then none", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.name === "mode")?.defaultValue).toBe("simple");
            expect(first.find((i) => i.name === "field")?.defaultValue).toBe("$.result");
            expect(first.find((i) => i.name === "from")?.defaultValue).toBe("hex");
            expect(first.find((i) => i.name === "to")?.defaultValue).toBe("hex>dec");
            expect(first.find((i) => i.name === "then")?.defaultValue).toBe("none");
        });

        it("hides the Advanced markdown and Rules editor, shows the Simple inputs", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.type === "markdown")?.hidden).toBe(true);
            expect(first.find((i) => i.name === "rules")?.hidden).toBe(true);
            expect(first.find((i) => i.name === "field")?.hidden).toBe(false);
            expect(first.find((i) => i.name === "from")?.hidden).toBe(false);
            expect(first.find((i) => i.name === "to")?.hidden).toBe(false);
            expect(first.find((i) => i.name === "then")?.hidden).toBe(false);
        });

        it("hides Amount until Then is set", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.name === "amount")?.hidden).toBe(true);
        });

        it("saves the resolved structured state against the request id", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(h.calls.stored["rules:rq_1"]).toEqual({
                mode: "simple",
                field: "$.result",
                from: "hex",
                to: "hex>dec",
                then: "none",
                amount: "",
                rules: "",
            });
        });
    });

    // Yaak's real `dynamic` callback lives on each individual input (it can
    // only return a partial update to the ONE input it belongs to), not
    // once on the whole form -- see the comment on `buildInputs` in
    // action.ts. Each test below drives one input's own `dynamic` directly.
    describe("dynamic()", () => {
        function inputNamed(inputs: FormInput[], name: string): FormInput {
            const input = inputs.find((i) => i.name === name);
            if (input?.dynamic == null) throw new Error(`no dynamic input named "${name}"`);
            return input;
        }

        function markdownInput(inputs: FormInput[]): FormInput {
            const input = inputs.find((i) => i.type === "markdown");
            if (input?.dynamic == null) throw new Error("no dynamic markdown input");
            return input;
        }

        it("filters To options by the chosen From", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            const to = inputNamed(h.calls.formInputs[0]!, "to");
            const result = await to.dynamic!(h.ctx, {values: {from: "text"}});
            expect((result.options ?? []).map((o) => o.value).sort()).toEqual(
                ["text>base64", "text>base64url", "text>hexbytes", "text>urlenc"].sort(),
            );
        });

        it("resets To to a valid option when the new From no longer supports the old To", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            const to = inputNamed(h.calls.formInputs[0]!, "to");
            // "hex>dec" (the default To for From=hex) is not a valid To for From=text.
            const result = await to.dynamic!(h.ctx, {values: {from: "text", to: "hex>dec"}});
            expect(result.defaultValue).toBe("text>base64");
        });

        it("reveals Amount once Then is set to something other than none", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            const amount = inputNamed(h.calls.formInputs[0]!, "amount");
            const result = await amount.dynamic!(h.ctx, {values: {then: "div"}});
            expect(result.hidden).toBe(false);
        });

        it("keeps Amount hidden while Then is none", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            const amount = inputNamed(h.calls.formInputs[0]!, "amount");
            const result = await amount.dynamic!(h.ctx, {values: {then: "none"}});
            expect(result.hidden).toBe(true);
        });

        it("hides Simple inputs and shows Advanced when Mode switches to advanced", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            const field = await inputNamed(first, "field").dynamic!(h.ctx, {values: {mode: "advanced"}});
            const markdown = await markdownInput(first).dynamic!(h.ctx, {values: {mode: "advanced"}});
            const rules = await inputNamed(first, "rules").dynamic!(h.ctx, {values: {mode: "advanced"}});
            expect(field.hidden).toBe(true);
            expect(markdown.hidden).toBe(false);
            expect(rules.hidden).toBe(false);
        });

        it("hides Advanced and shows Simple inputs when Mode switches back to simple", async () => {
            // A multi-line legacy entry isn't representable in Simple, so this
            // opens already in Advanced mode; the dynamic() assertions below
            // only depend on the explicit `{mode: "simple"}` passed in, not on
            // where the dialog started, but this keeps the fixture honest.
            const h = harness({saved: "$.saved | hex>dec\n$.other | hex>dec"});
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            const field = await inputNamed(first, "field").dynamic!(h.ctx, {values: {mode: "simple"}});
            const markdown = await markdownInput(first).dynamic!(h.ctx, {values: {mode: "simple"}});
            expect(field.hidden).toBe(false);
            expect(markdown.hidden).toBe(true);
        });
    });

    describe("the unedited-field trap", () => {
        // A clean, semantically-valid chain with no Then/Amount, so the
        // conversion itself can be asserted alongside the persisted state.
        const SAVED_SIMPLE = {
            mode: "simple" as const,
            field: "$.custom",
            from: "decimal",
            to: "dec>hex",
            then: "none" as const,
            amount: "",
            rules: "",
        };

        it("reuses every saved selection when confirming without editing any field", async () => {
            const h = harness({body: JSON.stringify({custom: 40}), saved: SAVED_SIMPLE, values: {}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(JSON.parse(h.calls.shownResult!).custom).toBe("0x28");
            expect(h.calls.stored["rules:rq_1"]).toEqual(SAVED_SIMPLE);
        });

        it("keeps every other saved field when only `to` is edited", async () => {
            const h = harness({saved: SAVED_SIMPLE, values: {to: "dec>bin"}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(h.calls.stored["rules:rq_1"]).toEqual({...SAVED_SIMPLE, to: "dec>bin"});
        });

        it("keeps every other saved field when only `amount` is edited", async () => {
            // hex -> decimal, then div by an amount -- a chain where Amount
            // actually matters, distinct from SAVED_SIMPLE above.
            const savedWithThen = {
                mode: "simple" as const,
                field: "$.custom",
                from: "hex",
                to: "hex>dec",
                then: "div" as const,
                amount: "2",
                rules: "",
            };
            const h = harness({body: JSON.stringify({custom: "0x28"}), saved: savedWithThen, values: {amount: "4"}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(h.calls.stored["rules:rq_1"]).toEqual({...savedWithThen, amount: "4"});
            // 40 / 4 = 10, proving the edited amount (not the saved "2") was
            // actually used, not just persisted.
            expect(JSON.parse(h.calls.shownResult!).custom).toBe("10");
        });

        it("runs the conversion using the prefilled rules text when Advanced mode is confirmed without editing", async () => {
            const h = harness({saved: {...SAVED_SIMPLE, mode: "advanced", rules: "$.result | hex>dec"}, values: {}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(JSON.parse(h.calls.shownResult!)).toEqual({jsonrpc: "2.0", id: 83, result: 25663111});
        });
    });

    // #19 follow-up: a legacy plain-string entry unconditionally landing in
    // Advanced meant anyone who'd used the plugin before the form shipped
    // always saw Advanced on every request they'd touched -- Simple mode
    // was effectively unreachable for them. A legacy rule that Simple CAN
    // express now migrates there directly; only a genuinely unrepresentable
    // one (multiple rules, a chain of two-plus conversions, an unparsable
    // rule) falls back to Advanced. The original text is always kept in
    // `rules` either way, so nothing is lost regardless of which mode wins.
    describe("legacy migration", () => {
        it("migrates a single hex>dec rule into Simple with the right field values", async () => {
            const h = harness({saved: "$.result | hex>dec", values: {}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.name === "mode")?.defaultValue).toBe("simple");
            expect(first.find((i) => i.name === "field")?.defaultValue).toBe("$.result");
            expect(first.find((i) => i.name === "from")?.defaultValue).toBe("hex");
            expect(first.find((i) => i.name === "to")?.defaultValue).toBe("hex>dec");
            expect(first.find((i) => i.name === "then")?.defaultValue).toBe("none");
            expect(first.find((i) => i.name === "field")?.hidden).toBe(false);
            expect(first.find((i) => i.type === "markdown")?.hidden).toBe(true);
        });

        it("still runs the migrated legacy rule", async () => {
            const h = harness({body: JSON.stringify({result: "0x1879687"}), saved: "$.result | hex>dec", values: {}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(JSON.parse(h.calls.shownResult!).result).toBe(25663111);
        });

        it("migrates a hex>dec + div rule into Simple with Then and Amount set", async () => {
            const h = harness({saved: "$..value | hex>dec | div 1e18", values: {}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.name === "mode")?.defaultValue).toBe("simple");
            expect(first.find((i) => i.name === "field")?.defaultValue).toBe("$..value");
            expect(first.find((i) => i.name === "from")?.defaultValue).toBe("hex");
            expect(first.find((i) => i.name === "to")?.defaultValue).toBe("hex>dec");
            expect(first.find((i) => i.name === "then")?.defaultValue).toBe("div");
            expect(first.find((i) => i.name === "amount")?.defaultValue).toBe("1e18");
            expect(first.find((i) => i.name === "amount")?.hidden).toBe(false);
        });

        it("keeps a legacy multi-line rule set in Advanced with the text intact", async () => {
            const text = "$.result.number | hex>dec\n$.result.gasUsed | hex>dec";
            const h = harness({saved: text, values: {}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.name === "mode")?.defaultValue).toBe("advanced");
            expect(first.find((i) => i.name === "rules")?.defaultValue).toBe(text);
        });

        it("keeps a legacy two-conversion chain in Advanced with the text intact", async () => {
            const text = "$.a | base64 | json";
            const h = harness({saved: text, values: {}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.name === "mode")?.defaultValue).toBe("advanced");
            expect(first.find((i) => i.name === "rules")?.defaultValue).toBe(text);
        });

        it("keeps legacy text that fails to parse at all in Advanced rather than crashing", async () => {
            const text = "$.result | nope";
            const h = harness({saved: text, values: {}});
            await expect(convertResponse(h.ctx, REQUEST, h.deps)).resolves.toBeUndefined();
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.name === "mode")?.defaultValue).toBe("advanced");
            expect(first.find((i) => i.name === "rules")?.defaultValue).toBe(text);
        });

        it("does not override an explicit structured Advanced choice even when its rules are representable", async () => {
            const h = harness({
                saved: {
                    mode: "advanced",
                    field: "$.result",
                    from: "hex",
                    to: "hex>dec",
                    then: "none",
                    amount: "",
                    rules: "$.result | hex>dec",
                },
                values: {},
            });
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.name === "mode")?.defaultValue).toBe("advanced");
        });

        it("still opens a fresh request (nothing saved) in Simple", async () => {
            const h = harness();
            await convertResponse(h.ctx, REQUEST, h.deps);
            const first = h.calls.formInputs[0]!;
            expect(first.find((i) => i.name === "mode")?.defaultValue).toBe("simple");
        });

        it("rewrites a migrated legacy entry in structured shape after Convert, so migration happens once", async () => {
            const h = harness({saved: "$.result | hex>dec", values: {}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(h.calls.stored["rules:rq_1"]).toEqual({
                mode: "simple",
                field: "$.result",
                from: "hex",
                to: "hex>dec",
                then: "none",
                amount: "",
                rules: "$.result | hex>dec",
            });
        });
    });

    describe("Then/Amount rule composition", () => {
        it("appends `div <amount>` when Then is 'divide by'", async () => {
            const h = harness({
                body: JSON.stringify({result: "0xde0b6b3a7640000"}),
                values: {then: "div", amount: "1e18"},
            });
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(JSON.parse(h.calls.shownResult!).result).toBe("1");
        });

        it("appends `mul <amount>` when Then is 'multiply by'", async () => {
            const h = harness({body: JSON.stringify({result: "0xa"}), values: {then: "mul", amount: "2"}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(JSON.parse(h.calls.shownResult!).result).toBe("20");
        });

        it("appends `fixed <amount>` when Then is 'round to N places'", async () => {
            const h = harness({values: {then: "fixed", amount: "2"}}); // default body, default From hex -> To decimal
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(JSON.parse(h.calls.shownResult!).result).toBe("25663111.00");
        });
    });

    it("shows a step reference covering every registered step", async () => {
        const h = harness({values: {mode: "advanced"}});
        await convertResponse(h.ctx, REQUEST, h.deps);
        const first = h.calls.formInputs[0]!;
        const reference = first.find((i) => i.type === "markdown");
        expect(reference?.content).toBeTruthy();
        expect(reference!.content).toContain(buildStepFamilySections());
    });

    it("lists every registered step in the GENERATED family sections specifically", () => {
        const sections = buildStepFamilySections();
        for (const name of Object.keys(STEPS)) {
            expect(sections).toContain(name);
        }
    });

    it("shows the argument form for steps that take one, derived from arity", () => {
        const sections = buildStepFamilySections();
        expect(sections).toContain("`div <n>`");
        expect(sections).toContain("`mul <n>`");
        expect(sections).toContain("`fixed <n>`");
        expect(sections).toContain("`hex>dec`");
        expect(sections).not.toContain("hex>dec <n>");
    });

    it("never leaves an angle-bracket placeholder outside a code span", () => {
        const sections = buildStepFamilySections();
        const outsideCodeSpans = sections.replace(/`[^`]*`/g, "");
        expect(outsideCodeSpans).not.toMatch(/<[a-zA-Z]/);
    });

    it("shows worked examples covering the encoding and structured families", async () => {
        const h = harness({values: {mode: "advanced"}});
        await convertResponse(h.ctx, REQUEST, h.deps);
        const first = h.calls.formInputs[0]!;
        const reference = first.find((i) => i.type === "markdown");
        expect(reference?.content).toMatch(/base64.*\|.*json/);
        expect(reference?.content).toMatch(/jwt/);
    });

    it("offers the rules editor with JSON-free plain text", async () => {
        const h = harness();
        await convertResponse(h.ctx, REQUEST, h.deps);
        const first = h.calls.formInputs[0]!;
        const rules = first.find((i) => i.name === "rules");
        expect(rules?.type).toBe("editor");
        expect(rules?.language).not.toBe("json");
    });

    it("does nothing when the dialog is cancelled", async () => {
        const h = harness({values: {cancelled: true}});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.shownResult).toBeNull();
        expect(h.calls.stored).toEqual({});
        expect(h.calls.deleted).toEqual([]); // a genuine cancel must not touch the store at all
    });

    describe("clearing", () => {
        it("clears a previously saved conversion when Field (Simple) is actively emptied", async () => {
            const h = harness({saved: {mode: "simple", field: "$.old", from: "hex", to: "hex>dec", then: "none", amount: "", rules: ""}, values: {field: ""}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(h.calls.deleted).toEqual(["rules:rq_1"]);
            expect(h.calls.toasts.some((t) => /cleared/i.test(t.message))).toBe(true);
            expect(h.calls.stored).toEqual({});
            expect(h.calls.shownResult).toBeNull();
        });

        it("clears a previously saved conversion when Field is emptied to whitespace", async () => {
            const h = harness({saved: {mode: "simple", field: "$.old", from: "hex", to: "hex>dec", then: "none", amount: "", rules: ""}, values: {field: "   "}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(h.calls.deleted).toEqual(["rules:rq_1"]);
            expect(h.calls.toasts.some((t) => /cleared/i.test(t.message))).toBe(true);
        });

        it("clears a previously saved conversion when Rules (Advanced) is actively emptied", async () => {
            // Multi-line, so it stays in Advanced mode rather than migrating
            // to Simple -- this test is specifically about clearing Rules.
            const h = harness({saved: "$.saved | hex>dec\n$.other | hex>dec", values: {rules: ""}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(h.calls.deleted).toEqual(["rules:rq_1"]);
            expect(h.calls.toasts.some((t) => /cleared/i.test(t.message))).toBe(true);
            expect(h.calls.stored).toEqual({});
            expect(h.calls.shownResult).toBeNull();
        });

        it("clears without crashing when there was never a saved conversion", async () => {
            const h = harness({values: {field: ""}});
            await expect(convertResponse(h.ctx, REQUEST, h.deps)).resolves.toBeUndefined();
            expect(h.calls.deleted).toEqual(["rules:rq_1"]);
            expect(h.calls.shownResult).toBeNull();
        });

        it("gives an honest message when Advanced is selected but nothing was ever typed or saved", async () => {
            const h = harness({values: {mode: "advanced"}});
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(h.calls.toasts.some((t) => /no rules entered/i.test(t.message))).toBe(true);
            expect(h.calls.toasts.some((t) => /cleared/i.test(t.message))).toBe(false);
            expect(h.calls.deleted).toEqual([]);
            expect(h.calls.stored).toEqual({});
            expect(h.calls.shownResult).toBeNull();
        });

        // Defensive: a blank saved `field` should never occur through normal
        // use (clearing always deletes the whole entry, and the hardcoded
        // Simple default is never blank), but the fallback logic must still
        // behave sanely -- as "nothing entered", not a crash -- if it ever did.
        it("gives an honest message rather than crashing on a corrupted blank saved field", async () => {
            const h = harness({
                saved: {mode: "simple", field: "", from: "hex", to: "hex>dec", then: "none", amount: "", rules: ""},
                values: {},
            });
            await convertResponse(h.ctx, REQUEST, h.deps);
            expect(h.calls.toasts.some((t) => /no field entered/i.test(t.message))).toBe(true);
        });

        it("reverts fully to hardcoded defaults on the next open after a clear", async () => {
            // Multi-line, so it stays in Advanced mode (clearing Rules is the
            // thing under test) rather than migrating to Simple.
            const h = harness({saved: "$.saved | hex>dec\n$.other | hex>dec", values: {rules: ""}});
            await convertResponse(h.ctx, REQUEST, h.deps); // clears the saved rule
            await convertResponse(h.ctx, REQUEST, h.deps); // reopens against the now-empty store

            const settingsDialogs = h.calls.formInputs.filter((inputs) => inputs.some((i) => i.name === "mode"));
            expect(settingsDialogs).toHaveLength(2);
            const second = settingsDialogs[1]!;
            // The saved entry was deleted entirely, so the reopened dialog
            // falls all the way back to the plugin's hardcoded defaults --
            // Simple mode with the default Field -- not a lingering blank
            // Advanced/Rules state from before the clear.
            expect(second.find((i) => i.name === "mode")?.defaultValue).toBe("simple");
            expect(second.find((i) => i.name === "field")?.defaultValue).toBe("$.result");
            expect(second.find((i) => i.name === "rules")?.defaultValue).toBe("");
        });
    });

    it("toasts and stops when the request has no stored response", async () => {
        const h = harness({body: null});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.toasts[0]?.message).toMatch(/no response/i);
        expect(h.calls.shownResult).toBeNull();
    });

    it("toasts and stops when the body is not JSON", async () => {
        const h = harness({body: "not json"});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.toasts[0]?.message).toMatch(/not valid JSON/i);
        expect(h.calls.shownResult).toBeNull();
    });

    it("toasts the parse error for a malformed rule", async () => {
        const h = harness({values: {mode: "advanced", rules: "$.result | nope"}});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.toasts[0]?.message).toMatch(/unknown step/i);
        expect(h.calls.shownResult).toBeNull();
    });

    it("keeps the typed rules for next time even when they fail to parse", async () => {
        const h = harness({values: {mode: "advanced", rules: "$.result | nope"}});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.stored["rules:rq_1"]).toMatchObject({mode: "advanced", rules: "$.result | nope"});
    });

    it("still shows the result but warns when nothing matched", async () => {
        const h = harness({values: {mode: "advanced", rules: "$.nowhere | hex>dec"}});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.shownResult).not.toBeNull();
        expect(h.calls.toasts.some((t) => /no values matched/i.test(t.message))).toBe(true);
    });

    it("still shows the result but warns when matches could not be converted", async () => {
        const h = harness({values: {mode: "advanced", rules: "$.jsonrpc | hex>dec"}});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.shownResult).not.toBeNull();
        expect(
            h.calls.toasts.some((t) => /matched 1 value.*none could be converted/i.test(t.message)),
        ).toBe(true);
    });

    it("strips a BOM before parsing", async () => {
        const h = harness({body: `\uFEFF${RPC}`});
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(JSON.parse(h.calls.shownResult!).result).toBe(25663111);
    });

    it("toasts distinctly when the response body cannot be read", async () => {
        const h = harness();
        h.deps.readBody = () => {
            throw new Error("ENOENT: no such file or directory");
        };
        await convertResponse(h.ctx, REQUEST, h.deps);
        expect(h.calls.toasts[0]?.message).toMatch(/could not read/i);
        expect(h.calls.toasts[0]?.message).not.toMatch(/not valid json/i);
        expect(h.calls.shownResult).toBeNull();
    });

    // Previously this propagated the raw exception into the host, which
    // gives the user nothing but a bare, contextless runtime error. A
    // plugin should degrade gracefully instead: name what went wrong in a
    // toast rather than crash the caller. `RuleError` still gets its own
    // specific message (tested above); this is for everything else.
    it("toasts instead of throwing on an unexpected exception that isn't from reading the body", async () => {
        const h = harness();
        h.ctx.store.set = async () => {
            throw new Error("store is unavailable");
        };
        await expect(convertResponse(h.ctx, REQUEST, h.deps)).resolves.toBeUndefined();
        expect(h.calls.toasts.some((t) => t.color === "danger" && /store is unavailable/.test(t.message))).toBe(
            true,
        );
        expect(h.calls.shownResult).toBeNull();
    });

    // Regression for a real crash: JSON.parse is iterative in V8, but
    // JSON.stringify recurses, so a body nested a few thousand levels deep
    // parses fine and then overflows the stack during `serialise` -- even
    // when the rule's selector matches nothing at all, since the untouched
    // document still has to be serialised back out. Before the fix this
    // escaped as a bare, unhandled "Maximum call stack size exceeded" with
    // no toast at all.
    it("toasts instead of crashing when serialising an extremely deep structure overflows the stack", async () => {
        const body = "[".repeat(3000) + '"0x1"' + "]".repeat(3000);
        const h = harness({body, values: {mode: "advanced", rules: "$.nope | hex>dec"}});
        await expect(convertResponse(h.ctx, REQUEST, h.deps)).resolves.toBeUndefined();
        expect(h.calls.toasts.some((t) => t.color === "danger")).toBe(true);
        expect(h.calls.shownResult).toBeNull();
    });
});
