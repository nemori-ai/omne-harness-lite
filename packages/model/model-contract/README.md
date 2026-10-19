# @omne-harness/model-contract

[中文](README_ZH.md)

## Responsibility and status

This package owns public domain values, operation interfaces, replaceable provider ports, and shared protocols. The design is accepted as recorded in [SPEC](SPEC.md). The status has four parts. Each part describes only its own scope.

1. Existing: the pure credential contract. It has the reference, the query, the presence and resolution results, `CredentialPort`, `decodeCredentialId`, and `sameCredentialHolder`. The declarations are in [`src/credential.ts`](src/credential.ts) and [`src/credential-values.ts`](src/credential-values.ts). Custody and the judgment are not in this package. [model-host-local](../model-host-local/README.md) owns local custody. [model](../model/README.md) owns the judgment. [model-cordis-contract](../model-cordis-contract/README.md) owns the Cordis service definition.
2. Implemented in this package: the root entry exports 151 types and 18 runtime values. The `./testing` entry exports a scripted provider, a scripted transport, and the conformance suite `checkModelProviderConformance`, 27 names in all. The test script gives the results of the scripted provider and transport, so they prove nothing about a real provider. The conformance suite checks a provider against the contract obligations that the public face shows. Limit: these checks show the contract face and do not show any runtime implementation.
3. Not implemented or verified: this package has no execution implementation. `executeModel`, `createModelRuntime`, a complete host, and other providers are not in this package.
4. Technical design: the non-pi-ai technical design is accepted. The pi-ai refinements remain candidates. Implementing the contract does not mean that CAP-MD01 to CAP-MD13 are delivered.

## Usage

Start with [consumer guidance](docs/context.md). The root entry exports the declared types and a small set of runtime values, and the `./testing` entry exports a scripted provider and a scripted transport, and the provider conformance suite, as the [public API](docs/public-api.md) states. The package contains no execution implementation: select one when the application needs execution.

## Contracts

[SPEC](SPEC.md) owns behavior beyond types. The [public API page](docs/public-api.md) is the source navigation: each declaration exists only in `src/`. [Verification obligations](verification/index.md) define the evidence required before delivery.

## Design

[Architecture](docs/architecture.md), [object model](docs/object-model.md), and [flows](docs/flows.md) describe this member's responsibility. See the [documentation index](docs/index.md) for the six topics.

## Configuration and operation

The target production dependency closure excludes Cordis, Model implementations, pi, tokenizer engines, and storage engines. The shared Outcome type comes from the dependency-free `@omne-harness/operation-result`, which the package declares as a production dependency. Installation and import guarantees are checked against the installed artifacts by the install-closure facility, for both entries.

## Verification

Run `pnpm --filter @omne-harness/model-contract typecheck` and `pnpm --filter @omne-harness/model-contract test`, plus `make docs-check`. Current tests cover the 151 type declarations and the 18 runtime values of the root entry (the identity decoders, comparators and constants, `MODEL_SEND`, `decodeCredentialId`, `sameCredentialHolder`, `deriveGuardControlOperation`), the export inventory, the type-consumption probes, the install-closure facility, the scripted provider and transport of `./testing`, and the conformance suite of `./testing`, which the scripted pair must pass and which fails a provider that breaks one obligation. The inventory has no `pending` name. Protocol, resource, and production-capability obligations remain in [verification](verification/index.md).

## Maintenance

Keep [documentation bindings](documentation.json), consumer links, and [group boundaries](../docs/architecture.md) aligned with the owning files. Declarations stay only in `src/`. The public API page links to them. Do not keep a second signature source.

## 目录结构与文档职责

结构沿本任务采用的 #343 目录方案。对本包不适用的目录，其 README 写明不适用及原因。目录存在不代表功能已实现。

```text
包根：README.md、README_ZH.md、index.md、SPEC.md、documentation.json、package.json
├── docs/：architecture、flows、object-model、public-api、context、cordis 六主题
├── src/
├── tests/fixtures/
├── schema/
├── verification/models/、verification/proofs/
├── adr/
├── examples/
├── resources/
└── acceptance/
```

每个固定目录都有 README 和 index。源码、构建与测试配置沿实际文件；构建产物和依赖目录不属于正文骨架。

| 入口 | 文档职责 |
| --- | --- |
| [设计](docs/index.md) | 架构、流程、对象、接口、消费与装配 |
| [源码](src/index.md) | 实际公开导出和内部代码 |
| [测试](tests/index.md)、[夹具](tests/fixtures/index.md) | 可执行断言与固定输入 |
| [Schema](schema/index.md) | 外部数据格式及发布身份 |
| [持续验证](verification/index.md)、[模型](verification/models/index.md)、[证明](verification/proofs/index.md) | 性质、前提、符合性和验证资源 |
| [设计决策](adr/index.md) | 持续采用的实现取舍 |
| [示例](examples/index.md) | 可运行消费方式 |
| [运行资源](resources/index.md) | 资产、来源和装载责任 |
| [独立验收](acceptance/index.md) | 独立场景、环境与判据 |
