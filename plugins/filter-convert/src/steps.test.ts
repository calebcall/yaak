import {describe, expect, it} from "vitest";
import {StepError} from "./errors";
import {STEPS, runStep} from "./steps";

describe("hex>dec", () => {
    it("converts a prefixed hex quantity", () => {
        expect(runStep("hex>dec", "0x1879687", [])).toBe(25663111n);
    });

    it("accepts bare hex", () => {
        expect(runStep("hex>dec", "ff", [])).toBe(255n);
    });

    it("keeps 256-bit values exact", () => {
        expect(runStep("hex>dec", `0x${"f".repeat(64)}`, [])).toBe(2n ** 256n - 1n);
    });

    it("rejects a non-hex string", () => {
        expect(() => runStep("hex>dec", "hello", [])).toThrow();
    });

    it("keeps a value with leading zeros exact", () => {
        expect(runStep("hex>dec", "0x00ff", [])).toBe(255n);
    });

    it("is case-insensitive", () => {
        expect(runStep("hex>dec", "0xFF", [])).toBe(255n);
        expect(runStep("hex>dec", "0xAbCd", [])).toBe(runStep("hex>dec", "0xabcd", []));
    });

    // Regression: parseRadix used to accumulate the result one character at
    // a time (result = result * base + digit), which is quadratic in the
    // input length -- 400k characters took ~11s. Replacing it with
    // BigInt("0x" + body) must not change any answer, only how fast it's
    // computed; this pins the large-input case at a size that would have
    // been clearly, visibly slow under the old loop.
    it("handles a very large input the same as a small one, just faster", () => {
        const digits = "1".repeat(100_000);
        expect(runStep("hex>dec", `0x${digits}`, [])).toBe(BigInt(`0x${digits}`));
    });
});

describe("dec>hex", () => {
    it("converts and lowercases", () => {
        expect(runStep("dec>hex", 25663111n, [])).toBe("0x1879687");
    });

    it("rejects a non-integer", () => {
        expect(() => runStep("dec>hex", "1.5", [])).toThrow();
    });
});

describe("bin and oct", () => {
    it("round-trips binary", () => {
        expect(runStep("bin>dec", "0b1010", [])).toBe(10n);
        expect(runStep("dec>bin", 10n, [])).toBe("0b1010");
    });

    it("round-trips octal", () => {
        expect(runStep("oct>dec", "0o755", [])).toBe(493n);
        expect(runStep("dec>oct", 493n, [])).toBe("0o755");
    });

    it("rejects digits outside the base", () => {
        expect(() => runStep("bin>dec", "0b12", [])).toThrow();
        expect(() => runStep("oct>dec", "0o89", [])).toThrow();
    });
});

describe("cross-prefix rejection", () => {
    it("rejects a binary literal fed to hex>dec", () => {
        expect(() => runStep("hex>dec", "0b1010", [])).toThrow();
    });

    it("rejects an octal literal fed to hex>dec", () => {
        expect(() => runStep("hex>dec", "0o17", [])).toThrow();
    });

    it("rejects a hex literal fed to bin>dec", () => {
        expect(() => runStep("bin>dec", "0x10", [])).toThrow();
    });

    it("rejects an octal literal fed to bin>dec", () => {
        expect(() => runStep("bin>dec", "0o17", [])).toThrow();
    });

    it("rejects a hex literal fed to oct>dec", () => {
        expect(() => runStep("oct>dec", "0x17", [])).toThrow();
    });

    it("rejects a binary literal fed to oct>dec", () => {
        expect(() => runStep("oct>dec", "0b11", [])).toThrow();
    });
});

describe("negative round-trips", () => {
    it("round-trips a negative value through dec>hex and hex>dec", () => {
        const rendered = runStep("dec>hex", -255n, []);
        expect(rendered).toBe("-0xff");
        expect(runStep("hex>dec", rendered, [])).toBe(-255n);
    });

    it("round-trips a negative value through dec>bin and bin>dec", () => {
        const rendered = runStep("dec>bin", -10n, []);
        expect(rendered).toBe("-0b1010");
        expect(runStep("bin>dec", rendered, [])).toBe(-10n);
    });

    it("round-trips a negative value through dec>oct and oct>dec", () => {
        const rendered = runStep("dec>oct", -493n, []);
        expect(rendered).toBe("-0o755");
        expect(runStep("oct>dec", rendered, [])).toBe(-493n);
    });
});

