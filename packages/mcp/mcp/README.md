# @omne-harness/mcp

[中文](README_ZH.md)

The general MCP implementation: the core services of the MCP group on the five requirement ports of `@omne-harness/mcp-contract`, and the production in-memory catalog store.

## Responsibility and status

This package implements the five application services of the contract: the category port `inspection`, the read port `discovery`, the call port `invoker`, the status port `status` and the connections port `connections`. They share one connection table, one in-flight table and one task table. The table builds a connection from the ports (credential handle, process landing, transport factory), keeps its state in the `Connection` aggregate, and closes it in the order of the group design.

Status: core implementation of W2, with the connection table lifecycle revised and the call port added in W3, on the candidate contract. The behavior is in [SPEC.md](SPEC.md), which cites the contract clauses and adds the decisions this package makes. The group design is [the group engineering design](../docs/architecture.md).

| Part                                                                           | State                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `createMcp`: `inspection`, `discovery`, `invoker`, `status`, `connections`     | Implemented. Tested on the contract's in-memory doubles and scripted transports              |
| `createInMemoryCatalogStore`                                                   | Implemented. Passes the contract's `CatalogStore` suite; CS8 does not apply                  |
| `Connection` and `InFlightCalls` aggregates, the gate, the tables              | Implemented as internal modules                                                              |
| Listing tolerance (one invalid tool dropped and reported)                      | Not here yet; a later closure changes contract C1 for it                                     |
| Real transports, the official SDK, real peers, real processes, durable storage | Not here. `@omne-harness/mcp-host-local` provides them; nothing here is verified on them     |
| `list_changed` subscriptions, reconnection in the background                   | Not implemented. `changedNotified` stays false; a lost connection is rebuilt at the next use |

## Usage

The package has one entry. A host builds the ports and the configuration, then the services:

```ts
import { createInMemoryCatalogStore, createMcp } from '@omne-harness/mcp'

const mcp = createMcp(
  {
    adoption,
    eligibility,
    credentials,
    landing,
    store: createInMemoryCatalogStore(),
    transports,
    checkOutput, // the host's JSON Schema validator, as an OutputValidator
  },
  {
    principalKey: principal => principal.id,
    maxListingPages: 4,
    maxActions: 200,
    instructionsByteLimit: 4096,
  },
)

const refreshed = await mcp.discovery.refresh(access, { ref })
if ('ok' in refreshed && refreshed.ok.kind === 'published') report(refreshed.ok.revision)

const result = await mcp.invoker.invoke(access, {
  ref,
  action,
  args,
  expectedDefinition, // the digest the caller read from discovery.current
  correlationKey,
  signal,
})
if (result.kind === 'sent') consume(result.outcome)

// At exit. It reports only the stop ranges that were confirmed.
const closed = await mcp.connections.closeAll()
```

