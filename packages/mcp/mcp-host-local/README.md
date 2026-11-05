# @omne-harness/mcp-host-local

[中文](README_ZH.md)

The local host member of the MCP group: the two real implementations of the contract's `McpTransportFactory` and `McpTransport` (stdio, and Streamable HTTP with the legacy HTTP+SSE fallback), and the fetch of the authorization discovery.

## Responsibility and status

This package realizes the transport port of [`@omne-harness/mcp-contract`](../mcp-contract/README.md) on real process pipes and HTTP connections. Its consumer is [`@omne-harness/mcp`](../mcp/README.md): it opens a transport with `McpTransportFactory.open(material, signal)` and then calls `discover`, `listActions`, `call`, the task operations, `cancelRequest` and `close`. This package starts no process, stops no process, reads no settings and acquires no credential: the process comes from the landing, the credential handle comes with the material.

| Scope                                                                                                                             | Status                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdio transport: line framing, unreadable lines dropped, the line byte bound, the exit window, stderr drained, the T5 close order | Implemented; verified on scripted peers, SDK peers and `server-everything`                                                                                        |
| Streamable HTTP transport: JSON and SSE answers, no redirects, the re-send rule, authorization discovery, legacy sessions and S07 | Implemented; verified on scripted peers, the SDK bearer gate, SDK 2025 sessions and `server-everything`                                                           |
| Legacy HTTP+SSE fallback: the GET stream and the endpoint, as a mode of the HTTP line                                             | Implemented; verified on scripted peers and `server-everything sse`                                                                                               |
| The contract's `mcpTransportConformance()`                                                                                        | Run on both materials; passed, not applicable and failed are counted apart, and the not-applicable cases with their reasons are in the [SPEC](SPEC.md#组合与验证) |
| Remote peers, TLS, proxies, real network failures; the real composition with `@omne-harness/mcp`                                  | Not verified; owned by `w3-mcp-e2e` and the integration tasks                                                                                                     |
| Technical acceptance                                                                                                              | Not yet; this is a candidate implementation                                                                                                                       |

## Usage

```ts
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'

const factory = createLocalTransportFactory({
  clientInfo: { name: 'my-host', version: '1.0.0' },
  probeTimeoutMs: 2_000, // how long server/discover waits on stdio
})

// The material comes from the caller: a ProcessHandle from the landing on stdio, the connection
// target and an optional credential handle on Streamable HTTP.
const opened = await factory.open(material, signal)
if ('failure' in opened) throw new Error(opened.failure.kind)
const transport = opened.ok
const identity = await transport.discover()
// … listActions, call, getTask, updateTask, getTaskResult, cancelTask, cancelRequest
await transport.close() // closes the transport; the holder of the process stops it
```

Dependencies: `@omne-harness/mcp-contract` (the ports and the protocol functions), `@omne-harness/json-text`, `@omne-harness/operation-result`, `eventsource-parser`. Runtime: Node >= 24 with a global `fetch` (an own one goes in through `options.fetch`). The package is a `module` variant with no Cordis binding, see [docs/cordis.md](docs/cordis.md). Initialization is building the factory; disposal is each transport's `close()`; there is no global state.

## Contracts

The public types are in [src/index.ts](src/index.ts) (`createLocalTransportFactory`, `LocalTransportOptions`); the port types are the contract's `@omne-harness/mcp-contract/provider`, and no SDK type is exported. Behavior beyond the types is owned by [SPEC.md](SPEC.md): which contract clauses this package honours, what this package decides itself, the H entries that say how, the reuse relation with the official SDK, and the deviations from the protocol and the contract. Invalid options throw `RangeError`; the transport methods answer `Outcome` and do not reject. The owners of errors, lifecycle and resources are in the SPEC section on ownership.

## Design

One protocol session independent of the wire (`src/session.ts`) and two lines (`src/stdio-line.ts`, `src/http-line.ts`). A line only moves bytes and reports what happened on the wire; the session turns that into the contract's wire events, classifies them with the contract's `classifyWireEvent`, and takes the conclusion of the T8 row from the contract's decision layer. Request composition, the withheld tools, the authorization discovery, the readers and the text of outgoing messages are the contract's root exports. Modules and mechanisms: [docs/architecture.md](docs/architecture.md); flows: [docs/flows.md](docs/flows.md); objects: [docs/object-model.md](docs/object-model.md).

## Configuration and operation

The only configuration is `LocalTransportOptions`: `clientInfo` (two non-empty texts), `probeTimeoutMs` (a positive integer, no default), and an optional `fetch`. The package reads no environment variable, writes no log and sets no network timeout of its own. The caller owns the lifetime of the process behind a `ProcessHandle`, the acquisition and release of credential handles, and each transport's `close()`. The package releases, on close, the readers and writers it holds, its timers and its in-flight `fetch` calls.

## Verification

```sh
pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local
pnpm exec vitest run --mode fast                                   # public-entry, session, lines (in-memory wires)
pnpm exec vitest run --mode slow --typecheck.enabled=false         # conformance, stdio, http (child processes and local ports)
```

The slow tier spawns child processes and local HTTP servers (random ports 20000–59999) and checks after each case that none is left. The SPEC's SDK reuse table rests on the probes in `tests/probes/`; their questions and output excerpts are in [verification/proofs/sdk](verification/proofs/sdk/README.md). Properties, premises and what is not covered: [SPEC, composition and verification](SPEC.md#组合与验证). Passing tests are not technical acceptance.

## Maintenance

The conclusions of T8 come from the contract's decision layer; when T3, T5 or T9 change how a request is sent, cancelled or closed, `src/session.ts` changes with them. A new row of `TRANSPORT_TABLE` is covered by `tests/session.spec.ts` automatically. The line port `src/line.ts` is internal; changing it means changing both lines and the in-memory line double. On an SDK upgrade, re-run the probes in `tests/probes/`, re-check the `file:line` evidence of the SPEC's reuse table, and check the API of the B-layer fixtures. Consumers: `@omne-harness/mcp` (through the contract port) and the group design.

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
tests/                    Continuous tests; fixtures/ holds the peer fixtures, probes/ the SDK probes
schema/                   External schemas (none in this package)
verification/             Continuous verification resources; proofs/sdk/ holds the SDK reuse argument
adr/                      Implementation decisions with continuing consumers (none)
examples/                 Examples against the public entry (none)
resources/                Non-source runtime resources (none)
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