describe("dec>bin and dec>oct rejection", () => {
    it("rejects a non-integer for dec>bin", () => {
        expect(() => runStep("dec>bin", "1.5", [])).toThrow();
    });

    it("rejects a non-integer for dec>oct", () => {
        expect(() => runStep("dec>oct", "1.5", [])).toThrow();
    });
});

describe("toInteger safety", () => {
    it("rejects an unsafe JS number", () => {
        expect(() => runStep("dec>hex", 9007199254740993, [])).toThrow();
    });

    it("accepts the same magnitude as an integral string", () => {
        expect(runStep("dec>hex", "9007199254740993", [])).toBe("0x20000000000001");
    });

    it("accepts the same magnitude as a bigint", () => {
        expect(runStep("dec>hex", 9007199254740993n, [])).toBe("0x20000000000001");
    });
});

describe("scaling", () => {
    it("divides wei to ether", () => {
        expect(runStep("div", 10n ** 18n, ["1e18"])).toBe("1");
    });

    it("divides a 256-bit balance without precision loss", () => {
        expect(runStep("div", 1234567890123456789012n, ["1e18"]))
            .toBe("1234.567890123456789012");
    });

    it("divides cents to dollars", () => {
        expect(runStep("div", 1999n, ["100"])).toBe("19.99");
    });

    it("multiplies", () => {
        expect(runStep("mul", "1.5", ["100"])).toBe("150");
    });

    it("fixes decimal places, padding as needed", () => {
        expect(runStep("fixed", "1.5", ["4"])).toBe("1.5000");
    });

    it("rejects a non-numeric argument", () => {
        expect(() => runStep("div", 10n, ["abc"])).toThrow();
    });

    it("rejects division by zero", () => {
        expect(() => runStep("div", 10n, ["0"])).toThrow();
    });

    it("divides a negative dividend, placing the sign correctly", () => {
        expect(runStep("div", -100n, ["4"])).toBe("-25");
    });

    it("multiplies a negative value, placing the sign correctly", () => {
        expect(runStep("mul", "-1.5", ["100"])).toBe("-150");
    });

    it("fixes a negative value, placing the sign correctly", () => {
        expect(runStep("fixed", "-1.5", ["4"])).toBe("-1.5000");
    });

    it("rejects a non-numeric multiplier argument", () => {
        expect(() => runStep("mul", "10", ["abc"])).toThrow();
    });

    it("rejects a non-numeric value for mul", () => {
        expect(() => runStep("mul", "abc", ["10"])).toThrow();
    });

    it("rejects a negative places argument for fixed", () => {
        expect(() => runStep("fixed", "1.5", ["-1"])).toThrow();
    });

    it("rejects a non-integer places argument for fixed", () => {
        expect(() => runStep("fixed", "1.5", ["2.5"])).toThrow();
    });

    it("rejects a missing places argument for fixed", () => {
        expect(() => runStep("fixed", "1.5", [])).toThrow();
    });

    it("fixes an ordinary places value", () => {
        expect(runStep("fixed", "1.5", ["4"])).toBe("1.5000");
    });

    it("fixes at the maximum allowed places boundary", () => {
        expect(runStep("fixed", "1.5", ["10000"])).toBe(`1.5${"0".repeat(9999)}`);
    });

    it("rejects a places argument just beyond the maximum", () => {
        expect(() => runStep("fixed", "1.5", ["10001"])).toThrow(StepError);
    });

    it("rejects an absurdly large places argument without crashing", () => {
        expect(() => runStep("fixed", "1.5", ["999999999999999999999999999999"]))
            .toThrow(StepError);
    });

    // Regression: a JSON number beyond MAX_SAFE_INTEGER is already
    // float-corrupted by the time it reaches here (JSON.parse turns
    // 12345678901234567890 into 12345678901234567000). `div`/`mul`/`fixed`
    // used to pass it straight through parseDec and re-emit the corrupted
    // value as a string -- the one output shape meant to guarantee
    // exactness. It must now fail closed like `dec>hex` already does.
    it("rejects a float-corrupted JSON integer rather than laundering it", () => {
        expect(() => runStep("div", 12345678901234567890, ["1"])).toThrow(StepError);
    });
});

