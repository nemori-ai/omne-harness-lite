# @omne-harness/operation-result

[中文](README_ZH.md)

Module package for operation results. It gives capability contracts one shape for a value that succeeded, an acknowledgement without a value, and a failure. The behavior contract is [SPEC.md](SPEC.md). The shapes were accepted in the [#248 contract](https://github.com/nemori-ai/omne-harness-lite/issues/248#issuecomment-6176737639). The split into this member is the [#371 technical adoption decision](https://github.com/nemori-ai/omne-harness-lite/issues/371#issuecomment-6229850851).

## Responsibility and status

This member owns `Outcome`, `Ack`, `succeed`, `ack`, `fail`, and `isSuccess`. It has no runtime dependency and does not import Cordis. The failure vocabulary `F` belongs to the caller. This package does not define a shared failure vocabulary, and it is not a unified envelope for every capability.

The location `packages/common/operation-result` follows the #371 technical adoption decision. The named consumers are `tool-contract`, `tool`, `tool-cordis-contract`, and `model-contract`. The current track has no production call site. When these members land on this track, they import this member through its public entry and do not copy the result types. The shapes and functions moved from `@omne-harness/kernel-basis` without change.

## Usage

Import the public entry by package name. Dependencies are empty. The package has no Cordis entry. [docs/context.md](docs/context.md) lists the consumers and the install closure.

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

[SPEC.md](SPEC.md) owns the result shapes and the consumer table. [docs/public-api.md](docs/public-api.md) indexes the six exports in the source.

`Outcome<T, F>` is `{ ok: T } | { failure: F }`. `Ack<F>` is `{ ok: true } | { failure: F }`. `F` belongs to the caller. `isSuccess` is true when the object has `ok`. A valued success carries its payload in `ok`. An empty acknowledgement has `ok` equal to `true` and carries no payload.

## Design

`src/index.ts` is the only module. It holds two types and four small functions. It has no state, no import, and no configuration. [docs/architecture.md](docs/architecture.md) gives the member position and the dependency direction. [docs/object-model.md](docs/object-model.md) explains why `Outcome` and `Ack` stay separate. [docs/flows.md](docs/flows.md) and [docs/cordis.md](docs/cordis.md) state why flows and Cordis do not apply.

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

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Key business flows and data flows
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
