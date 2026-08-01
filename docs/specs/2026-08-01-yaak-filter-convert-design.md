# Design: `filter-convert` — a field-targeted type conversion filter for Yaak

Date: 2026-08-01
Status: Approved, pending implementation plan

## Problem

API responses routinely carry values in machine-friendly encodings that are
unreadable at a glance: hex integers, epoch timestamps, base64 blobs, JWTs, and
JSON embedded inside JSON strings. Reading them today means copying values out
of Yaak into a separate tool.

The motivating case is blockchain JSON-RPC, which returns hex quantities:

```json
{ "jsonrpc": "2.0", "id": 83, "result": "0x1879687" }
```

But the requirement is explicitly **not** blockchain-specific. Hex is one
encoding among several; the plugin is a general "convert this field from one
representation to another" tool.

## Goal

A Yaak filter plugin that takes conversion rules typed into the response filter
box and returns the response with the targeted fields converted in place.

## Non-goals

- Signature verification of JWTs. Decoding only.
- Modifying requests, or persisting rules per request. The filter hook receives
  no request context (see Constraints), so persistence is out of scope.
- Converting non-JSON payloads. XML and plain text are out of scope for v1.
- `bytes>human` size formatting. Considered and cut.

## Constraints discovered in Yaak 2026.5.0

These were established by inspecting the installed application, not from docs.

1. **The filter hook is the only surface that rewrites the response pane.**

   ```ts
   filter: {
     name: string;
     onFilter(ctx, args: { payload: string; filter: string; mimeType: string })
       => { content: string; error?: string }
   }
   ```

2. **`args.mimeType` is unusable.** The plugin runtime passes
   `mimeType: payload.type`, so the value is always the literal string
   `"filter_request"`, never a real content type
   (`Yaak.app/Contents/Resources/vendored/plugin-runtime/index.cjs:3907`).
   A plugin must sniff the payload itself. This is an upstream bug.

3. **`onFilter` receives no request or response context.** No request id, no
   headers, no status. The filter string is the only per-invocation input.

4. **A plugin definition supports exactly one `filter`**, not an array.

5. **Multiple filter plugins can be registered simultaneously.** `filter-jsonpath`
   and `filter-xpath` are both installed and enabled, so dispatch across several
   filters exists. *How* Yaak selects among them is decided in the Rust core and
   could not be determined by static inspection. See Risks.

## Surface

A filter plugin named `Convert`, living at `plugins/filter-convert/` alongside
the existing `action-python-requests` plugin and following its structure
(TypeScript, vitest, `yaakcli build`).

## The DSL

One rule per line. Blank lines and `#` comments are ignored.

```
<jsonpath> | <step> [args] | <step> [args] ...
```

Examples:

```
$.result                     | hex>dec
$..transactions[*].value     | hex>dec | div 1e18 | fixed 4
$.data.payload               | base64 | json
$.auth.token                 | jwt
$.createdAt                  | epoch_ms>date
```

The selector is everything before the first *top-level* `|`. Steps are applied
left to right; each receives the previous step's output.

### Parsing the selector boundary

JSONPath filter expressions may contain `|`, as in `$[?(@.a || @.b)]`. The
splitter must scan for a `|` that is not inside `[]`, `()`, `'`, or `"`, rather
than splitting on the first occurrence. This is the one non-trivial piece of
parsing in the plugin and needs its own tests.

## Step registry

Every step is a pure function with declared arity, registered in one table.
Steps operate on the value union
`bigint | number | string | boolean | null | object | array`.

### Numeric base

| Step | Accepts | Produces |
|---|---|---|
| `hex>dec` | string matching `^(0x)?[0-9a-f]+$` (case-insensitive) | integer |
| `dec>hex` | integer or integral numeric string | `0x`-prefixed lowercase string |
| `bin>dec` | string matching `^(0b)?[01]+$` | integer |
| `dec>bin` | integer | `0b`-prefixed string |
| `oct>dec` | string matching `^(0o)?[0-7]+$` | integer |
| `dec>oct` | integer | `0o`-prefixed string |

All base conversions use `BigInt`. No precision loss at 256 bits.

### Scaling

| Step | Arity | Behaviour |
|---|---|---|
| `div n` | 1 | Exact decimal division. `n` accepts `1000` or `1e18`. |
| `mul n` | 1 | Exact decimal multiplication. |
| `fixed n` | 1 | Round half-up to exactly `n` decimal places. |

Implemented with scaled integer arithmetic, never floating point. `div` output
has trailing zeros trimmed and renders without a decimal point when integral:
one ether in wei through `div 1e18` yields the string `"1"`, not `"1.0"`.
Scaling results are always strings — see Value and precision model.

`wei>ether` is deliberately absent — it is `div 1e18`, the same operation as
cents-to-dollars (`div 100`).

### Time

| Step | Accepts | Produces |
|---|---|---|
| `epoch_s>date` | integer seconds | ISO 8601 UTC, `2025-02-04T21:48:48Z` |
| `epoch_ms>date` | integer milliseconds | ISO 8601 UTC, milliseconds included when non-zero |
| `date>epoch_s` | ISO 8601 string | integer |
| `date>epoch_ms` | ISO 8601 string | integer |
| `ms>duration` | integer milliseconds | `1h 1m 1s`, `500ms`; largest unit first, zero units skipped, capped at days |

Time steps take integers, not hex. A hex timestamp composes:
`$.result.timestamp | hex>dec | epoch_s>date`. This is the payoff of pipelines
over `from>to` pairs — no `hex_epoch_s>date` entry is needed.

### Encoding

