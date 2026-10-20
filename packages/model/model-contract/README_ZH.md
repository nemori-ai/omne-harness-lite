# Model 领域契约

[English](README.md)

## 职责与状态

本成员拥有公共领域值、操作接口、可替换提供者端口及共同协议。设计已按 [SPEC](SPEC.md) 接受。状态分四类，各类只说明自己的范围。

1. 已有：凭据的纯契约，即引用、查询、存在性与解析结果、`CredentialPort`、`decodeCredentialId` 与 `sameCredentialHolder`。声明在 [`src/credential.ts`](src/credential.ts) 与 [`src/credential-values.ts`](src/credential-values.ts)。保管与判定不在本包：本地保管归 [model-host-local](../model-host-local/README_ZH.md)，判定归 [model](../model/README_ZH.md)，Cordis 服务定义归 [model-cordis-contract](../model-cordis-contract/README_ZH.md)。
2. 本包已实现：根入口导出 161 个类型和 25 个运行时值。`./testing` 入口导出受控替代提供者、替代传输和提供者符合性断言 `checkModelProviderConformance`，共 27 个名字。替代提供者与替代传输的结果由测试脚本给出，不证明真实提供者的行为。符合性断言按契约在公开面上可观察的义务逐条检查一个提供者。局限：这些检查证明契约面，不证明任何运行实现。
3. 尚未实现或验证：本包不含执行实现。`executeModel`、`createModelRuntime`、完整宿主与其他提供者不在本包。
4. 技术设计：非 pi-ai 技术设计已接受，pi-ai 细化的采用范围见[组架构各节](../docs/architecture.md#成员与新增条件)。契约实现不表示 CAP-MD01 至 CAP-MD13 已交付。

## 使用

从[消费指南](docs/context.md)进入。根入口导出[公开接口](docs/public-api.md)声明的类型和少量运行时值，`./testing` 入口导出受控替代提供者、替代传输与提供者符合性断言。本包不含执行实现，需要执行能力时由应用选择实现。

最终页按原序交付 sealed 或 partial 及真实 trims。消费者分别处理完整块和未封值，再提供原 ACK 证据。目标字节只用于完整项组页，超目标大项独页，整个页受原容量 C 约束。消费者须能接收接近 C 的页。见[最终结果指导](docs/public-api.md#最终结果项与页预算)。

在首次受理前保存 `ModelInvocationRef`。inspect、connect 和 beginRead 使用该引用及当前 Access。Admission 保留 call、revision、recovered 并返回同一 reference。`ModelOperationRef` 封装 ACK 身份，消费者仍保存原 result 与 evidence。见[引用契约](SPEC.md#可保存调用引用)。

## 契约

[SPEC](SPEC.md)拥有类型之外的行为，[公开接口页](docs/public-api.md)是源码导航，声明只在 `src/` 里。[验证义务](verification/index.md)规定交付所需证据。

## 设计

[架构](docs/architecture.md)、[对象模型](docs/object-model.md)和[流程](docs/flows.md)说明本成员的职责。六个主题见[文档索引](docs/index.md)。

## 配置与运行

目标生产依赖不包含 Cordis、Model 运行实现、pi、tokenizer 或存储引擎。共享 `Outcome` 由零生产依赖的 `@omne-harness/operation-result` 提供，本包已把它声明为生产依赖。安装与导入保证由安装闭包设施对已安装产物验证，两个入口都在其中。

## 验证

运行 `pnpm --filter @omne-harness/model-contract typecheck`、`pnpm --filter @omne-harness/model-contract test` 及 `pnpm run check:docs`。当前测试覆盖根入口的 161 个类型声明与 25 个运行时值（身份解码、比较函数与常量、`MODEL_SEND`、`decodeCredentialId`、`sameCredentialHolder`、`deriveGuardControlOperation`）、导出清单、类型消费探针、安装闭包设施，`./testing` 的受控替代提供者与替代传输，以及 `./testing` 的符合性断言（替代件须通过全部义务，每条义务另有只违反它的坏提供者让它失败）。清单没有 `pending` 名字。协议、资源和生产能力的验证仍按[持续义务](verification/index.md)执行。

## 维护

文件归属变化时同步[文档登记](documentation.json)、消费者链接和[组边界](../docs/architecture.md)。声明只在 `src/` 保存，公开接口页只导航到它们，不维护第二套签名。

## 目录结构与文档职责

目录骨架依据 [RFC-0007](../../../docs/rfcs/RFC-0007-source-packages-and-templates.md) 与模板 `typescript-package@3.0.0`（见[完整生成树](../../../docs/package-organization.md#完整生成树)）。对本包不适用的目录，其 README 写明不适用及原因。目录存在不代表功能已实现。

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
