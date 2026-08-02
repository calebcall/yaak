/**
 * Test-only support shared between action.test.ts and fixtures.test.ts.
 *
 * Both suites fake the "rules" prompt.form dialog. Before this module
 * existed they each maintained their own independent fake of that shape,
 * and the two disagreed about what an unedited confirm resolves to -- one
 * modelled Yaak's real behaviour (an unedited field is simply absent from
 * `values`, not the `defaultValue` it was rendered with) and the other
 * didn't model that case at all. That divergence is exactly the structural
 * condition that let the confirm-without-editing bug ship in the first
 * place: a fake that always returns `{rules}` can't fail a test for a case
 * it never represents. Having exactly one implementation of "what does the
 * rules dialog resolve to" removes that risk going forward.
 */
export type RulesFormValues = {rules?: string};

export type RulesFormOptions = {
    /**
     * `string` simulates the user editing the rules field to this text
     * (Yaak's `DynamicForm` fires `onChange`, so `values.rules` is this
     * string, even `""`). `null` simulates a genuine cancel (backdrop
     * click, escape, explicit Cancel). `undefined` simulates confirming the
     * dialog WITHOUT touching the field -- Yaak's real prompt value state
     * starts as `{}` and is only ever populated by `onChange`, so an
     * unedited field is simply absent from `values`, not the
     * `defaultValue` it was rendered with.
     */
    rules: string | null | undefined;
};

/** Mirrors exactly what Yaak's real prompt.form resolves to for the rules dialog. */
export function resolveRulesFormValues(options: RulesFormOptions): RulesFormValues | null {
    if (options.rules === null) return null;
    if (options.rules === undefined) return {};
    return {rules: options.rules};
}
