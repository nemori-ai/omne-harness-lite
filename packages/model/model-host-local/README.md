# @omne-harness/model-host-local

[中文](README_ZH.md)

## Responsibility and status

This member is the single-machine host provider of Model. It implements only local credential custody: the file vault (disk records, file lock, atomic publish, close) and the Cordis plugin that loads it. The design of the other host capabilities (clock, instance scheduling, catalog loading, hosted-run plugin) is accepted and is held in [model/docs/cordis.md](../model/docs/cordis.md). These capabilities are not implemented. The public credential values and ports belong to [model-contract](../model-contract/README.md). The `modelCredential` service definition belongs to [model-cordis-contract](../model-cordis-contract/README.md). The judgment of presence and resolution belongs to [model](../model/README.md). Design, implementation, and run verification are judged separately.

## Usage

A standalone program takes `createLocalCustodian` and `openLocalCustodian` from the root entry and does not start Cordis. A Cordis host loads `LocalCredentialPlugin` from the `./cordis` entry. When needed, it sends through static injection with `deliverInjected`. For usage and examples, see [usage and position](docs/context.md). For initialization and disposal responsibilities, see [Cordis integration](docs/cordis.md). Selecting this member installs Cordis, model-cordis-contract, and proper-lockfile. A program that uses only the vault factory of the root entry does not start Cordis, but its installation closure still contains them.

## Contracts

The [behavior specification](SPEC.md) owns the behavior of the vault file, the file lock, publish confirmation, refresh, close, and the plugin lifecycle. The shapes of references, results, and ports belong to model-contract. For navigation of the public entries, see the [public API](docs/public-api.md).

## Design

The encoding of disk records is in [records.ts](src/records.ts). The interaction of the vault with the file system is in [store.ts](src/store.ts). The plugin is in [cordis.ts](src/cordis.ts). Injected sending is in [deliver-injected.ts](src/deliver-injected.ts). The types of the custody state (`CustodianState`, `Binding`, `BindingLife`) come from model. The judgment is not in this member: the vault gives a snapshot of the current state to the judgment functions of model. For modules, mechanisms, and reasons, see the [internal architecture](docs/architecture.md).

## Configuration and operation

The vault path and the factory secret are the only configuration. The application supplies them. The file lock does not expire with time. After a crash of the process that holds the lock, remove `${path}.lock` by hand when all writers have stopped. The vault mints tenant values again from the disk records through legal-identity. Tenant equality holds only inside one legal-identity instance. Therefore the caller and the vault must share that instance in one process.

## Verification

Run `pnpm --filter @omne-harness/model-host-local typecheck`, `pnpm --filter @omne-harness/model-host-local test`, and `pnpm run check:docs`. The tests cover the five resolution results, tenant isolation, rotation and revocation, file corruption, close, cross-process update, and unknown save confirmation. They use the real Cordis 4.0.4 to check plugin publication and removal. They do not show other host capabilities. They do not show lock semantics across machines or on a network file system.

## Maintenance

When you change vault behavior, the record format, or the plugin entry, update the [documentation registration](documentation.json), the state shape that model judges, the use of the model-cordis-contract service definition, the group page, and the tests of this package. Host capabilities that are not implemented keep their actual status. Do not promise them in the documents ahead of time.

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
