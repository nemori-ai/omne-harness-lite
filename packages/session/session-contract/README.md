# @omne-harness/session-contract

[中文](README_ZH.md)

The pure contract member of Session. It has no Cordis dependency.

The root exports `SessionAccessCheck` and its correlated request and decision types. `./testing` exports an explicit scripted checker. Execution-boundary checks and the required transaction-factory dependency remain unimplemented. See [access checks](docs/access-check.md) for the limited authorization example and remaining integration work.

## Responsibility and status

This package owns the public contract of Session governance. It defines four caller faces: work, management, reconciliation, and history. It defines the ports that a provider supplies for construction, and the ports that Session calls outward. It defines the event catalog of the session log. It defines the signatures of the pure domain services, the decision function `decide`, and the reduction function `reduce`. It defines the block declaration `session.modes`.

The package does not own execution. Agent, Model, and Tool own their own execution lives. The package does not name a neighbor contract. It does not own storage, scheduling, or the plugin that binds a service to Cordis. A Session is a governance service. A Run and an attempt are governed objects, not running instances.

Status: contract member. The [SPEC](SPEC.md) states which parts come from technical acceptance and, in its status line, what the source supports. The source includes decisions beyond the first tenant path and non-durable testing providers. The SPEC status line lists the remaining limitations.

| Area                                                                                                                                                                                                                                                                                                                                                          | Support                                                                                                     | Where                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Types of the [API page](docs/public-api.md): values, identities, fixed inputs, results, the four faces, the ports, the signatures of the services, `decide` and `reduce`                                                                                                                                                                                      | Exported                                                                                                    | `src/`                                             |
| `create`, `completeInitialization`, `accept` (ordinary input), `startRun`, `recordMessage`, `receive` (input hand-over), `finishRun`                                                                                                                                                                                                                          | Implemented by `decide` and `reduce`, except rejected ordinary input has no SE12; see SE12-JC03 in the SPEC | `src/decide.ts`, `src/reduce.ts`                   |
| `accept` (card decision, business input), `claim`, `reload`, `preserveResult`, `completeConsumption`, `completeExternalConsumption`, `bindExternalCall`, `commitDerived`, `release`, `control`, `change`, `setRelation`, `configureAutoArchive`, `considerAutoArchive`, `recordIdle`, `interrupt`, `freeze`; `receive` of every fact other than the hand-over | Implemented. Model release confirmation retains the named MODEL-ACK-ARRIVAL limitation. The path of the Tool release receipt into the log retains the named deviation JC-RELEASE-TOOL-PATH | `src/decide.ts`                                    |
| `judgeAdvance`, `routeInput`, `judgeRunStart`, `openWork`, `judgeCompletion`, `resolveOperation`                                                                                                                                                                                                                                                              | Implemented                                                                                                 | `src/judgments.ts`                                 |
| `resolveControlScope`, `judgeIdle`, `resolveCascade`                                                                                                                                                                                                                                                                                                          | Implemented as pure judgments                                                                               | `src/judgments.ts`                                 |
| `./testing`: the `SessionTransactionPort` suite, its non-durable double, suites and doubles for identity, evidence, Context, clock, idle input, notification, drive and scope release                                                                                                                                                                         | Exported; the double passes the suite                                                                       | `src/testing*.ts`                                  |

Not verified: durability, concurrency across processes, recovery against a real store, the real identity source and clock. The double proves the judgments in memory only.