Bare names decode, because that is the overwhelmingly common read direction.
The explicit `text>x` forms encode.

| Step | Alias for | Behaviour |
|---|---|---|
| `base64` | `base64>text` | decode standard base64 to UTF-8 |
| `base64url` | `base64url>text` | decode URL-safe base64 |
| `urlenc` | `urlenc>text` | `decodeURIComponent` |
| `hexbytes` | `hexbytes>text` | hex byte string to UTF-8 text |
| `text>base64` | — | encode |
| `text>base64url` | — | encode |
| `text>urlenc` | — | encode |
| `text>hexbytes` | — | encode |

Note the distinction between `hex>dec` (a *number* in base 16) and `hexbytes`
(a *byte string* in hex). Different operations, deliberately different names.

### Structured

| Step | Accepts | Produces |
|---|---|---|
| `json` | JSON-encoded string | the parsed value, spliced into the tree |
| `jwt` | three dot-separated base64url segments | `{ "header": {...}, "payload": {...} }` |

`jwt` does not verify signatures and must say so in the README.

## Value and precision model

Conversions carry `BigInt` internally. At serialisation:

- An integer within `Number.MAX_SAFE_INTEGER` emits as a **JSON number**.
- An integer beyond it emits as a **JSON string**.
- Any `div` / `mul` / `fixed` result emits as a **JSON string**.

So `$.result | hex>dec` on a block number yields `25630343`, while a wei balance
yields `"1234567890123456789012"`. Exactness is preferred over uniform typing;
silently rounding a balance is worse than a quoted number.

## Error semantics

**Fatal** — sets `error`, returns the original payload as `content`:

- The payload is not valid JSON.
- Any rule fails to parse: unknown step, wrong arity, malformed selector.

**Soft** — no `error`, conversion skipped, value left untouched:

- A selector matches nothing.
- A step rejects the value it receives, e.g. `hex>dec` applied to `"hello"`.

**Reported** — if the whole program modifies zero nodes, set `error` saying so.
That is nearly always a mistyped selector, and silence would be baffling.

Rationale: one bad rule must not blank out the response being debugged.

## Architecture

Five focused modules. The split exists so that the conversion core is
independent of the filter surface — if the dispatch risk below forces a move to
a request action, only `index.ts` changes.

| Module | Responsibility |
|---|---|
| `steps.ts` | the step registry; pure functions with declared arity |
| `decimal.ts` | exact BigInt decimal arithmetic for `div` / `mul` / `fixed` |
| `dsl.ts` | rule text to `{ selector, steps[] }`, including the `\|` scanner |
| `apply.ts` | jsonpath-plus traversal and in-place replacement |
| `index.ts` | thin `onFilter`: parse, apply, stringify |

### Data flow

1. `onFilter` receives `{ payload, filter }`.
2. `JSON.parse(payload)` — fatal on failure.
3. `dsl.parse(filter)` — fatal on failure.
4. For each rule, jsonpath-plus selects nodes with `resultType: 'all'`, giving
   `{ value, parent, parentProperty }` so matched nodes can be reassigned.
5. Each matched value runs through its step chain; failures leave it untouched.
6. `JSON.stringify(result, null, 2)` with the BigInt rules above.

### Dependency

`jsonpath-plus`, the same engine the built-in JSONPath filter uses (~200KB
bundled). Chosen over a hand-rolled matcher so selector syntax matches what
Yaak users already know.

## Testing

vitest, matching the setup in `action-python-requests`.

- Unit tests per step, including rejection cases that must soft-fail.
- Round-trip tests for every base and encoding pair.
- DSL tests, explicitly covering `$[?(@.a || @.b)] | hex>dec`.
- `apply` tests over nested arrays and `..` recursive descent.
- Precision tests: 256-bit values, `div 1e18`, `fixed` rounding at the half.
- Golden fixtures from real payloads: `eth_blockNumber`,
  `eth_getBlockByNumber` with nested transactions, `eth_getBalance`,
  plus a non-blockchain fixture with an epoch timestamp, a JWT, and an
  embedded JSON string.

## Risks

**Dispatch is unproven, and it gates everything.** It is not established that
Yaak routes a JSON response to a third-party filter plugin. Selection may key
off a hardcoded name or content-type map that a third plugin never enters.

Mitigation: the first implementation task is a throwaway probe plugin — roughly
20 lines returning a fixed marker — loaded into Yaak to answer:

1. Does a third-party filter get invoked for `application/json` at all?
2. With several filters registered, how does Yaak choose? Is there a UI picker?
3. Does Yaak still render `content` when `error` is set?

Question 3 decides whether the error semantics above survive. If Yaak discards
content whenever `error` is present, the "reported" case must instead be folded
into the returned JSON or dropped.

**Fallback.** If dispatch makes the filter surface unreachable, the same
registry, DSL, and apply logic move to an HTTP request action that reads the
latest response via `ctx.httpResponse.find({ requestId })` and shows the result
in a window. Only `index.ts` is discarded.

## Acceptance criteria

- [ ] The probe has answered all three dispatch questions, recorded in the issue.
- [ ] Every step in the registry has unit tests, including its rejection case.
- [ ] `$[?(@.a || @.b)] | hex>dec` parses correctly.
- [ ] A 256-bit `eth_getBalance` value converts without precision loss.
- [ ] A malformed rule leaves the response readable rather than blank.
- [ ] `npm run typecheck` and `npm test` pass; `npm run build` produces a bundle.
- [ ] The plugin loads in Yaak and converts the motivating payload end to end.
- [ ] README documents every step, the JWT no-verification caveat, and the
      string-versus-number output rule.
