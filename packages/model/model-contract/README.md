# @omne-harness/model-contract

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

## Responsibility and status

This workspace scaffold owns public domain values, operation interfaces, replaceable provider ports, and shared protocols. The design is accepted as recorded in [SPEC](SPEC.md). The source entries currently export nothing. Design acceptance does not establish runtime support.

## Usage

Start with [consumer guidance](docs/context.md). The [public API](docs/public-api.md) contains design declarations, not importable implementations. Select an implementation when the application needs execution.

## Contracts

[SPEC](SPEC.md) owns behavior beyond types. [Public API design](docs/public-api.md) owns accepted design declarations. [Verification obligations](verification/index.md) define the evidence required before delivery.

## Design

[Architecture](docs/architecture.md), [object model](docs/object-model.md), and [flows](docs/flows.md) describe this member's responsibility. See the [documentation index](docs/index.md) for the six topics.

## Configuration and operation

The target production dependency closure excludes Cordis, Model implementations, pi, tokenizer engines, and storage engines. The shared Outcome type comes from the dependency-free `@omne-harness/operation-result`. Source exports must declare it as a production dependency. Installation and import guarantees require checks against actual published artifacts; empty source entries do not establish them.

## Verification

Run `pnpm --filter @omne-harness/model-contract typecheck` and `pnpm --filter @omne-harness/model-contract test`, plus `make docs-check`. Current tests cover the landed credential types and the 18 runtime values of the root entry (the identity decoders, comparators and constants, `MODEL_SEND`, `decodeCredentialId`, `sameCredentialHolder`, `deriveGuardControlOperation`), the export inventory, the type-consumption probes, and the install-closure facility; declarations marked `pending` in the inventory are not implemented. Protocol, resource, and production-capability obligations remain in [verification](verification/index.md).

## Maintenance

Keep [documentation bindings](documentation.json), consumer links, and [group boundaries](../docs/architecture.md) aligned with the owning files. Implemented exports will replace accepted design declarations after implementation acceptance and verification; do not maintain a second signature source.

## 目录结构与文档职责

结构沿本任务采用的 #343 目录方案。待实现资源的 README 和 index 明示缺项，不代表功能已实现。

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
