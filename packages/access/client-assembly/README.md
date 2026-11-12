# @omne-harness/client-assembly

[中文](README_ZH.md)

The client assembly of the access group: a client-side Cordis tree that follows which protocols the server has open, and puts a protocol client on the tree for each open protocol it knows.
## Responsibility and status

This package owns the client side of RFC-0015 §6「客户端装配」. Its consumers are client applications that build a Cordis tree (the desktop application is the first planned one); the command line does not use it. Implemented (card #1249): `connectionPlugin` and the service `connection`; `defineProtocolClient` and the services `protocol:<name>/v<major>`; the availability step and the backoff policy in the root entry. Not implemented: the login itself (only the `LoginStateSource` interface is here), the IPC transport, user interface modules.

## Usage

Build a tree with `connectionPlugin({ transport, login })` from `@omne-harness/client-assembly/cordis`, then load one `defineProtocolClient(protocol)` per protocol the application knows. A module that needs the protocol injects `protocol:<name>/v<major>`; it loads while the server has the protocol open and unloads when it is taken down. The transport comes from `@omne-harness/sdk/core`. The demonstration is `tests/fixtures/assembly-demo.ts`.

## Contracts

[SPEC.md](SPEC.md) owns the behaviour: what the connection does with each frame, the backoff, and what a protocol client does on each event. [docs/public-api.md](docs/public-api.md) indexes the exports. The wire shape of the availability is `accessProtocol` of the [public contract](../public-contract/SPEC.md#内置协议-accessv1).

## Design

`src/availability.ts` is pure: one frame applied to the view, and the backoff. `src/cordis.ts` holds the two plugins and the service class. The connection is the only owner of the view; protocol clients read it and claim their key, so the connection can report an open protocol without a client.

## Configuration and operation

`connectionPlugin` takes the transport, the login state source, and optionally a backoff (default 200 ms doubling to at most 10 s), a diagnostics sink, and a sleep function for tests. The caller owns the transport and its credentials.

## Verification

`pnpm exec vitest run --mode fast` in this directory runs the cases on real Cordis 4.0.4: one per reachable cell of the protocol-client table, the connection cases, and one end-to-end case against server-entry's test entry started as a process. The browser is not covered here; the client core's browser fixture is in the SDK.

## Maintenance

A change of `accessProtocol` changes `applyFrame`. A change of `ClientOf` in the SDK changes the guard of a withdrawn client. `docs/architecture/constraints.json` lists this member; keep its dependency rules in step.

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
