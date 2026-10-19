# @omne-harness/model-cordis-contract

[中文](README_ZH.md)

## Responsibility and status

This member owns the unique Service definitions, keys, Context/Events augmentation, and definition-owned registration protocols. The design is accepted as recorded in [SPEC](SPEC.md). The status has four parts. Each part describes only its own scope.

1. Existing: the Cordis credential service definition. `ModelCredentialService` and the key `modelCredential` are in the `./cordis` entry. The declarations are in [`src/cordis.ts`](src/cordis.ts). The pure credential contract is in [model-contract](../model-contract/README.md). Local custody and `LocalCredentialPlugin` are in [model-host-local](../model-host-local/README.md). Limit: the service does not check the qualification of the caller. [SPEC](SPEC.md#凭据服务) lists this as open.
2. Implemented in this package: the root entry exports eight registration types. `./cordis` exports fifteen abstract Service definitions (including the credential service), the two directories `ModelInstancesService` and `ModelConvertersService`, and the matching `Context` and `Events` augmentation. Every name of the export inventory is implemented. Limit: the tests cover only the range that [verification](verification/README.md) lists. They show no runtime implementation.
3. Not implemented or verified: the implementations of the abstract Services, that is the model runtime factory, a complete host, and other providers, are not in this package. The open points of the two directories are in [SPEC](SPEC.md#实例目录的未决项) and [SPEC](SPEC.md#转换目录的未决项).
4. Technical design: the non-pi-ai technical design is accepted. The pi-ai refinements remain candidates. Implementing the contract does not mean that CAP-MD01 to CAP-MD13 are delivered.

## Usage

Start with [consumer guidance](docs/context.md). The [public API page](docs/public-api.md) links to the source declarations of the two entries. The directories are the only concrete Services; select an implementation of the abstract Services when the application needs execution.

## Contracts

[SPEC](SPEC.md) owns behavior beyond types. The [public API page](docs/public-api.md) is the source navigation: each declaration exists only in `src/`. [Verification obligations](verification/index.md) define the evidence required before delivery.

## Design

[Architecture](docs/architecture.md), [object model](docs/object-model.md), and [flows](docs/flows.md) describe this member's responsibility. See the [documentation index](docs/index.md) for the six topics.

## Configuration and operation

Framework definitions belong in `./cordis`; the root permits pure types only. The manifest includes Cordis. Business plugins belong to the model-host-local member. Installation and import guarantees come from the install-closure facility under `tests/install/`, run against the built artifacts; the root entry's closure must stay free of Cordis.

## Verification

Run `pnpm --filter @omne-harness/model-cordis-contract typecheck` and `pnpm --filter @omne-harness/model-cordis-contract test`, plus `make docs-check`. Current tests cover the root entry having no runtime export, the `./cordis` runtime exports (publication of each definition under its key, forwarding and removal with the provider for the credential service), the type shape of the registration types, the Context augmentation and the event documentation, the instance directory on a real Cordis Context (registration bound to the calling fiber, qualification checked in the registering call, recognition and conflict, conditional removal, successors, tenant separation, bounded registrations), the converter catalog on a real Cordis Context (lookup order, registration bound to the calling fiber, retirement and lease drain, successors, conversions in flight, the release hook of the provider, bounded contributions), the export inventory, and the install-closure facility. No name in the inventory is pending. Open points of the directories are listed in [SPEC](SPEC.md#实例目录的未决项) and [SPEC](SPEC.md#转换目录的未决项). Protocol, resource, and production-lifecycle obligations remain in [verification](verification/index.md).

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
