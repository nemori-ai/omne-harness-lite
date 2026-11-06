# @omne-harness/mcp-host-local

[中文](README_ZH.md)

The local host member of the MCP group: the two real implementations of the contract's `McpTransportFactory` and `McpTransport` (stdio, and Streamable HTTP with the legacy HTTP+SSE fallback), and the fetch of the authorization discovery; and, at the `./cordis` entry, the MCP Cordis plugin, which provides the three MCP services on one fiber.

## Responsibility and status

The root entry realizes the transport port of [`@omne-harness/mcp-contract`](../mcp-contract/README.md) on real process pipes and HTTP connections. The consumer of the root entry is [`@omne-harness/mcp`](../mcp/README.md): it opens a transport with `McpTransportFactory.open(material, signal)` and then calls `discover`, `listActions`, `call`, the task operations, `cancelRequest` and `close`. The transports of the root entry start no process, stop no process, read no settings and acquire no credential: the process comes from the landing, the credential handle comes with the material. The `./cordis` plugin loads `createMcp`, which reads adoption, eligibility, credentials and processes through the four ports; see [SPEC "Cordis 插件"](SPEC.md#cordis-plugin).

| Scope                                                                                                                                    | Status                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdio transport: line framing, lines that do not parse dropped, the line byte bound, the exit window, stderr drained, the T5 close order | Implemented; verified on scripted peers, SDK peers and `server-everything`                                                                                                                                                                                                                    |
| Streamable HTTP transport: JSON and SSE answers, no redirects, the re-send rule, authorization discovery, legacy sessions and S07        | Implemented; verified on scripted peers, the SDK bearer gate, SDK 2025 sessions and `server-everything`                                                                                                                                                                                       |
| Legacy HTTP+SSE fallback: the GET stream and the endpoint, as a mode of the HTTP line                                                    | Implemented; verified on scripted peers and `server-everything sse`                                                                                                                                                                                                                           |
| The contract's `mcpTransportConformance()`                                                                                               | Run on both materials; passed, not applicable and failed are counted apart, and the not-applicable cases with their reasons are in the [SPEC](SPEC.md#组合与验证)                                                                                                                             |
| Remote peers, TLS, proxies, real network failures                                                                                        | Not verified                                                                                                                                                                                                                                                                                  |
| The real composition with `@omne-harness/mcp`                                                                                            | `tests/e2e/` verifies it on five local targets (`server-everything` on three transports, `server-filesystem`, `mcp-server-fetch`). The [SPEC](SPEC.md#组合与验证) lists the scope and the gaps.                                                                                               |
| The `./cordis` Cordis plugin: the three services, the four ports read on each call or absent, the removal through `closeAll`             | Implemented; the journey is verified only on a scripted stdio peer; over HTTP only one refresh that fails before the request leaves is run, through a recording `fetch` double, and the plugin journey over HTTP is not run; not accepted. See the [SPEC](SPEC.md#cordis-plugin-verification) |
| Technical acceptance                                                                                                                     | Not yet; this is a candidate implementation                                                                                                                                                                                                                                                   |

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

Dependencies of the root entry: `@omne-harness/mcp-contract` (the ports and the protocol functions), `@omne-harness/json-text`, `@omne-harness/operation-result`, `eventsource-parser`. Runtime: Node >= 24 with a global `fetch` (an own one goes in through `options.fetch`). For the root entry, initialization is building the factory and disposal is each transport's `close()`. The package has no global state.

The `./cordis` entry has the MCP plugin for a Cordis host. `createMcpPlugin(parts)` takes the functions and local objects (`principalKey`, `checkOutput`, and optional `clock` and `fetch`); the plugin configuration holds the four bounds and `clientInfo`, all serializable and required. On load the plugin provides `mcpActionDiscovery`, `mcpActionInvoker` and `mcpEndpointStatus`; it reads the four demand ports from the context on each port call, and what it answers when a port is absent is in [SPEC "端口缺席"](SPEC.md#port-absent). On unload it awaits `connections.closeAll()`. It also depends on `@omne-harness/mcp`, `@omne-harness/mcp-cordis-contract`, `@omne-harness/kernel-basis` and `@deepseek-ai/cordis`. For the plugin, initialization is loading it with `ctx.plugin(createMcpPlugin(parts), config)` and disposal is `fiber.dispose()`. See [docs/cordis.md](docs/cordis.md).

```ts
import { createMcpPlugin } from '@omne-harness/mcp-host-local/cordis'
import { mcpActionDiscoveryKey } from '@omne-harness/mcp-cordis-contract/cordis'

const fiber = await ctx.plugin(createMcpPlugin({ principalKey, checkOutput }), {
  maxListingPages: 5,
  maxActions: 100,
  instructionsByteLimit: 4096,
  probeTimeoutMs: 2_000,
  clientInfo: { name: 'my-host', version: '1.0.0' },
})
const discovery = ctx.get(mcpActionDiscoveryKey) // the service, or undefined
await fiber.dispose() // closeAll closes every connection and asks the landing to stop the processes (MC-10)
```

## Contracts

The public types are in [src/index.ts](src/index.ts) (`createLocalTransportFactory`, `LocalTransportOptions`) and in [src/cordis.ts](src/cordis.ts) for the `./cordis` entry (`createMcpPlugin`, `McpPluginParts`, `McpPluginConfig`); the port types are the contract's `@omne-harness/mcp-contract/provider`, and no SDK type is exported. Behavior beyond the types is owned by [SPEC.md](SPEC.md): which contract clauses the transports honour, what the transports decide themselves, the H entries that say how, the reuse relation with the official SDK, the deviations from the protocol and the contract, and the behavior of the Cordis plugin. Invalid options throw `RangeError`; the transport methods answer `Outcome` and do not reject. An invalid plugin configuration fails the load: a shape error is a `ValidationError`, a value out of range is a `RangeError`. The owners of errors, lifecycle and resources of the transports are in the SPEC section on ownership; those of the plugin are in [SPEC "Cordis 插件"](SPEC.md#cordis-plugin).

## Design

One protocol session independent of the wire (`src/session.ts`) and two lines (`src/stdio-line.ts`, `src/http-line.ts`) make up the root entry. A line only moves bytes and reports what happened on the wire; the session turns that into the contract's wire events, classifies them with the contract's `classifyWireEvent`, and takes the conclusion of the T8 row from the contract's decision layer. Request composition, the withheld tools, the authorization discovery, the readers and the text of outgoing messages are the contract's root exports. The plugin (`src/cordis.ts`) is a layer of assembly over the transport factory: it builds `createMcp` on it and provides the three services. Modules and mechanisms: [docs/architecture.md](docs/architecture.md); flows: [docs/flows.md](docs/flows.md); objects: [docs/object-model.md](docs/object-model.md).

## Configuration and operation

The only configuration of the root entry is `LocalTransportOptions`: `clientInfo` (two non-empty texts), `probeTimeoutMs` (a positive integer, no default), and an optional `fetch`. The plugin of the `./cordis` entry has its own configuration `McpPluginConfig`: the four bounds and `clientInfo`, all required (see [SPEC](SPEC.md#cordis-plugin)). The package reads no environment variable and sets no network timeout of its own. The transports of the root entry write no log. The plugin writes one warning at unload for each endpoint whose process stop was `root-only` or `unconfirmed`, with the endpoint reference and the scope only; no credential value goes into any log. With the root entry, the caller owns the lifetime of the process behind a `ProcessHandle`, the acquisition and release of credential handles, and each transport's `close()`. In the plugin, `createMcp` acquires the credential handles and asks the landing for the processes through the ports, and `closeAll` at unload releases them (MC-10). On close, the package releases the readers and writers it holds, its timers and its in-flight `fetch` calls.

## Verification

```sh
pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local
pnpm exec vitest run --mode fast                                   # public-entry, session, lines (in-memory wires), cordis-entry (the plugin, no process)
pnpm exec vitest run --mode slow --typecheck.enabled=false         # conformance, stdio, http (child processes and local ports), cordis-journey (the plugin, scripted stdio peers)
```

The slow cases of `conformance`, `stdio`, `http` and `e2e` spawn child processes and local HTTP servers (random ports 20000–59999) and check after each case that none is left; `cordis-journey` spawns scripted stdio peers, unloads the plugin after each case and checks that no child process is left. The SPEC's SDK reuse table rests on the probes in `tests/probes/`; their questions and output excerpts are in [verification/proofs/sdk](verification/proofs/sdk/README.md). The properties of a request's life and the evidence for each: [SPEC, properties and evidence](SPEC.md#properties). What the tests cover and what they leave out: [SPEC, composition and verification](SPEC.md#组合与验证). Passing tests are not technical acceptance.

## Maintenance

The conclusions of T8, and the rules that both transports share (how a request is composed, the one re-send of a read request, how a cancel is sent, how a broken stream and a refused authorization settle, the exit window, the wire limits), come from the contract's root exports. When one of these rules changes, `src/session.ts` calls the new export. A new row of `TRANSPORT_TABLE` is covered by `tests/session.spec.ts` automatically. The line port `src/line.ts` is internal; changing it means changing both lines and the in-memory line double. On an SDK upgrade, re-run the probes in `tests/probes/`, re-check the `file:line` evidence of the SPEC's reuse table, and check the API of the B-layer fixtures. When the contract clauses S1, S2, S8, R6, AV6, UE5, CU6, PL4 or the `@omne-harness/mcp` clauses MC-5, MC-10 change, or when Cordis is upgraded, re-check [SPEC "Cordis 插件"](SPEC.md#cordis-plugin) and rerun `tests/cordis-entry.spec.ts` and `tests/cordis-journey.spec.ts`. Consumers: `@omne-harness/mcp` (through the contract port), Cordis assemblies that load the plugin (no application assembly does yet), and the group design.

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
tests/                    Continuous tests; fixtures/ holds the peer fixtures, probes/ the SDK probes, model/ the bounded explorer and its negative controls
schema/                   External schemas (none in this package)
verification/             Continuous verification resources; models/ holds the TLA+ model, proofs/sdk/ the SDK reuse argument
adr/                      Implementation decisions with continuing consumers (none)
examples/                 Examples against the public entry (none)
resources/                Non-source runtime resources (none)
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
