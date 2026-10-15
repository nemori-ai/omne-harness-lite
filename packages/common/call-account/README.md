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

`judgeCallAccount` returns `{ ok }` or `{ rejected }`. An unknown amount has `unit` and no `lexeme`. A known or provisional amount has both. `USD` with more than two decimal places, and a `token` lexeme with a decimal fraction, reject as `precision`. A duration string must be an SI-second duration that `utc-instant` accepts. `{ "state": "unknown" }` is also a duration.

`admitRevision` returns the next snapshot when its revision is greater. The same revision returns the first snapshot, whether the content matches or not. A different subject rejects as `subject`.

`sourceSubtotal` adds only `known` amounts of one source. Provisional and unknown amounts stay out. Different units reject as `unit`. `payableAmount` returns the known `ledger` subtotal. When that subtotal is unknown, it returns the known `billable` subtotal. `supplier` and `observation` are not the payable amount. In the sample above the payable lexeme is `1.50`.

## Design

`src/index.ts` owns admission, revision, subtotals, and payable selection. `src/decimal.ts` adds decimal lexemes with a coefficient and an exponent. It does not call `Number` on a coefficient.

An amount is either unknown, or known, or provisional. Those three states do not share one optional lexeme.

## Configuration and operation

The package reads no environment. `engines.node` stays `>=24.18.0 <25`.

## Verification

`pnpm --filter @omne-harness/call-account test` runs `tests/public-entry.spec.ts`. The tests cover an unknown cost, `precision`, revision replacement, the `1.50` payable amount, and mixed units. This package holds pure values, so it has no storage integration test and no user-journey end-to-end test.

## Maintenance

Token category names stay with model invocation. Session log storage stays with session. Ledger persistence stays with the business ledger owner.
