# @omne-harness/session-contract

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The pure contract member of Session. It has no Cordis dependency.

## Responsibility and status

This package owns the public contract of Session governance. It defines four caller faces: work, management, reconciliation, and history. It defines the ports that a provider supplies for construction, and the ports that Session calls outward. It defines the event catalog of the session log. It defines the signatures of the pure domain services and the reduction function `reduce`. It defines the block declaration `session.modes`.

The package does not own execution. Agent, Model, and Tool own their own execution lives. The package does not name a neighbor contract. It does not own storage, scheduling, or the plugin that binds a service to Cordis. A Session is a governance service. A Run and an attempt are governed objects, not running instances.

Status: contract member, `draft`. The [SPEC](SPEC.md) states which earlier parts come from technical acceptance. The section [runtime contract candidate](SPEC.md#运行契约候选) is a candidate design. Technical acceptance has not happened for it.

- Implemented: nothing. `src/index.ts` holds only a template marker. The root entry exports nothing.
- Not implemented: the types, the four faces, the port interfaces, the domain services, `reduce`, and `sessionModesBlock`.
- Not verified: every behavior clause in the SPEC. The only test checks that the root entry exports nothing. The package makes no claim about durability, concurrency, recovery, tenant isolation, or performance.

Three members of the group list this package as a dependency: session, session-cordis-contract, and session-cordis. They use no export yet, because the entry is empty.

## Usage

The package has one entry: `@omne-harness/session-contract`. It has no `./cordis` entry. A caller that needs only the types and the pure functions installs this package alone. It needs no Cordis and no host.

After the implementation arrives, a caller takes the faces that match its caller class. The candidate shape is below. It is not a runnable example, and the package does not export it today.

```ts
import type { SessionFaces } from '@omne-harness/session-contract'

declare function drive<P>(session: SessionFaces<P>): void
// session.work, session.management, session.reconciliation, session.history
```

The [API page](docs/public-api.md) gives the full candidate definitions. The [usage page](docs/context.md) shows who consumes each face and in which order. A caller that works inside Cordis uses the service definition in [session-cordis-contract](../session-cordis-contract/README.md). See the [Cordis page](docs/cordis.md).

## Contracts

- `src/` owns the public shapes. It is empty now.
- The [SPEC](SPEC.md) owns behavior beyond the types. It owns the operation tables, the joint commit table, and the Agent participation clauses. It owns the advance and reload clauses, the event consumption clauses, and the two-layer Run state machine.
- The [API page](docs/public-api.md) indexes the candidate definitions. It lists the current exports and the candidate exports separately.
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
pnpm turbo run test --filter=@omne-harness/session-contract
```

In this directory, run `pnpm typecheck` for the type check. The current test checks only that the root entry exports nothing. See [tests/](tests/README.md). No test covers the verification obligations of the SPEC yet. These are the [continuing obligations](SPEC.md#持续验证义务与未覆盖) and the [candidate obligations](SPEC.md#候选的持续验证义务). A passing structure check does not prove behavior.

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
src/                      Public types, only index.ts now
tests/                    Entry test, fixtures/ is empty now
schema/                   Template placeholder
verification/             models/ and proofs/, template placeholders
adr/                      Template placeholder
examples/                 Template placeholder
resources/                Template placeholder
acceptance/               Template placeholder, fixtures/ too
```

Each directory has README.md for its role and index.md for navigation. Outside `docs/`, these files are still template placeholders and state no package facts. See [index.md](index.md) for reading paths.
