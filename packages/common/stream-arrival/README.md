# @omne-harness/stream-arrival

[中文](README_ZH.md)

One step of a streaming delivery. The steps are open, fill, close, trim, and finish.

## Responsibility and status

A step belongs to one streaming delivery. It is not an inbound intake and it is not a Cordis dispatch. Model and tool keep their own send and execution behavior and consume this vocabulary.

The package does not assign indexes, store a log, or carry usage and cost bodies. `judgeStreamArrival` checks that one step name and one index are present. It does not order steps. `assembleStream` folds one target's steps into a live assembly or an ended terminal. It requires `seq` in order. It rejects a gap or a regression. It does not reorder.

## Usage

```ts
import { assembleStream, judgeStreamArrival } from '@omne-harness/stream-arrival'

judgeStreamArrival({ step: 'finish', index: '9' })

assembleStream({
  target: { id: 'msg_abcdefghijklmnopqrstuv', role: 'assistant' },
  steps: [
    {
      step: 'open',
      index: '0',
      mode: 'append',
      head: { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true } },
    },
    { step: 'fill', index: '0', seq: '0', chunk: 'hello' },
    { step: 'fill', index: '0', seq: '1', chunk: 'hello' },
    { step: 'close', index: '0' },
    { step: 'finish', index: '0' },
  ],
})
```

A caller cancel is `end: { kind: 'cancelled' }`. It is not a step. Disconnecting an observer adds no step and no `end`.

There is no Cordis entry.

## Contracts

`STREAM_ARRIVAL_STEPS` is `open`, `fill`, `close`, `trim`, `finish`. `judgeStreamArrival` returns `{ rejected: 'step' }` for any other step name, including `event`. A missing index is `{ rejected: 'index' }`. The judge reads `{ step, index }` only.

`assembleStream` returns `{ ok }` or `{ rejected, at, assembly }`. `ok.phase` is `live` or `ended`. An ended assembly has `terminal`. `terminal.kind` is `complete`, `truncated`, `failed`, or `cancelled`. Only `complete` carries a `message`. A novel step after a terminal is `late`, and the previous assembly stays. An open head that is not JSON is `json`. `assembleStream` copies `id`, `role`, and the JSON head at admission. A later edit of the caller objects does not change a returned assembly. `from` must be a previous return value. A hand-built `{ phase: 'live' }` is rejected. A `stopped` end is a terminal even when no block has closed. A later close or finish is `late`. `close` may include `block`. Absent means the accumulated fragments are sealed. Present means that JSON value is the sealed part. If its text or inline body disagrees with the accumulated body, the rejection is `conflict` and the previous assembly stays.

## Design

`src/index.ts` owns the step list, `judgeStreamArrival`, and `assembleStream`.

## Configuration and operation

The package reads no environment. The emitting runtime assigns the index.

## Verification

`pnpm --filter @omne-harness/stream-arrival test` runs `tests/public-entry.spec.ts` and `tests/assembly.spec.ts`. Those files are the unit tests and the contract tests. They check the step names, index rejection, and the assembly terminals, including a repeated delivery, a truncated delivery, a late step, and a caller cancel. This package holds pure values, so it has no storage integration test and no user-journey end-to-end test.

## Maintenance

Execution facts stay in model and tool.
