# Convert

A request action plugin for Yaak that converts fields in an HTTP response between
representations — hex to decimal, epoch timestamps to ISO dates, base64/hex/JWT decoding,
fixed-point scaling for wei-sized integers, and more.

## Overview

This plugin adds a **Convert response** action to HTTP requests. It reads a small rules DSL
(one JSONPath selector per line, piped through a chain of steps), applies it to the request's
most recent response body, and shows the converted JSON in a read-only result dialog.

## Usage

1. Send a request as usual.
2. Right-click the request and choose **Convert response**.
3. Pick a **Mode**:
   - **Simple** (default) — fill in **Field** (a JSONPath, defaulting to `$.result`), then pick
     **From** and **To** representations. **To** is filtered to whatever the registry actually
     supports converting the chosen **From** into. Optionally set **Then** to `divide by`,
     `multiply by`, or `round to N places` and fill in **Amount** — this covers everything a
     single from→to conversion (plus one scaling step) can express, with no syntax to type.
   - **Advanced** — the rules DSL described below, for chaining multiple steps or applying
     several rules at once.
4. Click **Convert**. A second dialog opens with the converted response as read-only JSON.

### The Advanced rules DSL

Enter rules, one per line:

```
$.result                 | hex>dec
$..transactions[*].value | hex>dec | div 1e18 | fixed 4
$.data.payload           | base64 | json
$.auth.token             | jwt
$.createdAt              | epoch_ms>date
```

Each rule is a JSONPath selector, then a pipeline of steps applied left to right. Lines starting
with `#` are ignored, as are blank lines. A selector that matches nothing is not an error — the
rest of the rules still run, and a toast notes that nothing matched.

### Selections are remembered per request

The mode and fields (Simple) or rules text (Advanced) you last used for a request are saved and
prefill the dialog next time you open **Convert response** on that same request, so you set it up
once and re-run the conversion as the response changes. A conversion saved before this dialog
gained Simple mode is loaded straight into Advanced mode with its original rules text intact —
nothing is discarded.

To clear the saved conversion for a request, open the dialog, clear **Field** (Simple) or **Rules**
(Advanced), and click **Convert** with it blank. This is a deliberate clear, not a no-op: a
confirmation toast ("Cleared the saved conversion for this request") appears, and the dialog
reopens with the plugin's hardcoded defaults next time. Cancelling the dialog (rather than
submitting a blank field) leaves the saved conversion untouched.

## Steps

### Numeric base

| Step | Example | Result |
|---|---|---|
| `hex>dec` | `"0x1879687"` | `25663111` |
| `bin>dec` | `"0b1010"` | `10` |
| `oct>dec` | `"0o17"` | `15` |
| `dec>hex` | `255` | `"0xff"` |
| `dec>bin` | `10` | `"0b1010"` |
| `dec>oct` | `15` | `"0o17"` |

### Scaling (require an argument; results are always strings)

| Step | Example | Result |
|---|---|---|
| `div <n>` | `"1000000000000000000" \| div 1e18` | `"1"` |
| `mul <n>` | `"1.5" \| mul 100` | `"150"` |
| `fixed <places>` | `"1.23456789" \| fixed 4` | `"1.2346"` |

### Time

| Step | Example | Result |
|---|---|---|
| `epoch_s>date` | `1700000000` | `"2023-11-14T22:13:20Z"` |
| `epoch_ms>date` | `1700000000000` | `"2023-11-14T22:13:20Z"` |
| `date>epoch_s` | `"2023-11-14T22:13:20Z"` | `1700000000` |
| `date>epoch_ms` | `"2023-11-14T22:13:20Z"` | `1700000000000` |
| `ms>duration` | `90061000` | `"1d 1h 1m 1s"` |

### Encoding (bare name decodes, `text>x` encodes)

| Step | Example | Result |
|---|---|---|
| `base64` | `"aGVsbG8="` | `"hello"` |
| `base64url` | `"aGVsbG8"` | `"hello"` |
| `hexbytes` | `"0x68656c6c6f"` | `"hello"` |
| `urlenc` | `"a%20b"` | `"a b"` |
| `text>base64` | `"hello"` | `"aGVsbG8="` |
| `text>base64url` | `"hello"` | `"aGVsbG8"` |
| `text>hexbytes` | `"hello"` | `"0x68656c6c6f"` |
| `text>urlenc` | `"a b"` | `"a%20b"` |

