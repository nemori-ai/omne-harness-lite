# @omne-harness/call-account

[中文](README_ZH.md)

One call account for a model call or a tool execution.

## Responsibility and status

This member checks one account snapshot, replaces an older snapshot with a higher revision, and selects a source subtotal or a payable amount. A model call and a tool execution use the same shape. The subject kind distinguishes them. Session writes the account into the session log. Request context does not import this package. The business ledger owner keeps persistence. Stream assembly does not carry usage or cost.

## Usage

```ts
import { judgeCallAccount, payableAmount } from '@omne-harness/call-account'

const account = {
  subject: { kind: 'model_call', id: 'call_01' },
  usage: [{ name: 'input', state: 'known', lexeme: '128', unit: 'token' }],
  cost: [
    { state: 'known', lexeme: '1.00', unit: 'USD', source: 'supplier' },
    { state: 'known', lexeme: '1.50', unit: 'USD', source: 'billable' },
    { state: 'known', lexeme: '1.50', unit: 'USD', source: 'ledger' },
  ],
  trimmed: { state: 'unknown', unit: 'token' },
  place: 'provider-a',
  duration: 'PT1.5S',
  receipt: 'received',
  revision: '0',
}

judgeCallAccount(account)
payableAmount(account)
```

Model and tool produce that value. Session calls `admitRevision` when a later snapshot arrives, then `payableAmount`. The sample is not a live runtime call. There is no Cordis entry.

## Contracts

`judgeCallAccount` returns `{ ok }` or `{ rejected }`. It admits only the keys of a closed account. An unknown key rejects as `extra`. An unknown amount has `unit` and no `lexeme`. A known or provisional amount has both. Public types are the package entry. The account meaning stays with the call-account term. This section does not copy those types.

`USD` allows at most two decimal places. A `token` lexeme allows no decimal fraction. Exceeding either bound rejects as `precision`. Any other non-empty unit keeps an ordinary non-negative decimal lexeme. This member does not add a further decimal cap, and it does not claim that a currency or business unit policy was checked. Units compare as exact strings. They are not converted. This bound is the adopted scope of the D-05 decision for this delivery. It does not treat every unit as already settled by #263. The account meaning stays with the [call account term](../../../.meta_harness/design/ubiquitous_language/terms/execution-and-outcome.md). Token category names stay with [model invocation](../../../docs/domains/model-invocation/README.md).

A duration string must be an SI-second duration that `utc-instant` accepts. `{ "state": "unknown" }` is also a duration.

`admitRevision` returns the next snapshot only when its revision is greater. A lower or equal revision keeps the earlier snapshot. A different subject rejects as `subject`.

`sourceSubtotal` adds only `known` amounts of one source. Provisional and unknown amounts stay out of the sum. When no `known` amount participates, the subtotal is `unknown`. The mixed-unit check applies only to amounts that participate. One participating amount keeps its original lexeme. A sum of several amounts may drop trailing zeros, and the value stays exact. Different units reject as `unit`. `payableAmount` returns the known `ledger` subtotal. When that subtotal is unknown, it returns the known `billable` subtotal. `supplier` and `observation` are not the payable amount. In the sample above the payable lexeme is `1.50`.

`canonicalAccount` serializes the account value the caller already holds. It does not admit again, sort keys, or promise a general canonical JSON form. After admission, parsing that JSON and judging it again keeps the input amount lexemes.

## Design

`src/index.ts` owns admission, revision, subtotals, and payable selection. `src/decimal.ts` adds decimal lexemes with a coefficient and an exponent. It does not call `Number` on a coefficient.

An amount is either unknown, or known, or provisional. Those three states do not share one optional lexeme.

## Configuration and operation

The package reads no environment. `engines.node` stays `>=24.18.0 <25`.

## Verification

`pnpm --filter @omne-harness/call-account typecheck` and `pnpm --filter @omne-harness/call-account test` cover the public entry. The tests cover an unknown cost, `precision`, revision replacement, the `1.50` payable amount, mixed units, a JSON round trip, and a separate process that imports the package name. This package holds pure values, so it has no storage integration test and no user-journey end-to-end test.

## Maintenance

Token category names stay with model invocation. Session log storage stays with session. Ledger persistence stays with the business ledger owner.
