# @omne-harness/model-cordis-contract

[中文](README_ZH.md)

## Responsibility and status

This member owns the unique Service definitions, keys, Context/Events augmentation, and definition-owned registration protocols. The design is accepted as recorded in [SPEC](SPEC.md). The status has four parts. Each part describes only its own scope.

1. Existing: the Cordis credential service definition. `ModelCredentialService` and the key `modelCredential` are in the `./cordis` entry. The declarations are in [`src/cordis.ts`](src/cordis.ts). The pure credential contract is in [model-contract](../model-contract/README.md). Local custody and `LocalCredentialPlugin` are in [model-host-local](../model-host-local/README.md). Limit: the service does not check the qualification of the caller. [SPEC](SPEC.md#凭据服务) lists this as open.
2. Implemented in this package: the root entry exports eight registration types. `./cordis` exports fifteen abstract Service definitions (including the credential service), the two directories `ModelInstancesService` and `ModelConvertersService`, and the matching `Context` and `Events` augmentation. Every name of the export inventory is implemented. Limit: the tests cover only the range that [verification](verification/README.md) lists. They show no runtime implementation.
3. Not implemented or verified: the implementations of the abstract Services, that is the model runtime factory, a complete host, and other providers, are not in this package. The open points of the two directories are in [SPEC](SPEC.md#实例目录的未决项) and [SPEC](SPEC.md#转换目录的未决项).
4. Technical design: the non-pi-ai technical design is accepted. The [group architecture](../docs/architecture.md#成员与新增条件) defines which pi-ai designs are accepted and which remain candidates. Implementing the contract does not mean that CAP-MD01 to CAP-MD13 are delivered.

## Usage

Start with [consumer guidance](docs/context.md). The [public API page](docs/public-api.md) links to the source declarations of the two entries. The directories are the only concrete Services; select an implementation of the abstract Services when the application needs execution.

The ordinary runtime uses invocation references. The raw instance service implements ModelInstanceDirectory and keeps tenant/call routing. A host must enforce current observation access. See [SPEC](SPEC.md).

## Contracts

[SPEC](SPEC.md) owns behavior beyond types. The [public API page](docs/public-api.md) is the source navigation: each declaration exists only in `src/`. [Verification obligations](verification/index.md) define the evidence required before delivery.

## Design

[Architecture](docs/architecture.md), [object model](docs/object-model.md), and [flows](docs/flows.md) describe this member's responsibility. See the [documentation index](docs/index.md) for the six topics.

## Configuration and operation

Framework definitions belong in `./cordis`; the root permits pure types only. Cordis is a production dependency in the manifest. Business plugins belong to the model-host-local member. Installation and import guarantees come from the install-closure facility under `tests/install/`, run against the built artifacts; the root entry's closure must stay free of Cordis.

## Verification

Run these commands from the repository root. The package requires Node.js >=24 and pnpm 10.28.1. Each run report identifies the Node.js version actually tested.

```sh
pnpm turbo run typecheck --filter=@omne-harness/model-cordis-contract
pnpm turbo run test --filter=@omne-harness/model-cordis-contract
pnpm turbo run test:fast --filter=@omne-harness/model-cordis-contract
pnpm turbo run test:slow --filter=@omne-harness/model-cordis-contract
pnpm run check:docs
```

The Turbo test tasks build this package and its dependencies before they run the selected tests. The `typecheck` task does not build. Direct `pnpm --filter @omne-harness/model-cordis-contract test` does not build, so its required build output must already exist. The `test:fast` and `test:slow` tasks select the fast and slow layers, respectively.

Current tests cover the root entry having no runtime export, the `./cordis` runtime exports (publication of each definition under its key, forwarding and removal with the provider for the credential service), the type shape of the registration types, the Context augmentation and the event documentation, the instance directory on a real Cordis Context (registration bound to the calling fiber, qualification checked in the registering call, recognition and conflict, conditional removal, successors, tenant separation, bounded registrations), the converter catalog on a real Cordis Context (lookup order, registration bound to the calling fiber, retirement and lease drain, successors, conversions in flight, the release hook of the provider, bounded contributions), the export inventory, and the install-closure facility. No name in the inventory is pending. Open points of the directories are listed in [SPEC](SPEC.md#实例目录的未决项) and [SPEC](SPEC.md#转换目录的未决项). Protocol, resource, and production-lifecycle obligations remain in [verification](verification/index.md).

## Maintenance

Keep [documentation bindings](documentation.json), consumer links, and [group boundaries](../docs/architecture.md) aligned with the owning files. Declarations stay only in `src/`. The public API page links to them. Do not keep a second signature source.

## Directory structure and documentation roles

The skeleton follows [RFC-0007](../../../docs/rfcs/RFC-0007-source-packages-and-templates.md) and the template `typescript-package@3.0.0` (see the [generated tree](../../../docs/package-organization.md#完整生成树)). A directory that does not apply to this package states in its README why it does not apply. A directory that exists does not mean that the function is implemented.

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
package.json              Package manifest
docs/                     Six topics: architecture, flows, object-model, public-api, context, cordis
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each fixed directory has a README and an index. The source, build, and test configuration follow the actual files. Build output and dependency directories are not part of the documentation skeleton.

| Entry | Documentation role |
| --- | --- |
| [Design](docs/index.md) | Architecture, flows, objects, interfaces, consumption, and assembly |
| [Source](src/index.md) | Actual public exports and internal code |
| [Tests](tests/index.md), [fixtures](tests/fixtures/index.md) | Executable assertions and fixed inputs |
| [Schema](schema/index.md) | External data formats and published identity |
| [Continuing verification](verification/index.md), [models](verification/models/index.md), [proofs](verification/proofs/index.md) | Properties, assumptions, conformance, and verification resources |
| [Design decisions](adr/index.md) | Implementation choices with continuing consumers |
| [Examples](examples/index.md) | Runnable consumption |
| [Runtime resources](resources/index.md) | Assets, sources, and loading responsibility |
| [Independent acceptance](acceptance/index.md) | Independent scenarios, environments, and criteria |