describe("time", () => {
    it("converts epoch seconds to ISO without a milliseconds part", () => {
        expect(runStep("epoch_s>date", 1738705728n, [])).toBe("2025-02-04T21:48:48Z");
    });

    it("includes milliseconds only when non-zero", () => {
        expect(runStep("epoch_ms>date", 1738705728000n, [])).toBe("2025-02-04T21:48:48Z");
        expect(runStep("epoch_ms>date", 1738705728123n, [])).toBe("2025-02-04T21:48:48.123Z");
    });

    it("converts ISO back to epoch", () => {
        expect(runStep("date>epoch_s", "2025-02-04T21:48:48Z", [])).toBe(1738705728n);
        expect(runStep("date>epoch_ms", "2025-02-04T21:48:48.123Z", [])).toBe(1738705728123n);
    });

    it("rejects an unparseable date for date>epoch_ms", () => {
        // The rejection constraint is per-step, not per-underlying-function:
        // every other rejection test in this block calls date>epoch_s, so
        // date>epoch_ms's own validation path needs direct coverage too.
        expect(() => runStep("date>epoch_ms", "not a date", [])).toThrow();
    });

    it("formats durations largest unit first, skipping zeroes", () => {
        expect(runStep("ms>duration", 3661000n, [])).toBe("1h 1m 1s");
        expect(runStep("ms>duration", 500n, [])).toBe("500ms");
        expect(runStep("ms>duration", 90061000n, [])).toBe("1d 1h 1m 1s");
        expect(runStep("ms>duration", 0n, [])).toBe("0ms");
    });

    it("rejects an unparseable date", () => {
        expect(() => runStep("date>epoch_s", "not a date", [])).toThrow();
    });

    it("rejects an out-of-range epoch", () => {
        expect(() => runStep("epoch_s>date", 10n ** 18n, [])).toThrow();
    });

    it("rejects a safe-integer epoch_ms that still exceeds Date's own range", () => {
        // Date only accepts values within +-8.64e15ms; 9e15 is a safe JS
        // number but falls outside that window, so this exercises the
        // getTime()-is-NaN guard rather than the Number.isSafeInteger guard.
        expect(() => runStep("epoch_ms>date", 9_000_000_000_000_000n, [])).toThrow();
    });

    it("floors, rather than truncates, a sub-second pre-1970 instant to epoch seconds", () => {
        // -500ms is the 1969-12-31T23:59:59 second (which spans -1000..-1ms).
        // Truncating division toward zero would give 0 (1970-01-01T00:00:00),
        // which is the wrong second entirely; flooring gives -1, the correct one.
        expect(runStep("date>epoch_s", "1969-12-31T23:59:59.500Z", [])).toBe(-1n);
    });

    it("round-trips a whole-second pre-1970 instant", () => {
        expect(runStep("date>epoch_s", "1969-12-31T23:59:59Z", [])).toBe(-1n);
    });

    it("rejects a calendar date that Date.parse would silently roll over", () => {
        // Date.parse("2025-02-30") normalizes to 2025-03-02 instead of
        // rejecting the invalid day; that would silently produce a wrong
        // epoch, so date>epoch_s must reject it outright.
        expect(() => runStep("date>epoch_s", "2025-02-30T00:00:00Z", [])).toThrow();
    });

    it("rejects an out-of-range month or day", () => {
        expect(() => runStep("date>epoch_s", "2025-13-01T00:00:00Z", [])).toThrow();
        expect(() => runStep("date>epoch_s", "2025-01-45T00:00:00Z", [])).toThrow();
    });

    it("rejects an out-of-range hour, minute or second", () => {
        expect(() => runStep("date>epoch_s", "2025-01-01T24:00:00Z", [])).toThrow(StepError);
        // A leap second: valid in real UTC, but this converter's calendar
        // math doesn't model them, so it is rejected rather than silently
        // treated as :59 or rolled into the next minute.
        expect(() => runStep("date>epoch_s", "2025-06-30T23:59:60Z", [])).toThrow(StepError);
    });

    it("rejects a bare year and a datetime with no UTC offset", () => {
        // A bare "YYYY" is too coarse to be a useful instant. A datetime with
        // no offset, e.g. "2025-02-04T00:00", resolves to host-local time per
        // spec and so is host-dependent — both are rejected. A bare
        // "YYYY-MM-DD" date, by contrast, is defined as UTC by ECMA-262 and
        // is accepted (see the "date-only ISO form" tests below).
        expect(() => runStep("date>epoch_s", "2025", [])).toThrow();
        expect(() => runStep("date>epoch_s", "2025-02-04T00:00", [])).toThrow();
    });

    describe("date-only ISO form", () => {
        it("accepts a bare calendar date as UTC midnight", () => {
            expect(runStep("date>epoch_s", "2025-02-04", [])).toBe(1738627200n);
        });

        it("still rejects an invalid calendar date in date-only form", () => {
            expect(() => runStep("date>epoch_s", "2025-02-30", [])).toThrow(StepError);
        });
    });

    describe("numeric UTC offsets", () => {
        it("treats +00:00 the same as a literal Z", () => {
            expect(runStep("date>epoch_s", "2025-02-04T21:48:48+00:00", []))
                .toBe(runStep("date>epoch_s", "2025-02-04T21:48:48Z", []));
        });

        it("applies a non-zero offset to produce the correct UTC epoch", () => {
            expect(runStep("date>epoch_s", "2025-02-04T21:48:48+05:30", [])).toBe(1738685928n);
        });

        it("rejects a malformed offset instead of silently ignoring it", () => {
            expect(() => runStep("date>epoch_s", "2025-02-04T21:48:48+25:00", [])).toThrow(StepError);
            expect(() => runStep("date>epoch_s", "2025-02-04T21:48:48+05:99", [])).toThrow(StepError);
        });
    });

    it("rejects a negative duration", () => {
        expect(() => runStep("ms>duration", -1n, [])).toThrow();
    });

    it("formats a duration spanning many days", () => {
        expect(runStep("ms>duration", 8_640_003_661_000n, [])).toBe("100000d 1h 1m 1s");
    });
});

