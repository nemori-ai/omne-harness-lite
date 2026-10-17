# @omne-harness/operation-result

[中文](README_ZH.md)

Module package for operation results. It gives capability contracts one shape for a value that succeeded, an acknowledgement without a value, and a failure. The behavior contract is [SPEC.md](SPEC.md). The shapes were accepted in the [#248 contract](https://github.com/nemori-ai/omne-harness-lite/issues/248#issuecomment-6176737639). The split into this member is the [#371 technical adoption decision](https://github.com/nemori-ai/omne-harness-lite/issues/371#issuecomment-6229850851).

## Responsibility and status

This member owns `Outcome`, `Ack`, `succeed`, `ack`, `fail`, and `isSuccess`. It has no runtime dependency and does not import Cordis. The failure vocabulary `F` belongs to the caller. This package does not define a shared failure vocabulary, and it is not a unified envelope for every capability.

The location `packages/common/operation-result` is the adopted target from the common-group README. The named consumers are `tool-contract`, `tool`, `tool-cordis-contract`, and `model-contract`. They are on the #342 branch and are not yet in this track. The shapes and functions moved from `@omne-harness/kernel-basis` without change.

## Usage

Import the public entry by package name. Dependencies are empty. The package has no Cordis entry.

```ts
import { ack, fail, isSuccess, succeed } from '@omne-harness/operation-result'

const valued = succeed({ id: 'job-1' })
const empty = ack()
const broken = fail('rejected' as const)

isSuccess(valued) // true, valued.ok is { id: 'job-1' }
isSuccess(empty) // true, empty.ok is true
isSuccess(broken) // false
```

## Contracts

[SPEC.md](SPEC.md) owns the result shapes and the consumer table.

`Outcome<T, F>` is `{ ok: T } | { failure: F }`. `Ack<F>` is `{ ok: true } | { failure: F }`. `F` belongs to the caller. `isSuccess` is true when the object has `ok`. A valued success carries its payload in `ok`. An empty acknowledgement has `ok` equal to `true` and carries no payload.

## Design

`src/index.ts` is the only module. It holds two types and four small functions. It has no state, no import, and no configuration.

## Configuration and operation

This package reads no environment variable and starts no process. Installing it installs no other package at run time.

## Verification

Applicable tests are unit tests and contract tests from the public entry. The tests import the package by name. That name resolves to `dist/index.js`, so the tests also check independent consumption of the build. Integration tests and end-to-end journey tests do not apply. This package has no storage, service, or user journey.

| File | Covers |
| --- | --- |
| `tests/outcome.spec.ts` | `succeed`, `ack`, `fail`, and `isSuccess` results |
| `tests/public-entry.spec.ts` | The exact runtime exports of the root, empty `dependencies`, the single `.` export, and no Cordis text in `dist/index.js` or `dist/index.d.ts` |

Run `pnpm test` from this directory. It builds `dist` and then runs the tests. Run `pnpm typecheck` to check the tests against the source types.

## Maintenance

A change to a shape or to the meaning of `ok` or `failure` changes the public contract. Update SPEC.md first, then both READMEs, then synchronize the named consumers. A new dependency, and any new entry, need a new adoption decision. Failure vocabularies stay with the callers that own them.