Nothing connects until a `refresh`, an `invoke` or a task operation needs a connection and none is usable. A task operation looks for a connection on the peer account of its task first (SPEC [MC-17](SPEC.md#mc-17) step 3). A `continueWithInput` goes only on the connection of the generation it was issued at. It builds no connection to prove that, and it sends on no later generation (SPEC [MC-16](SPEC.md#mc-16) steps 6 and 7). `current`, `peer`, `inspect`, `list` and `cancel` never connect. The host that holds the instance calls `closeAll()` at exit. An unlawful configuration throws `RangeError` at construction. `clock` is the one optional port: without it the host clock stamps the listings. The package does not need Cordis; see [docs/context.md](docs/context.md).

## Contracts

- Public types and runtime checks: [src/](src/README.md), indexed in [docs/public-api.md](docs/public-api.md).
- Behavior beyond the types: [SPEC.md](SPEC.md). It cites the clauses of the [contract SPEC](../mcp-contract/SPEC.md) that this package fulfils (its basis table lists them) and lists the decisions of its own.
- Errors, lifecycle and resources: a refusal or a connection failure is an `Outcome` failure; a broken precondition (an unlawful transition, a forged gate token, a configuration that is not an object) is a thrown `TypeError` or `RangeError`. An error of this package in work that no caller waits for is kept by the table's task scope, and `closeAll` rejects with it in one `AggregateError`; after `closeAll`, such an error is thrown as an uncaught exception. The connection table owns the transport, the process handle and the credential handle of each connection and releases them in the close order.

## Design

Modules: `config`, `inspection`, `discovery`, `invoker` (`calls`: `invoke`, `continueWithInput`, `cancel`; `tasks`: the four task operations), `status`, `connections`, `store/memory`, and the internal `internal/assembly` (the one assembly of the tables and the services), `internal/connection` (aggregate), `internal/in-flight` (aggregate: the place of a call, its stop signal), `internal/task-table` (the tasks of this run), `internal/lost` (what a transport answer means for the connection state), `internal/gate` (the one S1 decision and the two tokens), `internal/guard` (the gate at a use and at a publish boundary), `internal/table` (the connection table: orchestration only), `internal/entry` (one entry's resources, the views, the predicates and the moves of a resource), `internal/teardown` (the one close order), `internal/late` (what a port hands over after the bound), `internal/build` (the build under the connection bound, the wrap-up of a lost connection, and the shutdown checks), `internal/turns` (one run at a time per holding), `internal/settings`, `internal/port` (`ask`, the one port adapter; `waitAtMost` and `within`, the bounded waits), `internal/scope` (the task scope of the connection table, handed out as a spawn-only view), `internal/text`. See [docs/architecture.md](docs/architecture.md), [docs/flows.md](docs/flows.md) and [docs/object-model.md](docs/object-model.md).

How SPEC MC-14 is kept:

- The close order has one entry point, `teardown(entry)` in `internal/teardown.ts`. It answers the confirmed range, and a teardown asked while one is in flight joins it (`Entry.tearing`).
- Each step asks its port through `ask` in `internal/port.ts`, which reads a throw when the port is called and a rejection as the port's breach answer (SPEC MC-15): `closeTransport`, `stopOne` (one process; `stopProcesses` asks every one in turn) and `releaseHeld`. No step rejects on a port, so every step runs and every process is asked. There is no catch around the close order: an error of this package rejects the teardown.
- A step clears its field after its port answered, so `holdsNothing` stays false while the step waits.
- `internal/entry.ts` keeps the predicates and the moves. `holdsNothing(held)` is true when none of the five resources is held. `forgettable(entry)` is `closed` and `holdsNothing`, and `forget` in `internal/table.ts` deletes an entry only through it. A credential handle is in the entry or in one landing (`handOverToLanding`, `landingAnswered`). A process handle is in `process` or in `lingering` (`recordStop`, `adoptLingering`).
- At the shutdown, `closeAll` starts `abandonLandings` for every entry before it closes the entries, waits for both to settle, then takes the errors of this package that the table's task scope recorded and exits the scope. It rejects with those errors, and with any error of this package from abandoning a landing or closing an entry, as one `AggregateError` (the other entries are still closed), and a second `closeAll` does not throw them again. An error that appears in the scope after the exit goes to the scope's outlet. By default the outlet throws it as an uncaught exception; a test can give the table its own outlet. `abandonLandings` releases the handle of a landing still in flight only. A landing is in flight from its start, so a landing within its bound counts. Once a landing handed over its process, its handle waits for that process's stop (S9). A landing whose bound fires after the shutdown began holds no handle any more: `abandonLandings` released it.
- What a bounded wait stops waiting for goes on in the table's task scope when the waiter owns it (`within` in `internal/port.ts`): the wrap-up of a failed build past its bound, and the close of what a port hands over late. A waiter that only joins another's work (`waitAtMost`) stops looking and leaves the work to its owner. The table creates its own scope and hands out a spawn-only view; `closeAll` alone exits it. The table gets its bounds from one source (`TableRuntime.startBound`, by default `AbortSignal.timeout`). The tests inject bounds that they fire one by one (`tests/doubles/bounds.ts`); the explorer injects its own (`tests/model/explore.ts`).

### The call port

The call port is in `src/calls.ts` and `src/tasks.ts`, on the gate, the connection table, the in-flight table and the task table. Its order, its mapping of connection failures to "not sent", the wiring of a cancel and the rules of the task operations are SPEC [MC-16](SPEC.md#mc-16) and [MC-17](SPEC.md#mc-17); the in-flight table is [MC-12](SPEC.md#mc-12). The flow is drawn in [docs/flows.md](docs/flows.md).

## Configuration and operation

`McpConfig` has four required fields and no default (contract SPEC S3). The connection bound comes from the adoption's `connect-timeout` setting, or from the request's `connectBound` when the setting is absent (S4). The clock that stamps the acquisition time of a listing is `McpPorts.clock`; without it the host clock is read. The output validator is `McpPorts.checkOutput`, required. The departures from the contract, with their exit conditions, are in SPEC.md. Everything else comes from the ports. The package keeps no durable state; the in-memory store, the in-flight table and the task table last for one run.

## Verification

Run `pnpm turbo run build typecheck test --filter=@omne-harness/mcp`. The tests run on the contract's in-memory doubles and two scripted transports (`tests/doubles/`): the member's, which scripts what the transport object does, for the connection table; the contract's `createScriptedTransportFactory`, which scripts what the peer says, for the call port (`tests/invoke.spec.ts`, `tests/cancel.spec.ts`, `tests/continue.spec.ts`, `tests/tasks.spec.ts`). They cover the two aggregates exhaustively, the six answers of the gate the services walk through, every setting defect and connection failure of `ensure`, the publish boundary of `refresh` with concurrent and late results ordered by deferred promises, the interleavings of `tests/races.spec.ts` (a late page from an earlier generation, a close against a build, a port that never answers or throws, an abort during the build or the listing, a re-read of the critical section that never answers, a call queued behind or joined to one that hangs, with bounds that the test fires one by one), the status views, the close order, the teardown under every combination of a `close()`, `stop()` or `release()` that rejects and with one process of several whose stop rejects (`tests/teardown.spec.ts`, on the `tests/doubles/faults.ts` ports), the forget condition (`tests/entry.spec.ts`), the shutdown against another entry's close and against a build under way (`tests/shutdown.spec.ts`), the ports that reject or throw when they are called (`tests/port-breach.spec.ts`), the task scope (`tests/port.spec.ts`) and the conformance suite of the store. Named mutations make a test fail for each of these properties: each step of the send order refuses and concludes the key as SPEC MC-12 says, each row of the mapping of connection failures, the in-flight and task tables keyed by tenant and principal, the task bound to its peer account, the connection key carries the peer account, a credential handle is acquired once and released once, a late listing is not published, every teardown step runs when an earlier one rejects, every process is asked to stop, an entry holding a landing in flight is not forgotten, `closeAll` releases the handles of the landings in flight first, a build stops when the table shuts, a build that fails after the shutdown began marks nothing, each `ensure` answers at its own bounds, and the errors of the task scope reach `closeAll` or the outlet of the scope. SPEC.md lists what is not covered: no real transport, process, peer or durable store. The properties of the connection table and of the call port also have two TLA+ models checked with TLC and a bounded exhaustive explorer that drives the real code (`tests/model/`). [SPEC.md, "性质与证据"](SPEC.md#properties) states the properties and what each kind of evidence shows for each. [verification/README.md](verification/README.md) gives the scope, the mapping to the code, and the negative controls and mutations that make each property fail.

## Maintenance

A change to a service clause of the contract SPEC changes a module here, in the same name: S2 is `calls.ts`, `tasks.ts`, `internal/in-flight.ts` and `internal/task-table.ts`, S5 is `discovery.ts`, S7 is `status.ts` and `internal/lost.ts`, S8 is `connections.ts` and `internal/table.ts`, S9 is `internal/teardown.ts`, `internal/late.ts` and `internal/build.ts`. A new transport kind adds a `GenerationPolicy` value and a branch in `internal/settings.ts`. Consumers: `@omne-harness/mcp-host-local` (the ports and the transports) and the group design.

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
