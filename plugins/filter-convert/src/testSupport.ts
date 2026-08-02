/**
 * Test-only support shared between action.test.ts and fixtures.test.ts.
 *
 * Both suites fake the convert prompt.form dialog. Before this module
 * existed they each maintained their own independent fake of that shape,
 * and the two disagreed about what an unedited confirm resolves to -- one
 * modelled Yaak's real behaviour (an unedited field is simply absent from
 * `values`, not the `defaultValue` it was rendered with) and the other
 * didn't model that case at all. That divergence is exactly the structural
 * condition that let the confirm-without-editing bug ship once already.
 * Having exactly one implementation of "what does the convert dialog
 * resolve to" removes that risk going forward, now across six fields
 * instead of one.
 */

/**
 * Every field the convert form can report. Each is `string | undefined`:
 * absent (undefined) means the user never touched that field in this dialog
 * session (Yaak's real prompt value state starts at `{}` and is populated
 * solely by each input's own `onChange`); present -- including `""` --
 * means an edit actually fired.
 */
export type ConvertFormValues = {
    mode?: string;
    field?: string;
    from?: string;
    to?: string;
    then?: string;
    amount?: string;
    rules?: string;
};

export type ConvertFormOptions =
    | {cancelled: true}
    | ({cancelled?: false} & ConvertFormValues);

/**
 * Mirrors exactly what Yaak's real prompt.form resolves to for the convert
 * dialog: `null` for a genuine cancel (backdrop click, escape, explicit
 * Cancel), or an object containing only the fields the user actually
 * edited -- any field simply omitted from `options` is modelled as
 * untouched, not as blank.
 */
export function resolveConvertFormValues(options: ConvertFormOptions): ConvertFormValues | null {
    if (options.cancelled) return null;
    const fields: ConvertFormValues = {};
    if (options.mode !== undefined) fields.mode = options.mode;
    if (options.field !== undefined) fields.field = options.field;
    if (options.from !== undefined) fields.from = options.from;
    if (options.to !== undefined) fields.to = options.to;
    if (options.then !== undefined) fields.then = options.then;
    if (options.amount !== undefined) fields.amount = options.amount;
    if (options.rules !== undefined) fields.rules = options.rules;
    return fields;
}
