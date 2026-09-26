# @omne-harness-lite/offer-expiry

[中文](README_ZH.md)

Pure time values and offer-state evaluation. Parse a positive TTL, construct a read-only `OfferTiming` value, and derive its current state from explicit time, settlement and target-existence inputs.

## Workspace use

This is an experimental, private workspace package, currently not published on npm. In a repository checkout, use the [development setup](../../../docs/development.md), build the workspace, and declare `"@omne-harness-lite/offer-expiry": "workspace:*"` in the consuming member. Declare other packages imported by an example as direct dependencies too. Import through the public package entry; do not import sibling `src/` paths.

## Public API

| Public API                                                     | Purpose                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `Instant`, `Duration`, instant conversion/comparison functions | Branded integer milliseconds and RFC 3339 exchange strings           |
| `parseOfferTtl`, `timingFrom`, `parseOfferTiming`              | Positive durations and ordered issue/expiry times                    |
| `deriveState`, `acceptable`, state constants/types             | Derived state and a single acceptance predicate                      |
| `Clock`                                                        | `now(): Instant \| 'unavailable'` interface; no clock implementation |
| `validate`, `schemaId`; `./schema`, `./schema/v1`              | Current v2 Schema and retained v1 Schema resource                    |
| `./testing`                                                    | `testClock` and `TestClock` for tests                                |

## Examples

Each TypeScript example is self-contained and uses the built public exports.

### Construct timing and evaluate the exact deadline

```ts
import {
  acceptable,
  deriveState,
  instantFromRfc3339,
  instantToRfc3339,
  parseOfferTtl,
  timingFrom,
} from '@omne-harness-lite/offer-expiry'

const issued = instantFromRfc3339('2026-09-26T10:00:00Z')
const ttl = parseOfferTtl('PT1H')
if (!('ok' in issued) || !('ok' in ttl)) throw new Error('invalid timing input')
const timing = timingFrom(issued.ok, ttl.ok)
if (timing === 'unavailable' || !('ok' in timing)) throw new Error('timing construction failed')
const state = deriveState({
  timing: timing.ok,
  settled: null,
  now: timing.ok.expiresAt,
  target: 'exists',
})
console.log(instantToRfc3339(timing.ok.expiresAt)) // 2026-09-26T11:00:00.000Z
console.log(state) // pending: equality at the deadline is still acceptable
if (state !== 'unavailable') console.log(acceptable(state)) // true
```

### Preserve settlement and propagate unavailable inputs

```ts
import { deriveState, parseOfferTiming } from '@omne-harness-lite/offer-expiry'

const parsed = parseOfferTiming({
  issuedAt: '2026-09-26T10:00:00Z',
  expiresAt: '2026-09-26T11:00:00Z',
})
if (!('ok' in parsed)) throw new Error(parsed.invalidInput)
console.log(
  deriveState({
    timing: parsed.ok,
    settled: 'declined',
    now: 'unavailable',
    target: 'unavailable',
  }),
)
// declined
console.log(deriveState({ timing: parsed.ok, settled: null, now: 'unavailable', target: 'absent' }))
// unavailable
console.log(
  deriveState({ timing: parsed.ok, settled: null, now: parsed.ok.issuedAt, target: 'absent' }),
)
// expired
```

## Boundaries and failures

The current states are `pending`, `accepted`, `withdrawn`, `declined`, `expired`. Persist only terminal `SettledState` values (`accepted`, `withdrawn`, `declined`); derive `pending` and `expired` on reads. Evaluation order is settlement, unavailable inputs, strict `now > expiresAt` or absent target, then pending. An unavailable target is not an absent target.

The package supplies no clock, timer, cleanup task or storage transaction. A consumer must use a consistent time source and re-evaluate acceptance inside the transaction that writes its effects. `parseOfferTtl` accepts positive safe-integer milliseconds or fixed ISO durations such as `P7D`, `PT1H30M` and `P2W`; it rejects years, months, zero, missing input and invalid forms. Defaults are the caller's responsibility.

`Instant` uses millisecond precision; RFC 3339 sub-millisecond fractions are rounded. This is not an arbitrary-precision timestamp type. `timingFrom` returns `'unavailable'` on unsafe addition. Formatting outside the representable four-digit RFC 3339 year range throws `RangeError`. Shape-only `validate` does not replace `parseOfferTiming`'s cross-field check. `./schema/v1` retains the v1 resource, not a full v1 behavior API; `./testing` is test-only.

## Development

```sh
pnpm --filter @omne-harness-lite/offer-expiry run build
pnpm --filter @omne-harness-lite/offer-expiry run typecheck
pnpm --filter @omne-harness-lite/offer-expiry run test
```

Build workspace dependencies first. These checks cover this package; integration behavior requires the actual consumer and provider.