describe("encoding", () => {
    it("round-trips base64", () => {
        expect(runStep("base64", "SGVsbG8sIHdvcmxk", [])).toBe("Hello, world");
        expect(runStep("text>base64", "Hello, world", [])).toBe("SGVsbG8sIHdvcmxk");
    });

    it("round-trips base64url without padding", () => {
        const encoded = runStep("text>base64url", "a+b/c?", []);
        expect(encoded).not.toContain("+");
        expect(encoded).not.toContain("/");
        expect(encoded).not.toContain("=");
        expect(runStep("base64url", encoded, [])).toBe("a+b/c?");
    });

    it("round-trips url encoding", () => {
        expect(runStep("urlenc", "a%20b%26c", [])).toBe("a b&c");
        expect(runStep("text>urlenc", "a b&c", [])).toBe("a%20b%26c");
    });

    it("round-trips hex bytes, which is not hex>dec", () => {
        expect(runStep("hexbytes", "0x48656c6c6f", [])).toBe("Hello");
        expect(runStep("text>hexbytes", "Hello", [])).toBe("0x48656c6c6f");
    });

    it("rejects invalid input", () => {
        expect(() => runStep("hexbytes", "zz", [])).toThrow();
        expect(() => runStep("urlenc", "%zz", [])).toThrow();
        expect(() => runStep("base64", 42, [])).toThrow();
    });

    it("rejects a base64url string outside the alphabet", () => {
        expect(() => runStep("base64url", "not valid!", [])).toThrow(StepError);
    });

    it("rejects a non-string for every text>x encode step", () => {
        expect(() => runStep("text>base64", 42, [])).toThrow(StepError);
        expect(() => runStep("text>base64url", 42, [])).toThrow(StepError);
        expect(() => runStep("text>hexbytes", 42, [])).toThrow(StepError);
        expect(() => runStep("text>urlenc", 42, [])).toThrow(StepError);
    });

    describe("text>urlenc surrogate handling", () => {
        // encodeURIComponent throws a native URIError on a lone surrogate
        // (half of a would-be surrogate pair, with no partner). That's
        // realistic input -- JSON.parse('"\\ud800"') is valid JSON, so a
        // response field can genuinely carry one -- and the raw URIError
        // must not escape; only StepError may.
        it("rejects a lone surrogate as StepError, not a raw URIError", () => {
            expect(() => runStep("text>urlenc", String.fromCharCode(0xd800), []))
                .toThrow(StepError);
        });

        // The fix must not overcorrect: ordinary multi-byte text, including
        // emoji (astral characters, i.e. *paired* surrogates) and accented
        // Latin characters, is legitimate input and must keep encoding
        // exactly as encodeURIComponent would.
        it("still encodes ordinary non-ASCII text, including emoji", () => {
            expect(runStep("text>urlenc", "café", [])).toBe(encodeURIComponent("café"));
            expect(runStep("text>urlenc", "😀", [])).toBe(encodeURIComponent("😀"));
        });
    });

    describe("lone surrogate rejection across all encode steps", () => {
        // A lone surrogate has no valid UTF-8 encoding of its own. Left
        // unguarded, text>base64/base64url/hexbytes would silently
        // substitute U+FFFD (Buffer.from's behaviour) while text>urlenc
        // would throw a raw URIError -- the same input class producing two
        // different behaviours across four supposedly-uniform encode steps.
        // Both are wrong: reject it the same way, everywhere.
        const LONE_HIGH = String.fromCharCode(0xd800);
        const LONE_LOW = String.fromCharCode(0xdc00);
        const ENCODE_STEPS = ["text>base64", "text>base64url", "text>hexbytes", "text>urlenc"] as const;

        it("rejects a lone high surrogate in every encode step", () => {
            for (const step of ENCODE_STEPS) {
                expect(() => runStep(step, LONE_HIGH, []), step).toThrow(StepError);
            }
        });

        it("rejects a lone low surrogate in every encode step", () => {
            for (const step of ENCODE_STEPS) {
                expect(() => runStep(step, LONE_LOW, []), step).toThrow(StepError);
            }
        });

        // The guard must not overcorrect: a naive "contains a code unit in
        // D800-DFFF" check would reject every emoji, since an emoji IS a
        // valid *paired* surrogate in UTF-16 -- that would fix the rare
        // case by breaking the common one. CJK, accented Latin, plain
        // ASCII, and an empty string must likewise sail through untouched.
        it("still accepts valid surrogate pairs (emoji), CJK, accented, ASCII and empty text", () => {
            const samples = ["😀", "日本語", "café, naïve, résumé", "Hello, world", ""];
            for (const s of samples) {
                expect(runStep("text>base64", s, []), s).toBe(Buffer.from(s, "utf8").toString("base64"));
                expect(runStep("text>base64url", s, []), s).toBe(Buffer.from(s, "utf8").toString("base64url"));
                expect(runStep("text>hexbytes", s, []), s).toBe(`0x${Buffer.from(s, "utf8").toString("hex")}`);
                expect(runStep("text>urlenc", s, []), s).toBe(encodeURIComponent(s));
            }
        });
    });

    describe("base64 padding", () => {
        // "QQ" is one byte's worth of base64 (6 bits short of a full group);
        // both the fully-padded canonical form and the unpadded form are
        // legitimate ways to write that, and both decode to "A".
        it("accepts fully padded and fully unpadded base64", () => {
            expect(runStep("base64", "QQ==", [])).toBe("A");
            expect(runStep("base64", "QQ", [])).toBe("A");
        });

        // "QQ=" has neither the two padding characters a fully padded
        // encoding requires nor the absence of padding an unpadded one
        // requires -- Buffer.from decodes it anyway (leniently treating it
        // as "QQ"), but that leniency is exactly the kind of silent
        // correction this plugin must not perform, so it is rejected.
        it("rejects a single stray padding character", () => {
            expect(() => runStep("base64", "QQ=", [])).toThrow(StepError);
        });
    });

    describe("junk that Buffer.from would otherwise ignore", () => {
        // Buffer.from("base64") silently skips embedded whitespace, which
        // would otherwise make a base64 payload with an accidental newline
        // (or one deliberately line-wrapped, e.g. PEM-style) decode to a
        // value that doesn't reflect the literal input; rejecting it is the
        // deliberate, always-safe choice.
        it("rejects base64 with an embedded newline", () => {
            expect(() => runStep("base64", "SGVsbG8sIHdvcmxk\n", [])).toThrow(StepError);
        });

        it("rejects base64 with an embedded space", () => {
            expect(() => runStep("base64", "SGVs bG8s IHdv cmxk", [])).toThrow(StepError);
        });

        it("rejects base64 with trailing non-alphabet junk", () => {
            expect(() => runStep("base64", "SGVsbG8sIHdvcmxk!!!", [])).toThrow(StepError);
        });
    });

    describe("hex byte-string shape", () => {
        it("rejects an odd number of hex digits instead of truncating", () => {
            // Buffer.from("abc", "hex") silently truncates to one byte
            // (0xab) instead of failing; the round-trip check must catch it.
            expect(() => runStep("hexbytes", "abc", [])).toThrow(StepError);
        });
    });

    describe("decode length bound", () => {
        // BASE64URL_PATTERN's nested quantifiers make V8's regex engine
        // recurse proportionally to input length; empirically this throws a
        // raw RangeError ("Maximum call stack size exceeded") somewhere
        // between 4,468,750 and 4,476,562 characters. decodeStrict must
        // reject an oversized input with StepError well before that native
        // crash is ever reached.
        const MAX_DECODE_LENGTH = 2_000_000;

        it("rejects an input beyond the maximum decode length as StepError, not a raw RangeError", () => {
            const oversized = "A".repeat(MAX_DECODE_LENGTH + 1);
            expect(() => runStep("base64url", oversized, [])).toThrow(StepError);
        });

        it("still decodes correctly at exactly the maximum bound", () => {
            // 1,500,000 bytes of ASCII base64url-encodes to exactly
            // 2,000,000 characters (3 bytes -> 4 chars, no padding needed).
            const bytes = "A".repeat(1_500_000);
            const encoded = Buffer.from(bytes, "utf8").toString("base64url");
            expect(encoded.length).toBe(MAX_DECODE_LENGTH);
            expect(runStep("base64url", encoded, [])).toBe(bytes);
        });

        it("leaves ordinary small inputs unaffected", () => {
            expect(runStep("base64url", "SGVsbG8", [])).toBe("Hello");
        });
    });

    describe("utf-8 validity", () => {
        // Buffer#toString("utf8") never fails: bytes that aren't valid UTF-8
        // are silently replaced with U+FFFD. Handing that back would be a
        // silently-wrong value, so decoding bytes that aren't valid text
        // must be rejected instead.
        it("rejects hex bytes that don't form valid utf-8 text", () => {
            expect(() => runStep("hexbytes", "0xff", [])).toThrow(StepError);
        });

        it("rejects base64 that decodes to bytes that aren't valid utf-8 text", () => {
            expect(() => runStep("base64", "/w==", [])).toThrow(StepError);
        });
    });

    describe("non-ASCII round-trips", () => {
        const samples = ["café, naïve, résumé", "😀 emoji test 🎉"];

        it("round-trips non-ASCII text through base64", () => {
            for (const s of samples) {
                expect(runStep("base64", runStep("text>base64", s, []), [])).toBe(s);
            }
        });

        it("round-trips non-ASCII text through base64url", () => {
            for (const s of samples) {
                expect(runStep("base64url", runStep("text>base64url", s, []), [])).toBe(s);
            }
        });

        it("round-trips non-ASCII text through hexbytes", () => {
            for (const s of samples) {
                expect(runStep("hexbytes", runStep("text>hexbytes", s, []), [])).toBe(s);
            }
        });

        it("round-trips non-ASCII text through urlenc", () => {
            for (const s of samples) {
                expect(runStep("urlenc", runStep("text>urlenc", s, []), [])).toBe(s);
            }
        });
    });
});