### Structured

| Step | Example | Result |
|---|---|---|
| `json` | `"{\"a\":1}"` | `{"a": 1}` |
| `jwt` | `"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSJ9.sig"` | `{"header": {"alg": "HS256", "typ": "JWT"}, "payload": {"sub": "1234567890", "name": "Ada"}}` |

That's 24 steps in total. `hex>dec` and `hexbytes` are **not** the same operation, despite the
similar names: `hex>dec` reads a base-16 *number* (e.g. `"0x1879687"` → `25663111`), while
`hexbytes` decodes a hex-encoded *byte string* back to text (e.g. `"0x68656c6c6f"` → `"hello"`).
Feeding one step's input to the other will fail to convert (see "Errors" below), not silently
produce a wrong-but-plausible answer.

## Output types

Integers that fit in `Number.MAX_SAFE_INTEGER` are emitted as JSON numbers. Anything larger —
and every `div`, `mul`, or `fixed` result, regardless of magnitude — is emitted as a **string**,
so a 256-bit token balance or wei amount is never silently rounded to a `double`.

## Accepted date formats

`date>epoch_s` and `date>epoch_ms` accept only unambiguous ISO 8601 shapes:

| Input shape | Example | Accepted? |
|---|---|---|
| Full instant, literal `Z` | `2025-02-04T21:48:48Z` (`.123Z` too) | Yes |
| Full instant, numeric offset | `2025-02-04T21:48:48+05:30`, `...-08:00` | Yes |
| Date-only | `2025-02-04` | Yes (treated as UTC midnight) |
| Bare year | `2025` | No — too coarse |
| Datetime with no offset | `2025-02-04T00:00`, `2025-02-04T00:00:00` | No — would resolve to host-local time |
| Invalid calendar date | `2025-02-30`, `2025-13-01` | No |
| Out-of-range time-of-day | `2025-01-01T24:00:00Z`, a leap second (`:60`) | No |
| Malformed offset | `2025-02-04T21:48:48+25:00` | No |

`epoch_s>date` and `epoch_ms>date` always produce the "full instant, literal `Z`" shape, so
round-tripping a converted date back through `date>epoch_s`/`date>epoch_ms` always works.

## Input bounds

A few inputs are capped to keep a single hostile or oversized value from hanging the
conversion. When a value exceeds a bound, that step fails for that value only (see "Errors"
below) — it does not abort the whole response:

- `fixed <places>` and `div`/`mul`'s numeric argument: the exponent/places is capped at 10,000.
- `base64`, `base64url`, `hexbytes`, and `jwt` (which decodes its segments the same way): input
  is capped at 2,000,000 characters.
- `div`'s result is capped at 30 decimal places of precision for a non-terminating quotient
  (e.g. `1 | div 3`), so it always terminates rather than growing without bound.

## Errors

There are two different failure modes, and they behave very differently:

- **A step that cannot handle a value** (wrong type, malformed encoding, out-of-range input,
  etc.) leaves that value **untouched** in the output and moves on. The rest of the rules still
  run. If nothing in the whole response could be converted, a warning toast says so.
- **A malformed rule** (bad JSONPath syntax, unknown step name, wrong number of arguments,
  unbalanced brackets/quotes) aborts the entire conversion with a danger toast naming the
  problem. No partial output is shown.

`jwt` decodes the header and payload only. **It does not verify the signature** — there is no
key material available to the plugin, and no way to know which algorithm a caller trusts, so a
"decoded" JWT should never be treated as "verified."

## Installation

Install with the Yaak CLI — do not copy the plugin directory into Yaak's `installed-plugins`
folder by hand, that does **not** register it:

```bash
npx yaakcli plugin install .    # registers the plugin, once
npx yaakcli plugin dev .        # optional: rebuild automatically while iterating
```

Yaak enumerates plugins at startup, so after installing you must **fully quit Yaak (Cmd-Q) and
reopen it** before the action appears.

## Development

```bash
npm install
npm run typecheck   # type-check src/
npm test            # run the vitest suite
npm run build       # bundle to build/index.js
```
