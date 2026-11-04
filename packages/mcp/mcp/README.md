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

Modules: `config`, `inspection`, `discovery`, `status`, `connections`, `store/memory`, and the internal `internal/connection` (aggregate), `internal/in-flight` (aggregate), `internal/gate` (the one S1 decision and the two tokens), `internal/guard` (the gate at a use and at a publish boundary), `internal/table` (the connection table: orchestration only), `internal/entry` (one entry's resources, the views, the predicates and the moves of a resource), `internal/teardown` (the one close order), `internal/late` (what a port hands over after the bound), `internal/build` (the build under the connection bound, the wrap-up of a lost connection, and the shutdown checks), `internal/turns` (one run at a time per holding), `internal/settings`, `internal/abort` (the bound, and `answerOf` for a port that rejects), `internal/text`, `internal/canonical`. See [docs/architecture.md](docs/architecture.md), [docs/flows.md](docs/flows.md) and [docs/object-model.md](docs/object-model.md).

How SPEC MC-14 is kept:

- The close order has one entry point, `teardown(entry)` in `internal/teardown.ts`. It answers the confirmed range, and a teardown asked while one is in flight joins it (`Entry.tearing`).
- Each step absorbs the breach of its port where it calls it, through `answerOf` in `internal/abort.ts`: `closeTransport`, `stopOne` (one process; `stopProcesses` asks every one in turn) and `releaseHeld`. No step rejects on a port, so every step runs and every process is asked. There is no catch around the close order: an error of this package rejects the teardown.
- A step clears its field after its port answered, so `holdsNothing` stays false while the step waits.
- `internal/entry.ts` keeps the predicates and the moves. `holdsNothing(held)` is true when none of the five resources is held. `forgettable(entry)` is `closed` and `holdsNothing`, and `forget` in `internal/table.ts` deletes an entry only through it. A credential handle is in the entry or in one landing (`handOverToLanding`, `landingAnswered`). A process handle is in `process` or in `lingering` (`recordStop`, `adoptLingering`).
- At the shutdown, `closeAll` starts `abandonLandings` for every entry before it closes the entries with `Promise.all`. A landing that outlives its bound after the shutdown began has its handle released by the build at once (`releaseLanding`).

### For the next wave

The invoker attaches to the internal modules below. The convention: a function that needs a connection takes `AdmittedEndpoint`, which only the gate grants; the services never write the `Connection` aggregate themselves, they report to the table.

- `internal/guard.ts`, the gate the services walk through: `admitForUse(gate, access, ref): Promise<Outcome<AdmittedEndpoint, GateRefusal>>` with `gate = { ports, table }`. It composes on `admit` (adoption first, then eligibility, SPEC MC-2) and closes the endpoint's connection when the endpoint is withdrawn or blocked by a setting (invariant 6, endpoint-level); `not-eligible` and `unknown` close nothing. `stillAdmitted(gate, access, ref, revision): Promise<Outcome<'admitted' | 'superseded', GateRefusal>>` is the same gate at a publish boundary: `superseded` when the adoption revision is no longer `revision`.
- `internal/gate.ts`: `admit(ports, access, ref): Promise<GateDecision>` (the one S1 decision, with `refusalOf(decision)` for the R1 refusal) and `admitWithoutEligibility(ports, access, ref): Promise<Outcome<AdoptedOnly, not-available-to-you | unknown>>` for the task operations that reuse a connection (SPEC S2). `AdoptedOnly` carries the parsed `definition`; `AdmittedEndpoint` is `AdoptedOnly` plus eligibility. Both are made only inside the gate from the adoption port's answer: `judge(ports, access, token)` throws `TypeError` for a token it did not make (a copy with another definition included), and `assertAdmitted(value)` throws `TypeError` for anything not admitted, `ensure` included.
- `internal/table.ts`: `ensure(admitted: AdmittedEndpoint, access: Access<P>, options?: { connectBound?: Millis }): Promise<Outcome<Ensured, EnsureFailure>>`. `Ensured` is a snapshot of the moment `ensure` answered: `{ transport, generation, connection, peer, catalogKey, adoptionRevision, bound }`, where `connection` is the read-only view `{ generation, isCurrent(generation) }`. `EnsureFailure` is `{ stage: 'settings', reason }` (nothing marked: an S4 refusal, K1's `credential-unavailable(missing)`, the adoption read again — `not-available-to-you` when it is withdrawn, `unknown` when it cannot be read, rejects, or the token's revision is not the current one — or `connection-unavailable` when that re-read, or the wait of the critical section for a close or a teardown, did not end within this call's connection bound, or when the table was shut by `closeAll` before or during the build) or `{ stage: 'connect', reason: ConnectionFailure | EffectUnknown, catalog }`. `catalog` says what marking the catalog did: `marked` (written), `revision-conflict` (a newer adoption exists), `unavailable` (the store could not be read or written), `not-acquired` (no catalog yet). The marks of `markUnavailable` (`UnavailableMark`) are `connection-unavailable`, `authorization-required`, `credential-unavailable`, `landing-unavailable`. A request on an established connection reports back with `settle(connection, generation, 'page-failed' | 'listed')` and `lose(connection, generation, reason, mark): Promise<CatalogMark | 'not-current'>`; a generation that is not current any more changes nothing. `lose` refuses requests at once and shares the entry's one teardown (`internal/teardown.ts`: transport, processes, handle; every step runs and every process is asked, a port that rejects is absorbed as SPEC MC-14 says) with `close`. A release during it waits for it; an ensure during it waits at most to its own connection bound and then answers `connection-unavailable`. A process that lands after the bound is stopped on arrival; what its stop did not confirm appears as `residual`, and the process credential handle is released after that stop. An entry leaves the table only when `forgettable` (`internal/entry.ts`): closed, and no transport, process, handle, lingering process or landing in flight. The caller's abort signal does not go into `ensure`: the build is shared by every caller of the key and bounded by the connection bound, which starts at the credential and covers the process start, the open and the negotiation; the re-read of the critical section and its wait for a close or a teardown are bounded by the calling `ensure`'s own bound. Also `current(key)`, `stateOf(tenant, holding)`, `close(tenant, holding)` and `closeAll()`. `close` and `closeAll` report `unconfirmed` while a landing of the connection is still in flight; `closeAll` shuts the table (every later `ensure` answers `connection-unavailable`, and a build under way stops at its next step), releases the handles of the landings still in flight at once, then closes every entry at once and waits for every teardown (SPEC MC-14). A host bounds `closeAll` with its own deadline: a close-order port that never answers holds it (SPEC "known limitations").
- The connection key: `prepareSettings(adopted, connectBound)` in `internal/settings.ts` gives the `account` (through `peerAccountOf`) and the bound for an operation that connects; `readAccountOf(adopted)` gives the account for one that does not (`current`, `peer`). `connectionKeyOf(tenant, endpoint, account)` and `catalogKeyOf` are the contract's; `internal/text.ts` gives their canonical texts.
- `internal/in-flight.ts`: `class InFlightCalls` with `reserve(key): 'reserved' | 'in-use'`, `markSent(key, requestId, generation): 'sent' | 'cancelled'`, `markEnded(key)`, `release(key)`, `cancel(key, currentGeneration): CancelAnswer` and `requestIdOf(key)`. The key is `{ tenant, principalKey, correlationKey }`; `principalKey` is the text of `McpConfig.principalKey`. `markSent` answers `cancelled` when a cancel came while the key was only reserved: the caller answers "not sent" and the key is ended. `markSent` on a key that is not reserved throws `TypeError`.

The invoke order of the next wave is in [docs/flows.md](docs/flows.md).

## Configuration and operation

`McpConfig` has four required fields and no default (contract SPEC S3). The connection bound comes from the adoption's `connect-timeout` setting, or from the request's `connectBound` when the setting is absent (S4). `createMcpCore` takes an optional third argument `{ now }` for the clock that stamps the acquisition time of a listing; without it the local clock is read. The three departures from the wave's decisions (the refresh `signal`, `{ now }`, the copied JSON canonicalization) and their exit conditions are in SPEC.md. Everything else comes from the five ports. The package keeps no durable state; the in-memory store lasts for one run.

## Verification

Run `pnpm turbo run build typecheck test --filter=@omne-harness/mcp`. The tests run on the contract's in-memory doubles and a scripted transport factory (`tests/doubles/`). They cover the two aggregates exhaustively, the six answers of the gate the services walk through, every setting defect and connection failure of `ensure`, the publish boundary of `refresh` with concurrent and late results ordered by deferred promises, the interleavings of `tests/races.spec.ts` (a late page from an earlier generation, a close against a build, a port that never answers or throws, an abort during the build or the listing, a re-read of the critical section that never answers), the status views, the close order, the teardown under every combination of a `close()`, `stop()` or `release()` that rejects and with one process of several whose stop rejects (`tests/teardown.spec.ts`, on the `tests/doubles/faults.ts` ports), the forget condition (`tests/entry.spec.ts`), the shutdown against another entry's close and against a build under way (`tests/shutdown.spec.ts`), the read ports that reject (`tests/port-breach.spec.ts`) and the conformance suite of the store. Named mutations make a test fail for each of these properties: the connection key carries the peer account, a credential handle is acquired once and released once, a late listing is not published, every teardown step runs when an earlier one rejects, every process is asked to stop, an entry holding a landing in flight is not forgotten, `closeAll` releases the handles of the landings in flight first, and a build stops when the table shuts. SPEC.md lists what is not covered: no real transport, process, peer or durable store.

## Maintenance

A change to a service clause of the contract SPEC changes a module here, in the same name: S5 is `discovery.ts`, S7 is `status.ts`, S8 is `connections.ts` and `internal/table.ts`, S9 is `internal/teardown.ts`, `internal/late.ts` and `internal/build.ts`. A new transport kind adds a `GenerationPolicy` value and a branch in `internal/settings.ts`. The next wave adds `invoker` and `createMcp`; `createMcpCore` stays for hosts that do not need the call port. Consumers: `@omne-harness/mcp-host-local` (the ports and the transports) and the group design.

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
