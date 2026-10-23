# @omne-harness/utc-instant

[中文](README_ZH.md)

Pure values for UTC instants and SI-second durations, with one comparison function and a bundled IERS leap-second table.

## Responsibility and status

This member owns UTC instants, SI-second durations, `compareInstants`, and the leap-second table that decides which second 60 exists. The location `packages/common/utc-instant` is the adopted target from the common-group README. Issue #244 implements the member.

Implemented: parsing, encoding, and exact comparison of instants, parsing and encoding of durations, and the leap-second table with its source, version, and expiry. Comparison does not call `Date` or `Number`. No source file in `src` uses `Date`, `Number`, `parseInt`, or `parseFloat`.

This package does not provide a clock. The wall clock, the monotonic clock, and the business clock are three read ports. Their owners implement them outside this package. No function here reads the current time, and no parameter has a `Date.now` default. The package also has no duration comparison, no arithmetic, no time zones, and no business deadlines. Those belong to their own owners.

## Usage

```ts
import {
  compareInstants,
  encodeDuration,
  encodeInstant,
  parseDuration,
  parseInstant,
} from '@omne-harness/utc-instant'

const leap = parseInstant('2016-12-31T23:59:60Z')
const next = parseInstant('2017-01-01T00:00:00Z')
if (leap.ok && next.ok) compareInstants(leap.value, next.value) // -1

const later = parseInstant('2026-10-14T12:00:00.5005Z')
const earlier = parseInstant('2026-10-14T12:00:00.500Z')
if (later.ok && earlier.ok) {
  compareInstants(later.value, earlier.value) // 1
  encodeInstant(earlier.value) // '2026-10-14T12:00:00.500Z'
}

const timeout = parseDuration('PT1.0000000000000001S')
if (timeout.ok) encodeDuration(timeout.value) // 'PT1.0000000000000001S'
parseDuration('P1D') // { ok: false, failure: { kind: 'calendar-unit' } }
```

Every parse function returns `{ ok: true, value }` or `{ ok: false, failure }`. A parse function is the only way to get an `Instant` or a `Duration`. `encodeInstant(parseInstant(text).value)` returns `text` for every accepted text. The same law holds for durations. `0.5` and `0.500` compare equal, and each value keeps its own text.

The package has no dependencies and no Cordis entry. The `exports` map has one entry, `.`. Its `source` condition points to `src/index.ts`, and its `types` and `import` conditions point to `dist`. `files` publishes `dist` only. The `build` script deletes `dist` before `tsc`. `tsconfig.build.json` sets `erasableSyntaxOnly`.

## Contracts

The behavior owner is the common-group README and the accepted #221 decision. This section names the failures that callers can see. The exported TypeScript types give the exact shapes.

| Function | Failure `kind` | When |
| --- | --- | --- |
| `parseInstant` | `syntax` | The text is not `YYYY-MM-DDTHH:MM:SS[.digits]Z`. The `T` and the `Z` must be uppercase. |
| `parseInstant` | `offset` | The text ends with a numeric offset such as `+00:00`. The parser accepts only `Z`. |
| `parseInstant` | `range` | A calendar field is impossible, for example `2026-02-29` or `24:00:00`. Second 60 outside `23:59` is also `range`. |
| `parseInstant` | `leap-second` | The table does not insert second 60 on that day (`detail: 'not-inserted'`). Or the table deletes second 59 on that day (`detail: 'deleted'`). |
| `parseInstant` | `leap-data-expired` | Second 60 is not listed, and the instant is at or after the table expiry. |
| `parseDuration` | `syntax` | The text is not `PT<digits>[.<digits>]S` or `-PT<digits>[.<digits>]S`. A repeated seconds designator such as `PT5S5S` is `syntax`, not `calendar-unit`. |
| `parseDuration` | `calendar-unit` | The text uses a designator other than seconds, for example `P1D`, `PT1M`, or `PT1H`. |
| `readLeapSecondData` | `syntax` | A line does not match the IERS format, or the `#$` line or the `#@` line is missing or repeated. |
| `readLeapSecondData` | `step` | The first data row is not NTP `2272060800` with offset `10`, data rows do not advance, a row is not at midnight, or TAI-UTC changes by more than one second. |

Leap-second rules:

- Second 60 parses only on a day that the table lists as a positive insertion. A listed insertion stays valid after the table expiry.
- The first data row of `leap-seconds.list` must be the 1972-01-01 base offset of 10. It is not an insertion. A list that starts later is truncated and fails as `step`. Each later `+1` row inserts `23:59:60` on the previous day. Lines may end with LF or CRLF.
- A `-1` row deletes `23:59:59` on the previous day. The bundled table has no deletion. Tests use labelled test data for this rule.
- Ordinary instants parse after the table expiry. This includes a month-end `23:59:59`.

`parseInstant(text, table)` uses `table` instead of the bundled `leapSecondData`. A table comes from `readLeapSecondData(text, source)`. `leapSecondData.source` is a string. `leapSecondData.version` and `leapSecondData.expires` are `Instant` values. Compare them with `compareInstants`.

