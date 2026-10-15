# @omne-harness/stream-arrival

[中文](README_ZH.md)

One step of a streaming delivery. The steps are open, fill, close, trim, and finish.

## Responsibility and status

A step belongs to one streaming delivery. It is not an inbound intake and it is not a Cordis dispatch. Model and tool keep their own send and execution behavior and consume this vocabulary.

The package does not assign indexes, store a log, or carry usage and cost bodies. This initialization stops at the five step names and the index check. Stream assembly and terminal rules stay with a later owner.

## Usage

```ts
import { judgeStreamArrival } from '@omne-harness/stream-arrival'

judgeStreamArrival({ step: 'open', index: '0' })
```

There is no Cordis entry.

## Contracts

`STREAM_ARRIVAL_STEPS` is `open`, `fill`, `close`, `trim`, `finish`. `judgeStreamArrival` returns `{ rejected: 'step' }` for any other step name, including `event`. A missing index is `{ rejected: 'index' }`.

## Design

`src/index.ts` owns the step list and `judgeStreamArrival`.

## Configuration and operation

The package reads no environment. The emitting runtime assigns the index.

## Verification

`pnpm --filter @omne-harness/stream-arrival test` runs `tests/public-entry.spec.ts`. That file is the unit test and the contract test. It checks the step names and index rejection from the public entry. This package holds pure values, so it has no storage integration test and no user-journey end-to-end test.

## Maintenance

Execution facts stay in model and tool.
