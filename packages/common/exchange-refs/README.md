# @omne-harness/exchange-refs

[中文](README_ZH.md)

Module package for three plain values that cross domain boundaries: `Adoption`, `DurableEvidence`, and `ConsumerRef`. The behavior contract is [SPEC.md](SPEC.md). The basis is the [#734 dispatch decision](https://github.com/nemori-ai/omne-harness-lite/issues/734#issuecomment-6394333906).

## Responsibility and status

This member owns the single definition of the three types. It exports types only. It has no runtime value, no dependency, and no Cordis entry. The contract members agent-contract, model-contract, tool-contract, request-context-contract, and authorization re-export these types under the same names. [SPEC.md](SPEC.md#composition) owns the consumer list.

This member does not own any judgment. Structure checks, digest formats and algorithms, and rules that join two values stay with the domain that owns them. [SPEC.md](SPEC.md#ownership) lists them.

## Usage

Most code imports these types from the contract member it already uses. Import from this package when a member needs the shared shape directly.

```ts
import type { ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs'

const consumer: ConsumerRef = { owner: 'agent', work: 'execution/step', position: 'I3', purpose: 'main' }
const completion: DurableEvidence = { owner: 'agent', record: 'r-1', revision: '1', digest: 'd' }
```

The type does not check the values. The receiving domain checks them with its own judgment.

## Contracts

[SPEC.md](SPEC.md) owns the meaning of each type and the list of rules that stay in other domains. [docs/public-api.md](docs/public-api.md) indexes the three exports.

- `Adoption` is an exact adoption that a consumer can recover. The digest encoding belongs to the party that mints it and to the receiving domain.
- `DurableEvidence` locates one durable record of one owner. The digest only checks that the content is the same. The algorithm belongs to the owner.
- `ConsumerRef` is a stable position that a consumer owner registered. The producer keeps it as given. `purpose` is free text.

## Design

`src/index.ts` is the only module. It holds three type aliases and no import. [docs/architecture.md](docs/architecture.md) explains why the types are in `common` and not in `legal-identity`. [docs/object-model.md](docs/object-model.md) describes the three values. [docs/flows.md](docs/flows.md) and [docs/cordis.md](docs/cordis.md) state why flows and Cordis do not apply.

## Configuration and operation

This package reads no environment variable and starts no process. Installing it installs no other package at run time.

## Verification

| File | Covers |
| --- | --- |
| `tests/shapes.spec-d.ts` | Each type has exactly four required readonly `string` members |
| `tests/public-entry.spec.ts` | The root has no runtime export, `dependencies` is empty, and `.` is the only entry |

Run `pnpm turbo run test --filter=@omne-harness/exchange-refs`. The type test runs in `test:fast` and in `pnpm typecheck`. These tests do not prove that a value comes from a trusted owner.

## Maintenance

A new member, a removed member, or a changed meaning changes the public contract of every re-exporting member. Update SPEC.md first, then confirm the change with Model and Tool, then regenerate the API snapshots of the re-exporting members. Do not add a digest algorithm, a predicate, or a cross-value rule to this package. The owner is PanQiWei.

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