describe("structured", () => {
    it("parses an embedded JSON string", () => {
        expect(runStep("json", '{"a":1,"b":[2,3]}', [])).toEqual({a: 1, b: [2, 3]});
    });

    it("rejects a string that is not JSON", () => {
        expect(() => runStep("json", "{oops", [])).toThrow();
    });

    it("decodes a JWT into header and payload", () => {
        const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
        const payload = Buffer.from('{"sub":"1234","admin":true}').toString("base64url");
        const token = `${header}.${payload}.c2lnbmF0dXJl`;

        expect(runStep("jwt", token, [])).toEqual({
            header: {alg: "HS256", typ: "JWT"},
            payload: {sub: "1234", admin: true},
        });
    });

    it("rejects a token without three segments", () => {
        expect(() => runStep("jwt", "abc.def", [])).toThrow();
    });

    it("rejects a token whose payload is not JSON", () => {
        const header = Buffer.from('{"alg":"none"}').toString("base64url");
        const bad = Buffer.from("not json").toString("base64url");
        expect(() => runStep("jwt", `${header}.${bad}.x`, [])).toThrow();
    });

    it("rejects an oversized segment as StepError rather than crashing, since jwt shares decodeStrict's bound", () => {
        const header = Buffer.from('{"alg":"none"}').toString("base64url");
        const oversizedPayload = "A".repeat(2_000_001);
        expect(() => runStep("jwt", `${header}.${oversizedPayload}.x`, [])).toThrow(StepError);
    });
});

describe("registry", () => {
    it("rejects an unknown step", () => {
        expect(() => runStep("nope", "x", [])).toThrow(/unknown step/i);
    });

    it("declares arity for every registered step", () => {
        for (const [name, step] of Object.entries(STEPS)) {
            expect(typeof step.arity, name).toBe("number");
        }
    });
});
