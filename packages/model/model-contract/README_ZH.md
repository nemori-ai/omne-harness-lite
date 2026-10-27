# Model 领域契约

[English](README.md)

## 职责与状态

本成员拥有公共领域值、操作接口、可替换提供者端口及共同协议。设计已按 [SPEC](SPEC.md) 接受。状态分四类，各类只说明自己的范围。

1. 已有：凭据的纯契约，即引用、查询、存在性与解析结果、`CredentialPort`、`decodeCredentialId` 与 `sameCredentialHolder`。声明在 [`src/credential.ts`](src/credential.ts) 与 [`src/credential-values.ts`](src/credential-values.ts)。保管与判定不在本包：本地保管归 [model-host-local](../model-host-local/README_ZH.md)，判定归 [model](../model/README_ZH.md)，Cordis 服务定义归 [model-cordis-contract](../model-cordis-contract/README_ZH.md)。
2. 本包已实现：根入口导出 121 个类型和 20 个运行时值，是消费者面。`./provider` 入口导出提供者协议，72 个类型和 14 个运行时值；分组规则见[公开接口](docs/public-api.md#提供者协议入口)。`./testing` 入口导出受控替代提供者、替代传输、结果推送与公共观察协议的三个公开替身（推送生产者、`current` 查询与流观察），以及把替代件接成被测方的 `createScriptedConformanceSubject`，共 29 个名字。替代提供者、替代传输与替身的结果由测试脚本给出，不证明真实提供者的行为。`./conformance` 入口导出提供者符合性断言 `checkModelProviderConformance`，共 11 个名字，不导出任何替身。符合性断言按契约在公开面上可观察的义务逐条检查一个提供者。局限：这些检查证明契约面，不证明任何运行实现。
3. 尚未实现或验证：本包不含执行实现。`executeModel`、`createModelRuntime`、完整宿主与其他提供者不在本包。
4. 技术设计：非 pi-ai 技术设计已接受，pi-ai 细化的采用范围见[组架构各节](../docs/architecture.md#成员与新增条件)。契约实现不表示 CAP-MD01 至 CAP-MD13 已交付。SPEC 的[推理回放](SPEC.md#推理回放)设计已接受。第 2 类计入它的三个函数；适配器映射、再发执行与计量方法归 Model 运行时，尚未实现。

## 使用

从[消费指南](docs/context.md)进入。根入口导出[公开接口](docs/public-api.md)声明的消费侧类型和少量运行时值，`./provider` 入口导出只有提供者作者与 Model 实现使用的端口和契约函数，`./testing` 入口导出受控替代提供者、替代传输与三个公开替身，`./conformance` 入口导出提供者符合性断言。本包不含执行实现，需要执行能力时由应用选择实现。

最终页按原序交付 sealed 或 partial 及真实 trims。消费者分别处理完整块和未封值，再提供原 ACK 证据。目标字节只用于完整项组页，超目标大项独页，整个页受原容量 C 约束。消费者须能接收接近 C 的页。见[最终结果指导](docs/public-api.md#最终结果项与页预算)。

在首次受理前保存 `ModelInvocationRef`。inspect、connect 和 beginRead 使用该引用及当前 Access。Admission 保留 call、revision、recovered 并返回同一 reference。`ModelOperationRef` 封装 ACK 身份，消费者仍保存原 result 与 evidence。见[引用契约](SPEC.md#可保存调用引用)。

未知固定请求使用 judgeFixedModelRequest；typed Access 加未知 payload 使用 judgeAdmit。两者返回 `{ok}` 或 `{failure:{field,reason}}`。成功 payload 独立复制并冻结，principal 与已铸造 tenant 保持同一对象。[封闭输入契约](SPEC.md#封闭输入判断)规定解析预算与 Proxy 限制。结构成功不授予资格或容量。固定请求带 `declarations`：每个供应商一份展开后的回放声明，次序同供应商。可选字段 `replay` 只接受 `'off'`。

提供者以 `CallAccountReport` 交账目，不带 `subject` 与 `receipt`；Model 运行时保存账目时补上这两项。提供者以 `diagnostic` 事实交出回放略去、推理关闭、推理状态丢弃或用量自相矛盾。`ModelTransport.prepare` 的第三个参数列出再发须视为不可续接的消息。见[提供者操作](SPEC.md#342-独立执行与提供者操作)。

## 契约

[SPEC](SPEC.md)拥有类型之外的行为，[公开接口页](docs/public-api.md)是源码导航，声明只在 `src/` 里。[验证义务](verification/index.md)规定交付所需证据。

## 设计

[架构](docs/architecture.md)、[对象模型](docs/object-model.md)和[流程](docs/flows.md)说明本成员的职责。六个主题见[文档索引](docs/index.md)。

## 配置与运行

目标生产依赖不包含 Cordis、Model 运行实现、pi、tokenizer 或存储引擎。共享 `Outcome` 由零生产依赖的 `@omne-harness/operation-result` 提供，本包已把它声明为生产依赖。安装与导入保证由安装闭包设施对已安装产物验证，两个入口都在其中。

## 验证

在仓库根运行以下命令。包的 engines 要求 Node.js >=24，pnpm 版本为 10.28.1。实际验证过的 Node.js 版本以各次运行报告为准。

```sh
pnpm turbo run typecheck --filter=@omne-harness/model-contract
pnpm turbo run test --filter=@omne-harness/model-contract
pnpm turbo run test:fast --filter=@omne-harness/model-contract
pnpm turbo run test:slow --filter=@omne-harness/model-contract
pnpm run check:docs
```

Turbo 的 `test`、`test:fast` 与 `test:slow` 先构建本包及其依赖，再执行所选测试。`typecheck` 不先构建。直接运行 `pnpm --filter @omne-harness/model-contract test` 不自动构建，所需构建产物须已就绪。`test:fast` 与 `test:slow` 分别选择快层与慢层。

当前测试覆盖根入口的 121 个类型声明与 20 个运行时值（身份解码、`compareOutputCursors` 与常量、调用引用 codec、`deriveGuardControlOperation`、`judgeModelDelivery` 与投影函数）和 `./provider` 入口的 72 个类型声明与 14 个运行时值（操作引用 codec、`decodeReadId`、`compareRevisions`、共享输入 judge 与限额常量、`MODEL_SEND`、`decodeCredentialId`、`sameCredentialHolder`，以及回放函数 `judgeReplayDeclaration`、`projectReplay`、`continuedMessages`）、导出清单、类型消费探针、安装闭包设施，`./testing` 的受控替代提供者、替代传输与三个公开替身，以及 `./conformance` 的符合性断言（`./testing` 的替代件须通过全部义务，每条义务另有只违反它的坏提供者让它失败）。清单没有 `pending` 名字。协议、资源和生产能力的验证仍按[持续义务](verification/index.md)执行。

当前目标声明和 Model 观察别名见[公开接口](docs/public-api.md#model-当前目标与公共观察)。[类型探针](tests/model-stream-selection.spec-d.ts)核对公开形状，[`current` 替身场景](tests/testing-stream-references.spec.ts)核对查询顺序和资格；这些检查不验证真实提供者。

[交付协议模型](tests/protocol-model/README.md)说明结果保存、ACK、清理与晚账的有界探索，以及具名负控和运行监督。正式入口归慢层；模型和测试替身均不证明生产持久性或真实提供者符合性。

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
