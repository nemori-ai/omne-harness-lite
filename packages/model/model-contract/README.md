# @omne-harness/model-contract

[中文](README_ZH.md)

## Responsibility and status

This package owns public domain values, operation interfaces, replaceable provider ports, and shared protocols. The design is accepted as recorded in [SPEC](SPEC.md). The status has four parts. Each part describes only its own scope.

1. Existing: the pure credential contract. It has the reference, the query, the presence and resolution results, `CredentialPort`, `decodeCredentialId`, and `sameCredentialHolder`. The declarations are in [`src/credential.ts`](src/credential.ts) and [`src/credential-values.ts`](src/credential-values.ts). Custody and the judgment are not in this package. [model-host-local](../model-host-local/README.md) owns local custody. [model](../model/README.md) owns the judgment. [model-cordis-contract](../model-cordis-contract/README.md) owns the Cordis service definition.
2. Implemented in this package: the root entry exports 170 types and 31 runtime values. The `./testing` entry exports a scripted provider, a scripted transport, and the conformance suite `checkModelProviderConformance`, 27 names in all. The test script gives the results of the scripted provider and transport, so they prove nothing about a real provider. The conformance suite checks a provider against the contract obligations that the public face shows. Limit: these checks show the contract face and do not show any runtime implementation.
3. Not implemented or verified: this package has no execution implementation. `executeModel`, `createModelRuntime`, a complete host, and other providers are not in this package.
4. Technical design: the non-pi-ai technical design is accepted. The [group architecture](../docs/architecture.md#成员与新增条件) defines which pi-ai designs are accepted and which remain candidates. Implementing the contract does not mean that CAP-MD01 to CAP-MD13 are delivered. The reasoning replay design in [SPEC](SPEC.md#推理回放) is accepted. Item 2 counts its three functions; the adapter mapping, the re-dispatch and the metering method belong to the Model runtime and are not implemented.

## Usage

Start with [consumer guidance](docs/context.md). The root entry exports the declared types and a small set of runtime values, and the `./testing` entry exports a scripted provider and a scripted transport, and the provider conformance suite, as the [public API](docs/public-api.md) states. The package contains no execution implementation: select one when the application needs execution.

Final pages contain ordered sealed or partial parts and actual trim notices. Handle both variants before acknowledging the result. A page target groups whole parts. An oversized part has its own page, bounded by the admitted capacity. Consumers must accept pages near that capacity. See the [result guidance](docs/public-api.md#最终结果项与页预算).

Persist `ModelInvocationRef` before admission. Use it with current Access for inspect, connect and beginRead. Admission returns the same reference alongside call, revision and recovered. `ModelOperationRef` packages ACK identity while the consumer retains the original result and evidence. See the [reference contract](SPEC.md#可保存调用引用).

Use `judgeFixedModelRequest` for an untrusted fixed request and `judgeAdmit` for typed access plus untrusted payload. Both return `{ ok }` or `{ failure: { field, reason } }`. Successful payload is copied and frozen. Admission preserves the current principal and minted tenant by identity. The [closed input contract](SPEC.md#封闭输入判断) defines parser budgets and Proxy limits. Structural success grants no qualification or capacity.

## Contracts

[SPEC](SPEC.md) owns behavior beyond types. The [public API page](docs/public-api.md) is the source navigation: each declaration exists only in `src/`. [Verification obligations](verification/index.md) define the evidence required before delivery.

## Design

[Architecture](docs/architecture.md), [object model](docs/object-model.md), and [flows](docs/flows.md) describe this member's responsibility. See the [documentation index](docs/index.md) for the six topics.

## Configuration and operation

The target production dependency closure excludes Cordis, Model implementations, pi, tokenizer engines, and storage engines. The shared Outcome type comes from the dependency-free `@omne-harness/operation-result`, which the package declares as a production dependency. Installation and import guarantees are checked against the installed artifacts by the install-closure facility, for both entries.

## Verification

Run these commands from the repository root. The package requires Node.js >=24 and pnpm 10.28.1. Each run report identifies the Node.js version actually tested.

```sh
pnpm turbo run typecheck --filter=@omne-harness/model-contract
pnpm turbo run test --filter=@omne-harness/model-contract
pnpm turbo run test:fast --filter=@omne-harness/model-contract
pnpm turbo run test:slow --filter=@omne-harness/model-contract
pnpm run check:docs
```

The Turbo test tasks build this package and its dependencies before they run the selected tests. The `typecheck` task does not build. Direct `pnpm --filter @omne-harness/model-contract test` does not build, so its required build output must already exist. The `test:fast` and `test:slow` tasks select the fast and slow layers, respectively.

Current tests cover the 170 type declarations and the 31 runtime values of the root entry (the identity decoders, comparators and constants, `MODEL_SEND`, `decodeCredentialId`, `sameCredentialHolder`, `deriveGuardControlOperation`, and the replay functions `judgeReplayDeclaration`, `projectReplay`, `continuedMessages`), the export inventory, the type-consumption probes, the install-closure facility, the scripted provider and transport of `./testing`, and the conformance suite of `./testing`, which the scripted pair must pass and which fails a provider that breaks one obligation. The inventory has no `pending` name. Protocol, resource, and production-capability obligations remain in [verification](verification/index.md).

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
