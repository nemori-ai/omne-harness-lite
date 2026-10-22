# @omne-harness/pi-ai-transport

[中文](README_ZH.md)

## Responsibility and status

This member is the shared pi transport of the Model group. It keeps the pi fork and the common HTTP/SSE, cancellation and connection resources in one place, so that families do not copy these mechanisms. The responsibility and the member conditions are in the [group architecture, "成员与新增条件"](../docs/architecture.md#成员与新增条件).

The package delivers three parts now:

- The root entry exports the three-phase transport: the factory `createPiTransport` and its configuration types. The `ModelTransport` that the factory returns implements `prepare → materialize → start`.
- The root entry exports the five accepted family contribution interface types.
- Package-internal transport mechanisms: connection capacity, an HTTPS exchange that starts synchronously, SSE framing, protocol frames, network resources and diagnostic isolation. The network resources can use an HTTPS proxy. No entry exports them. The three-phase transport combines them.

This package has no real family yet: the continuous tests use a test family only. No entry exports the factory of the network resources, so an assembly outside this package cannot build `PiTransportConfig.network` yet. Design, implementation and run-time verification are separate judgments.

### Support scope

The support scope has six tiers. Each tier states only checked facts: what the tests check and what they do not check. A commit that changes the support scope also updates this table, the [SPEC](SPEC.md) and the status on the group pages. All continuous evidence comes from one process, a local HTTPS server, a local CONNECT proxy and a test family. For a real proxy and a real supplier, the only evidence is a manual run of `test:live`. No evidence comes from a consumer outside this package.

| Tier | Delivered content | Entry | Verification scope |
| --- | --- | --- | --- |
| Public types exported | `PiProtocolFrame`, `PiResponseDecoder`, `PiMaterializedMedia`, `PiFamilyBinding` and `PiFamilyContributions`. Their shapes copy the accepted code block of the group architecture | Root entry, types only | `public-entry.spec.ts` checks that the family types copy the group architecture. `public-entry.spec-d.ts` checks the types with compile-time cases. Only the test family uses these types |
| Three-phase transport implemented | `createPiTransport`: configuration checks, a route lookup by recipient, and a family binding from the family contributions. Materialize reserves a slot in FIFO order, refuses a content reference that the model sees, encodes through the family, and fixes the bytes and a SHA-256 receipt. A failure returns the slot. Start reads the credential and sends one request inside the synchronous call. Without a credential, start sends nothing and the stream ends failed with `credential`. The fact stream goes through SSE, protocol frames and the family decoder, and ends with exactly one `ended`. The SPEC table maps each failure. A cancel or a close ends the stream `interrupted` after the physical stop. A second materialize returns `invalid`, and a second start returns an empty stream | Root entry `createPiTransport`. Package-internal `src/transport.ts`, `src/materialized.ts`, `src/fact-stream.ts`, `src/termination.ts`, `src/payload.ts` and `src/config.ts` | Fast tests with an in-memory test family. Slow tests against a real local HTTPS server cover each row of the failure table, the capacity wait and its cancel, and the closes. They also run the six transport obligations of the model-contract conformance suite with the scripted provider. No real family, real credential or Model send path |
| Capacity and diagnostic isolation implemented | Connection capacity: FIFO grants, cancellation, close, reservations that do not expire, one consume per reservation, and after the consume only the seat returns the slot. Diagnostic isolation: events carry the kind and the level only, and a fault of the observer only changes the counters | Package-internal `src/capacity.ts` and `src/diagnostics.ts`. No entry exports them | Fast unit tests with a real `AbortController`. No consumer outside this package |
| SSE framing and protocol frames implemented | Bytes to SSE event data text: UTF-8 and line breaks at any chunk cut, a per-event byte limit and four failure reasons. Data text to protocol frames: the end-marker is a separate frame, and the JSON reader keeps every value. The end of the stream is never a terminal frame | Package-internal `src/sse.ts` (adapted from pi) and `src/frames.ts` | Fast unit tests with real byte streams and Node readable streams. No stream from a real supplier |
| HTTPS exchange and network resources implemented | One POST that starts synchronously, with no retry and no redirect. Four results, a closed set of refusal reasons and three error body states. Only a reservation of the same resources can start an exchange. A stop wins until the physical close, and the slot returns after the physical close. A reader that ends the body early, even before its first read, closes the response. The reader tells a local stop (`ResponseBodyStoppedError`) from a loss of the connection (`ResponseBodyReadError`). A connect timeout from the start until the request has a connected socket. Drain on close of the network resources. An optional HTTPS proxy: configuration checks and a Node version guard, exchanges through a CONNECT tunnel, bypass entries, `connect-failed` when the proxy refuses, cannot be reached or does not answer, a stop or a close that ends a proxy connection still being built, and no process crash when the proxy resets after a refusal | Package-internal `src/http.ts`, `src/network.ts` and `src/pool-agent.ts` | Slow tests against a real local HTTPS server with a self-signed certificate and a local `http:` CONNECT proxy. With `OMNE_LIVE_TESTS=1`, `test:live` sends one streamed request to OpenRouter through the proxy of the cloud session. Only manual runs give this evidence. They do not prove an `https:` proxy, a consumer outside this package or continuous public TLS |
| Not delivered | Request planning and the map of stream events ([stage two](https://github.com/nemori-ai/omne-harness-lite/issues/446), 2.3). The OpenAI family (2.5), with real requests through the fixed OpenRouter route. Credential resolution and real supplier requests through `ModelTransport` (2.6). Media reads (stage four, 4.4): materialize refuses a content reference that the model sees. A public entry for the factory of the network resources. Verification of the shared transport interface by a second, clearly different family (a later line). Connection slots by priority and wait mode: not implemented and not adopted as a contract. Today the capacity grants slots first come, first served, and the caller ends a wait with its cancel signal. The direction and the owners are in [docs/architecture.md, "未实现的优化方向：按优先级与等待方式分配连接席位"](docs/architecture.md#未实现的优化方向按优先级与等待方式分配连接席位) | None | No evidence for these paths |

## Usage

A family author gets the types from the root entry: `import type { PiFamilyContributions } from '@omne-harness/pi-ai-transport'`. A dependency on this package installs model-contract, operation-result, json-text and content-block. It does not install Cordis, `@omne-harness/model` or a family. This package has no Cordis entry. The reason is in [Cordis integration](docs/cordis.md).

An assembly calls `createPiTransport({ network, families, routes, credential, limits })` and gets `{ transport, close }`. It gives `transport` to the send resource of Model. Start reads the credential slot once, inside its synchronous call: the caller puts the secret in the slot before it calls `start`, and clears the slot after `start` returns. The assembly closes every transport first and closes the network resources last. Only code in this package can use the transport mechanisms. A configuration example and the start and release duties are in [Use and position](docs/context.md).

## Contracts

The [behavior specification](SPEC.md) owns the results, ownership, failures, cancellation and life cycle of the three-phase transport, the capacity, the exchange, SSE, frames, the network resources and diagnostics. It also owns the rule that secrets stay inside the package. The shapes of the five types and the duties of family authors belong to the [group architecture, "pi 家族贡献的取得协议"](../docs/architecture.md#pi-家族贡献的取得协议). The [public API](docs/public-api.md) indexes the public entry.

## Design

The three-phase transport combines the internal mechanisms. transport.ts owns the life cycle of the transport and of each prepared transport. materialized.ts owns the slot and the start of one send. fact-stream.ts reads the response into facts. termination.ts is the pure function that maps failures. Each of the six mechanism modules answers one question:

- Who can send?
- How does one request start and finish?
- How do bytes become events?
- How do events become frames?
- How do the parts compose and drain?
- How does the package isolate observers from the work?

The network resources compose and inject the capacity, the socket pool and the diagnostic isolation. The exchange does not create them. The socket pool `PoolAgent` in `src/pool-agent.ts` controls two points of building a connection through a proxy. The reasons are in [Internal architecture, "经代理建立连接"](docs/architecture.md#经代理建立连接). The modules, the exchange phases, resource ownership and the design reasons are in [Internal architecture](docs/architecture.md). The sequences are in [Key flows](docs/flows.md), and the objects are in [Object model](docs/object-model.md). The SSE framing code comes from pi. [UPSTREAM.md](UPSTREAM.md) records its source.

## Configuration and operation

The caller gives every limit. The package has no default values:

- Network resources: `maxConnections` is the capacity, the number of exchanges in flight at once. The pool itself has no socket limit. After `idleConnectionTimeoutMs` the pool closes an idle connection. `tls.ca`, `proxy` (`url` and `bypass`) and a diagnostic observer with `maxPending` are optional. The package does not read `HTTPS_PROXY` or `NO_PROXY`. The caller maps the environment to `proxy` at its boundary.
- Each exchange: `connectTimeoutMs` and `maxErrorBodyBytes`. `connectTimeoutMs` runs from the start until the request has a connected socket. For a reused connection it ends on the next tick. `null` sets no limit.
- SSE framing: `maxEventBytes`. Protocol frames: `endMarker` and the JSON limits.
- Three-phase transport: `network` (network resources that the assembly creates and closes), `families`, `routes` (the `url` and `endMarker` of each recipient), `credential` (the credential slot) and `limits` (`connectTimeoutMs`, `maxErrorBodyBytes`, `maxEventBytes` and `json`). For a configuration out of its rules, `createPiTransport` throws `RangeError` synchronously.
- Each timer value is at most 2147483647 ms, the largest delay a Node timer takes.

The duties of the caller are in [SPEC, "调用方责任"](SPEC.md#调用方责任).

The package closes each exchange physically, returns its slot and drains in-flight exchanges on close. The package only checks the character set of the headers. It does not parse, keep or record credentials. The proxy URL can contain credentials, and the package does not write it into a message, a result or a diagnostic. The package needs Node.js 24 or later at run time. With a proxy it needs Node.js 24.5.0 or later, and construction fails on an older Node. It needs no other external program.

## Verification

Run these commands from the repository root. The package engines require Node.js >=24, and the pnpm version is 10.28.1. The run reports state the Node.js version that each run used.

```sh
pnpm turbo run typecheck --filter=@omne-harness/pi-ai-transport
pnpm turbo run test --filter=@omne-harness/pi-ai-transport
pnpm turbo run test:fast --filter=@omne-harness/pi-ai-transport
pnpm turbo run test:slow --filter=@omne-harness/pi-ai-transport
pnpm run lint:deps
pnpm run check:docs
```

To send one request to OpenRouter through a real proxy (this costs a small amount), run this command from the repository root, without turbo:

```sh
OMNE_LIVE_TESTS=1 pnpm --filter @omne-harness/pi-ai-transport run test:live
```

`test:live` needs `HTTPS_PROXY`. The proxy adds the OpenRouter credential. Without `OMNE_LIVE_TESTS=1` the test skips and the command exits 0. With the switch but without `HTTPS_PROXY` the test fails. `test` and `test:slow` also include this file. Turbo removes environment variables that it does not declare, so under turbo the test always skips.

The Turbo tasks `test`, `test:fast` and `test:slow` first build this package and its dependencies, then run the selected tests. The slow tier needs `openssl` on PATH to make a self-signed certificate. The test tiers, fixtures and test doubles are in the [test notes](tests/README.md). Coverage and gaps are in [SPEC, "组合与验证"](SPEC.md#组合与验证).

Known limits of `pnpm run package:template scan --member packages/model/pi-ai-transport`:

- It reports `integration` as `unknown`. The reason is that `docs/architecture/constraints.json` still lists this member as a candidate with no layer. The architecture owner owns that entry. The structure check is not affected.
- With `--check` it exits 1, because `adoption` is `unmarked`: `package.json` has no package-template marker. Every member of the repository is in the same state. The `structure` result stays `pass`.

## Maintenance

- To change a family contribution type, first change the accepted code block of the group architecture. Then update `src/family.ts`, the type tests and the [public API](docs/public-api.md).
- To change mechanism behavior, update the SPEC, the related tests and the [key flows](docs/flows.md). Also update the three-phase transport code that calls the mechanism.
- To change the failure map, update `src/termination.ts`, the table in the SPEC section "事实流" and `tests/termination.spec.ts`.
- To change `src/sse.ts`, update `provenance.json` and `UPSTREAM.md`.
- To add a run-time dependency, first check the dependency direction in the group architecture. Then update `tests/dependencies.spec.ts`.
- To change the support scope, update this table, the Chinese README, the [group page](../README.md), the [group architecture](../docs/architecture.md) and the [package organization](../../../docs/package-organization.md).

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
UPSTREAM.md, LICENSE.pi   Source notes and original license of the pi-adapted code
provenance.json           Source, hashes and adaptations
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