Four group members declare this dependency: session, session-cordis-contract, session-cordis, and session-adapters. `session` and `session-cordis` have empty production entries. `session-cordis-contract` uses the types in its service definitions, and session-adapters uses them in its testing implementation. Outside the group, m2-contract-skeleton consumes the contract and testing entries. The authorization tests now implement the public `SessionAccessCheck`; their [reference scope](docs/access-check.md#授权参考范围) does not prove production integration.

Initialization now supports optional registration, workspace-load and execution-adoption sources, trusted initial adoption guards, atomic result facts and original-receipt recovery. The current interpreter supports its exact revision 3 adoption. See [initialization wiring and release digests](docs/initialization.md). Real adoption providers, loaders and Context replay remain outside this in-memory proof.

The same-log pure layer validates original history, complete release batches, call registration, and control reference retention. Its explicit history fixture is non-durable. See [pure-layer support and provider obligations](docs/same-log-pure.md).

## Usage

The package has two entries: `@omne-harness/session-contract` and `@omne-harness/session-contract/testing` (tests only). It has no `./cordis` entry. A caller that needs only the types and the pure functions installs this package alone. It needs no Cordis and no host.

A caller takes the faces that match its caller class:

```ts
import type { SessionFaces } from '@omne-harness/session-contract'

declare function drive<P>(session: SessionFaces<P>): void
// session.work, session.management, session.reconciliation, session.history
```

The [API page](docs/public-api.md) navigates the exports by source file. The [usage page](docs/context.md) shows who consumes each face and in which order. A caller that works inside Cordis uses the service definition in [session-cordis-contract](../session-cordis-contract/README.md). See the [Cordis page](docs/cordis.md).

## Contracts

- `src/` owns the public shapes, the pure judgments, `decide`, `reduce` and the entry codec.
- The [SPEC](SPEC.md) owns behavior beyond the types. It owns the operation tables, the joint commit table, and the Agent participation clauses. It owns the advance and reload clauses, the event consumption clauses, and the two-layer Run state machine.
- The [API page](docs/public-api.md) navigates the exports; the API snapshot is `api/session-contract.api.md`.
- The [object model](docs/object-model/README.md) owns the log events, the state transitions, and the identity and lifecycle of each object.
- The [flows](docs/flows/README.md) show the cross-member sequences and the failure branches.

Every change operation has an operation identity. A repeat of the same operation with the same intent returns the original receipt. An unknown commit result stays unknown until a query returns the original result. The package holds no resources and has nothing to dispose.

## Design

The package has one root entry. It holds values and result types, the four faces, the construction and outbound ports, the pure domain services, and one block declaration. The dependency direction is one way. The consumers depend on this package. [session](../session/README.md) supplies the mechanism. [session-cordis-contract](../session-cordis-contract/README.md) binds the same operations to Cordis. [session-adapters](../session-adapters/README.md) is the only member that imports neighbor contracts. This package imports none of them. The [architecture page](docs/architecture.md) explains the boundaries. The [flows](docs/flows/README.md) and the [object model](docs/object-model/README.md) hold the sequences and the objects.

## Configuration and operation

The package has no configuration, needs no environment, and reads no resources at run time. The caller passes the tenant, the session, the principal, and the operation identity as operation input. The provider supplies storage, clock, identity, and notification. Configuration of scheduling policy and retry limits belongs to the [session](../session/README.md) factory.

## Verification

From the repository root, run:

```sh
pnpm --filter '@omne-harness/session-contract...' build
node scripts/with-test-slot.mjs pnpm --filter @omne-harness/session-contract test
```

In this directory, run `pnpm typecheck` for the type check. The tests cover the export sets, `decide`/`reduce`, frozen sessions, historical executions, result custody, idle archive and compacted views, the pure judgments at their edges, the self-proof of the transaction suite with violating variants, and the dependency direction of the built entries. See [tests/](tests/README.md). Tests also cover behavior beyond the first path. Real backends and a complete production assembly remain unverified. Finite models and their assumptions are listed in [verification/](verification/README.md). These are the [continuing obligations](SPEC.md#持续验证义务与未覆盖) and the [candidate obligations](SPEC.md#候选的持续验证义务). A passing structure check does not prove behavior.

## Maintenance

- When a public export changes, update the SPEC, the [API page](docs/public-api.md), the [src index](src/index.md), and the export test.
- When an operation, a result, or a port changes, update the dependents: [session](../session/README.md), [session-cordis-contract](../session-cordis-contract/README.md), [session-cordis](../session-cordis/README.md), [session-adapters](../session-adapters/README.md), and [session-storage-sql](../session-storage-sql/README.md).
- When the event catalog or a state transition changes, update the [object model](docs/object-model/README.md) and the [flows](docs/flows/README.md) together.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Dependency direction and design limits
├── context.md            Consumers, order of use, position
├── cordis.md             Why this member has no Cordis entry
├── public-api.md         Candidate definitions and the export index
├── flows/                Cross-member flows and failure branches
└── object-model/         Log events and state transitions
src/                      Public types, judgments, decide, reduce, testing doubles
tests/                    Export sets, decide/reduce, suite self-proof, dependency walk
schema/                   Template placeholder
verification/             Finite frontier models and their assumptions; proofs/ is a placeholder
adr/                      Template placeholder
examples/                 Template placeholder
resources/                Template placeholder
acceptance/               Template placeholder, fixtures/ too
```

Each directory has README.md for its role and index.md for navigation. The `src/`, `tests/`, and `verification/` pages describe the current package and its verification resources. The directories marked as placeholders above retain their template status. See [index.md](index.md) for reading paths.
