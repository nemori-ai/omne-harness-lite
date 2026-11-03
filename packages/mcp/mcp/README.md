# @omne-harness/mcp

[中文](README_ZH.md)

The general MCP implementation: the core services of the MCP group on the five requirement ports of `@omne-harness/mcp-contract`, and the production in-memory catalog store.

## Responsibility and status

This package implements four of the five application services of the contract: the category port `inspection`, the read port `discovery`, the status port `status` and the connections port `connections`. They share one connection table. The table builds a connection from the ports (credential handle, process landing, transport factory), keeps its state in the `Connection` aggregate, and closes it in the order of the group design. The call port `invoker` and the task table are the next wave.

Status: core implementation of W2, on the candidate contract. The behavior is in [SPEC.md](SPEC.md), which cites the contract clauses and adds the decisions this package makes. The group design is [the group engineering design](../docs/architecture.md).

| Part                                                                           | State                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `createMcpCore`: `inspection`, `discovery`, `status`, `connections`            | Implemented. Tested on the contract's in-memory doubles and a scripted transport             |
| `createInMemoryCatalogStore`                                                   | Implemented. Passes the contract's `CatalogStore` suite; CS8 does not apply                  |
| `Connection` and `InFlightCalls` aggregates, the gate, the connection table    | Implemented as internal modules; the next wave adds the invoker on them                      |
| `invoker` (`invoke`, `continueWithInput`, `cancel`, the four task operations)  | Not in this package yet                                                                      |
| Real transports, the official SDK, real peers, real processes, durable storage | Not here. `@omne-harness/mcp-host-local` provides them; nothing here is verified on them     |
| `list_changed` subscriptions, reconnection in the background                   | Not implemented. `changedNotified` stays false; a lost connection is rebuilt at the next use |

## Usage

The package has one entry. A host builds the five ports and the configuration, then the core:

```ts
import { createInMemoryCatalogStore, createMcpCore } from '@omne-harness/mcp'

const mcp = createMcpCore(
  { adoption, eligibility, credentials, landing, store: createInMemoryCatalogStore(), transports },
  {
    principalKey: principal => principal.id,
    maxListingPages: 4,
    maxActions: 200,
    instructionsByteLimit: 4096,
  },
)

const refreshed = await mcp.discovery.refresh(access, { ref })
if ('ok' in refreshed && refreshed.ok.kind === 'published') report(refreshed.ok.revision)

// At exit. It reports only the stop ranges that were confirmed.
const closed = await mcp.connections.closeAll()
```

Nothing connects until a `refresh` asks for it. `current`, `peer`, `inspect` and `list` never connect. The host that holds the instance calls `closeAll()` at exit. An unlawful configuration throws `RangeError` at construction. The package does not need Cordis; see [docs/context.md](docs/context.md).

## Contracts

- Public types and runtime checks: [src/](src/README.md), indexed in [docs/public-api.md](docs/public-api.md).
- Behavior beyond the types: [SPEC.md](SPEC.md). It cites the clauses of the [contract SPEC](../mcp-contract/SPEC.md) that this package fulfils (S1, S3–S5, S7–S9, K1–K3, C1–C7) and lists the decisions of its own.
- Errors, lifecycle and resources: a refusal or a connection failure is an `Outcome` failure; a broken precondition (an unlawful transition, a forged gate token, a configuration that is not an object) is a thrown `TypeError` or `RangeError`. The connection table owns the transport, the process handle and the credential handle of each connection and releases them in the close order.

## Design

Modules: `config`, `inspection`, `discovery`, `status`, `connections`, `store/memory`, and the internal `internal/connection` (aggregate), `internal/in-flight` (aggregate), `internal/gate` (the capability token), `internal/table` (the connection table), `internal/settings`, `internal/guard`, `internal/text`, `internal/canonical`. See [docs/architecture.md](docs/architecture.md), [docs/flows.md](docs/flows.md) and [docs/object-model.md](docs/object-model.md).

### For the next wave

The invoker attaches to three internal modules. Their signatures:

- `internal/table.ts`: `ensure(admitted: AdmittedEndpoint, access: Access<P>, options?: { signal?: AbortSignal; connectBound?: Millis }): Promise<Outcome<Ensured, EnsureFailure>>`. `Ensured` is `{ transport, generation, connection, peer, catalogKey }`. `EnsureFailure` is `{ reason: ConnectionFailure | Refusal | EffectUnknown; catalog: CatalogMark }`, where `catalog` says what the marking of the catalog did (`marked`, `revision-conflict`, `unavailable`, `not-acquired`, `untouched`). The table also offers `lose(connection, reason, mark)` for a request that found an established connection gone, `current(key)`, `stateOf(tenant, holding)`, `close(tenant, holding)` and `closeAll()`.
- `internal/in-flight.ts`: `class InFlightCalls` with `reserve(key): 'reserved' | 'in-use'`, `markSent(key, requestId, generation): 'sent' | 'cancelled'`, `markEnded(key)`, `release(key)`, `cancel(key, currentGeneration): CancelAnswer` and `requestIdOf(key)`. The key is `{ tenant, principalKey, correlationKey }`; `principalKey` is the text of `McpConfig.principalKey`. `markSent` answers `cancelled` when a cancel came while the key was only reserved: the caller answers "not sent" and the key is ended. `markSent` on a key that is not reserved throws `TypeError`.
- `internal/gate.ts`: `admitWithoutEligibility(ports, access, ref): Promise<Outcome<AdmittedEndpoint, not-available-to-you | unknown>>` for the task operations that reuse a connection (SPEC S2), next to `admit(ports, access, ref)`. Only these two grant `AdmittedEndpoint`; `assertAdmitted(value)` throws `TypeError` for anything else, `ensure` included.

The convention: a function that needs a connection takes `AdmittedEndpoint`, so the gate is passed before the connection, by the type and at run time. The invoke order of the next wave is in [docs/flows.md](docs/flows.md).

## Configuration and operation

`McpConfig` has four required fields and no default (contract SPEC S3). The connection bound comes from the adoption's `connect-timeout` setting, or from the request's `connectBound` when the setting is absent (S4). `createMcpCore` takes an optional third argument `{ now }` for the clock that stamps the acquisition time of a listing; without it the local clock is read. Everything else comes from the five ports. The package keeps no durable state; the in-memory store lasts for one run.

## Verification

Run `pnpm turbo run build typecheck test --filter=@omne-harness/mcp`. The tests run on the contract's in-memory doubles and a scripted transport factory (`tests/doubles/`). They cover the two aggregates exhaustively, the six answers of the gate, every setting defect and connection failure of `ensure`, the publish boundary of `refresh` with concurrent and late results ordered by deferred promises, the status views, the close order and the conformance suite of the store. Three properties have a named mutation each that makes a test fail: the connection key carries the peer account, a credential handle is acquired once and released once, and a late listing is not published. SPEC.md lists what is not covered: no real transport, process, peer or durable store.

## Maintenance

A change to a service clause of the contract SPEC changes a module here, in the same name: S5 is `discovery.ts`, S7 is `status.ts`, S8 is `connections.ts` and `internal/table.ts`, S9 is `internal/table.ts`. A new transport kind adds a `GenerationPolicy` value and a branch in `internal/settings.ts`. The next wave adds `invoker` and `createMcp`; `createMcpCore` stays for hosts that do not need the call port. Consumers: `@omne-harness/mcp-host-local` (the ports and the transports) and the group design.

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
tests/                    Continuous tests; doubles/ holds the test doubles
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
