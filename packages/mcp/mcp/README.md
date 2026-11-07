# @omne-harness/mcp

[中文](README_ZH.md)

The general MCP implementation: the core services of the MCP group on the five requirement ports of `@omne-harness/mcp-contract`, and the production in-memory catalog store.

## Responsibility and status

This package implements the five application services of the contract: the category port `inspection`, the read port `discovery`, the call port `invoker`, and the two status port services `status` and `connections`. They share one connection table, one in-flight table and one task table. The table builds a connection from the ports (credential handle, process landing, transport factory), keeps its state in the `Connection` aggregate, and closes it in the order of the group design.

Status: the connection table, refresh, the read ports and the call port are implemented, on the accepted contract. The behavior is in [SPEC.md](SPEC.md), which cites the contract clauses and adds the decisions this package makes. The group design is [the group engineering design](../docs/architecture.md).

| Part                                                                           | State                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `createMcp`: `inspection`, `discovery`, `invoker`, `status`, `connections`     | Implemented. Tested on the contract's in-memory doubles and scripted transports              |
| `createInMemoryCatalogStore`                                                   | Implemented. Passes the contract's `CatalogStore` suite; CS8 does not apply                  |
| `Connection` and `InFlightCalls` aggregates, the gate, the tables              | Implemented as internal modules                                                              |
| Listing tolerance (one invalid tool dropped and reported)                      | None. Contract C1 rejects the whole page when one item is invalid                            |
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
- Errors, lifecycle and resources: a refusal or a connection failure is an `Outcome` failure. A broken precondition is a thrown `TypeError` or `RangeError`. The connection table owns the transport, the process handle and the credential handle of each connection. The rules for errors, shutdown and resource release are in the clauses [MC-10](SPEC.md#mc-10) and [MC-14](SPEC.md#mc-14), and in the SPEC section [Ownership, failure and lifecycle](SPEC.md#所有权失败与生命周期).

## Design

The modules, the state and resource ownership, and the reasons for them are in [docs/architecture.md](docs/architecture.md). The flows are in [docs/flows.md](docs/flows.md), and the object model is in [docs/object-model.md](docs/object-model.md).

### The call port

The call port is in `src/calls.ts` and `src/tasks.ts`, on the gate, the connection table, the in-flight table and the task table. Its order, its mapping of connection failures to "not sent", the wiring of a cancel and the rules of the task operations are SPEC [MC-16](SPEC.md#mc-16) and [MC-17](SPEC.md#mc-17); the in-flight table is [MC-12](SPEC.md#mc-12). The flow is drawn in [docs/flows.md](docs/flows.md).

## Configuration and operation

`McpConfig` has four required fields and no default. The rules are in contract SPEC [S3](../mcp-contract/SPEC.md#services) and S4. `McpPorts.clock` is optional, and `McpPorts.checkOutput` is required. The package has no departure from the contract. [SPEC.md](SPEC.md#deviations) records this. Everything else comes from the ports. The package keeps no durable state. The in-memory store, the in-flight table and the task table last for one run.

## Verification

Run `pnpm turbo run build typecheck test --filter=@omne-harness/mcp`. The tests run on the contract's in-memory doubles and on two scripted transports (`tests/doubles/`). They use no real transport, process, peer or durable store. What the tests cover, the properties, the models and the mutations are in [SPEC.md](SPEC.md#properties) and [verification/README.md](verification/README.md).

## Maintenance

A change to a service clause of the contract SPEC changes a module here. The modules and the clauses they fulfil are in [docs/architecture.md](docs/architecture.md). Consumers: `@omne-harness/mcp-host-local` (the ports and the transports) and the group design.

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
