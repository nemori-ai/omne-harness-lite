# @omne-harness/model-host-local

[中文](README_ZH.md)

## Responsibility and status

This member is the single-machine host provider of Model. It implements local credential custody and the local send path. Local credential custody is the file vault (disk records, file lock, atomic publish, close) and the Cordis plugin that loads it. The local send path is the production send resources `createPiSendResources` and the local Model assembly `assembleLocalModel`. The assembly joins the credential custody, the Model send boundary, the pi transport with the two families, and the injected `ModelCommands` into one real request path. It also gives the Model preparation resources over the same families and `ModelCommands`. The design of the other host capabilities (clock, instance scheduling, catalog loading, hosted-run plugin) is accepted and is held in [model/docs/cordis.md](../model/docs/cordis.md). These capabilities are not implemented. The public credential values and ports belong to [model-contract](../model-contract/README.md). The `modelCredential` service definition belongs to [model-cordis-contract](../model-cordis-contract/README.md). The judgment of presence and resolution and the send boundary belong to [model](../model/README.md). The transport and the families belong to [pi-ai-transport](../pi-ai-transport/README.md). Design, implementation, and run verification are judged separately.

| Capability | Status | Evidence scope |
| --- | --- | --- |
| File vault and Cordis plugin | Implemented | Real file system, child processes, and real Cordis 4.0.4 |
| Production send resources `createPiSendResources` | Implemented | A transport factory that observes the credential slot, and the real pi transport without a send |
| Local Model assembly `assembleLocalModel` | Implemented | A local HTTPS server replays the recorded SSE of both families, through the Model runtime and the in-memory `ModelCommands`. Calls whose reply holds a reasoning state settle in both families |
| Requests through a real vendor or proxy | Not verified in this member | None |
| Preparation resources through `assembleLocalModel` | Implemented | The real lease of model over the families and the in-memory `ModelCommands`. A slow test settles and cleans a call of each family, then meters a request that continues it from a local HTTPS replay, not from a real vendor |
| Durable `ModelCommands` | Not in this member | None |
| Clock, instance scheduling, catalog loading, hosted-run plugin | Not implemented | None |

## Usage

A standalone program takes `createLocalCustodian` and `openLocalCustodian` from the root entry and does not start Cordis. To send real requests, a program takes `assembleLocalModel` from the root entry. It gives the vault, a `ModelCommands`, a `SendCoordinator`, the composed families, the network configuration, the routes, the limits, and the preparation options. It gets the Model send boundary `send`, the preparation resources `preparation`, and `close`. After `close` starts, `preparation` refuses new leases. A lease that the caller acquired before `close` stays usable until the caller releases it. A Cordis host loads `LocalCredentialPlugin` from the `./cordis` entry. When needed, it sends through static injection with `deliverInjected`. For usage and examples, see [usage and position](docs/context.md). For initialization and disposal responsibilities, see [Cordis integration](docs/cordis.md). Selecting this member installs Cordis, model-cordis-contract, pi-ai-transport, and proper-lockfile. A program that uses only the root entry does not start Cordis, but its installation closure still contains them.

## Contracts

The [behavior specification](SPEC.md) owns the behavior of the vault file, the file lock, publish confirmation, refresh, close, and the plugin lifecycle. It also owns the behavior of the send resources and the local assembly. The shapes of references, results, and ports belong to model-contract. The `SendResources` port and the send boundary belong to model. The transport configuration belongs to pi-ai-transport. For navigation of the public entries, see the [public API](docs/public-api.md).

## Design

The encoding of disk records is in [records.ts](src/records.ts). The interaction of the vault with the file system is in [store.ts](src/store.ts). The plugin is in [cordis.ts](src/cordis.ts). Injected sending is in [deliver-injected.ts](src/deliver-injected.ts). The send resources are in [send-resources.ts](src/send-resources.ts). The local assembly is in [assembly.ts](src/assembly.ts). The types of the custody state (`CustodianState`, `Binding`, `BindingLife`) come from model. The judgment is not in this member: the vault gives a snapshot of the current state to the judgment functions of model. For modules, mechanisms, and reasons, see the [internal architecture](docs/architecture.md).

## Configuration and operation

The vault path and the factory secret are the only configuration of the vault. The application supplies them. The application also supplies every route URL, the proxy, TLS, the connection capacity, and every limit of the local assembly. This member has no defaults for them. In the cloud environment of this repository, the vault holds a placeholder value, and the outbound proxy injects the real key. The file lock does not expire with time. After a crash of the process that holds the lock, remove `${path}.lock` by hand when all writers have stopped. The vault mints tenant values again from the disk records through legal-identity. Tenant equality holds only inside one legal-identity instance. Therefore the caller and the vault must share that instance in one process.

## Verification

Run these commands from the repository root. The package requires Node.js >=24 and pnpm 10.28.1. Each run report identifies the Node.js version actually tested.

```sh
pnpm turbo run typecheck --filter=@omne-harness/model-host-local
pnpm turbo run test --filter=@omne-harness/model-host-local
pnpm turbo run test:fast --filter=@omne-harness/model-host-local
pnpm turbo run test:slow --filter=@omne-harness/model-host-local
pnpm run check:docs
```

The Turbo test tasks build this package and its dependencies before they run the selected tests. The `typecheck` task does not build. Direct `pnpm --filter @omne-harness/model-host-local test` does not build, so its required build output must already exist. The `test:fast` and `test:slow` tasks select the fast and slow layers, respectively.

The tests cover the five resolution results, tenant isolation, rotation and revocation, file corruption, close, cross-process update, and unknown save confirmation. They use the real Cordis 4.0.4 to check plugin publication and removal. The fast tests check the credential slot, the ownership of materialized transports, release, and close of the send resources. They also check that the assembly refuses new preparation leases after `close` starts, and that a lease from before `close` still meters and releases. The slow test replays the recorded SSE of both families from a local HTTPS server. It drives calls through the assembled send path and the Model runtime. It checks the `Bearer` credential, the single termination, the arrival of the account, and the payable amount. The tests do not show other host capabilities. They do not show requests through a real vendor or proxy. They do not show lock semantics across machines or on a network file system.

## Maintenance

When you change vault behavior, the record format, or the plugin entry, update the [documentation registration](documentation.json), the state shape that model judges, the use of the model-cordis-contract service definition, the group page, and the tests of this package. When the `SendResources` port of model or the transport configuration of pi-ai-transport changes, update the send resources, the local assembly, the SPEC, and the tests. Host capabilities that are not implemented keep their actual status. Do not promise them in the documents ahead of time.

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