`Instant`, `Duration`, and `LeapSecondData` are opaque. Their `toJSON` and `toString` methods throw a `TypeError`, so `JSON.stringify` cannot write `{}` for them, and `String(value)` or a template literal cannot write `[object Object]`. Write the text form with an encode function instead. `encodeInstant`, `compareInstants`, and `encodeDuration` throw a `TypeError` for a value that a parse function did not make. `new value.constructor(...)` also throws a `TypeError`, because the constructors require a token that only the module holds.

## Design

| Module | Responsibility |
| --- | --- |
| `src/index.ts` | Re-exports the seven runtime names and the types `Instant`, `Duration`, `LeapSecondData`, `InstantFailure`, `InstantParse`, `DurationFailure`, `DurationParse`, and `LeapSecondDataRead`. |
| `src/instant.ts` | Owns `Instant` and `LeapSecondData`, parsing, encoding, comparison, and the assembly of `leapSecondData`. |
| `src/duration.ts` | Owns `Duration`, its parsing, and its encoding. |
| `src/leap-seconds.ts` | Reads the IERS format and returns plain data with civil text. It does not import `instant.ts`. |
| `src/leap-seconds.generated.ts` | Holds the text of `resources/leap-seconds.list`. `scripts/embed-leap-seconds.mjs` writes it. |

An `Instant` stores two strings in private fields. The first is the fixed-width civil text `YYYY-MM-DDTHH:MM:SS`. The second is the fraction digits as written. `compareInstants` orders the civil text as a string. Then it compares the fraction digits one by one and reads a missing digit as `0`. Second 60 therefore sorts before the next midnight.

A `Duration` stores the accepted text in one private field. A `LeapSecondData` stores its source, its version and expiry instants, and the sets of insertion and deletion days.

The generated module keeps the table inside `dist`. The package does not read the file system or the network at run time.

## Configuration and operation

This package reads no environment variable and does not wait on a clock. The bundled table is a resource that this member owns:

| Field | Value |
| --- | --- |
| Source | [IERS `leap-seconds.list`](https://hpiers.obspm.fr/iers/bul/bulc/ntp/leap-seconds.list). It is byte-identical to the [IANA copy](https://data.iana.org/time-zones/tzdb/leap-seconds.list). |
| Version, `#$` line | `3992312697`, which is `2026-07-06T07:44:57Z` |
| Expiry, `#@` line | `4023129600`, which is `2027-06-28T00:00:00Z` |

The package does not decide whether the table is stale now, because it has no clock. A caller that must know compares `leapSecondData.expires` with a reading from a clock that the caller owns.

## Verification

Applicable tests are unit tests and contract tests through the public entry `@omne-harness/utc-instant`. Expected values are literals. The tests do not compute them with `Date` or `Number`. Integration tests and end-to-end journey tests do not apply, because this package has no storage, service, or user journey.

| Test file | What it checks |
| --- | --- |
| `tests/public-entry.spec.ts` | The exact set of runtime exports. |
| `tests/public-types.spec-d.ts` | The failure and result types are exported from the package entry. |
| `tests/instant.spec.ts` | Instant grammar, failures, round trip, comparison, and opaque values. |
| `tests/duration.spec.ts` | Duration grammar, `calendar-unit`, round trip, and opaque values. |
| `tests/leap-seconds.spec.ts` | Second 60, the expiry boundary, caller tables, deletions, and table read failures. |
| `tests/leap-seconds-resource.spec.ts` | The embedded text equals `resources/leap-seconds.list`, and the file matches its own `#h` SHA-1 hash. |
| `tests/consumption.spec.ts` | A consumer round-trips one instant and one duration through the package name only. |

Run `pnpm turbo run test --filter=@omne-harness/utc-instant` from the repository root. turbo builds first, and the tests import `dist`. `pnpm test` in this directory does not build.

Not covered: `readLeapSecondData` does not check the `#h` hash of a caller-supplied file. Only the test checks the hash of the bundled file. This package does not prove that a persistent clock or a physical clock keeps true time.

## Maintenance

Design relationships with Identity and Tool are separate from actual direct imports. [call-account](../call-account/src/index.ts) uses `parseDuration` to check account durations. Model uses `parseInstant`, `compareInstants`, and the `Instant` type in its [testing clock](../../model/model/src/testing/clock.ts), and `parseInstant` in its [testing dispatch support](../../model/model/src/testing/dispatch.ts). Those Model imports support testing, not a production clock. The corresponding dependency declarations are in [call-account](../call-account/package.json) and [Model](../../model/model/package.json).

Business deadlines, lease recovery, and clock ports stay with their owners. Changes to `compareInstants` or failure names require review of #244, actual imports, and affected design consumers.

To update the leap-second table:

1. Download the current file from the IERS source into `resources/leap-seconds.list`. Do not edit the file.
2. Run `pnpm run leap-seconds:embed` in this directory.
3. Update the bundled version and expiry literals in `tests/leap-seconds.spec.ts` and in both READMEs. The package derives those instants from the file, so `src/instant.ts` has no copy of the numbers to edit.
4. Run `pnpm turbo run test --filter=@omne-harness/utc-instant` from the repository root.
