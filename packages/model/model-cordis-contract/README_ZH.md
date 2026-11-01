# Model Cordis 契约

[English](README.md)

## 职责与状态

本成员拥有唯一 Service 定义、键、Context/Events 增补及定义自有登记协议。设计已按 [SPEC](SPEC.md) 接受。状态分四类，各类只说明自己的范围。

1. 已有：Cordis 凭据服务定义。`ModelCredentialService` 与键 `modelCredential` 在 `./cordis` 入口，声明在 [`src/cordis.ts`](src/cordis.ts)。凭据的纯契约在 [model-contract](../model-contract/README_ZH.md)，本地保管与 `LocalCredentialPlugin` 在 [model-host-local](../model-host-local/README_ZH.md)。局限：该服务不核验调用方资格，该项在 [SPEC](SPEC.md#凭据服务)登记为未决。
2. 本包已实现：根入口导出八个登记类型。`./cordis` 导出十五个抽象 Service 定义（含凭据服务）、两个具体目录 `ModelInstancesService` 与 `ModelConvertersService`，以及对应的 `Context` 与 `Events` 增补。导出清单里的名字全部已实现。局限：测试只覆盖[验证说明](verification/README.md)列出的范围，不证明任何运行实现。
3. 尚未实现或验证：抽象 Service 的实现，即模型运行工厂、完整宿主与其他提供者，不在本包。两个目录的未决项见 [SPEC](SPEC.md#实例目录的未决项)与 [SPEC](SPEC.md#转换目录的未决项)。
4. 技术设计：非 pi-ai 技术设计已接受，pi-ai 细化的采用范围见[组架构各节](../docs/architecture.md#成员与新增条件)。契约实现不表示 CAP-MD01 至 CAP-MD13 已交付。
5. 结果接收登记（T-06 方案 C）：`ModelRuntimeService.registerResultReceiver(owner, receiver)` 是具体成员，登记落在调用方 fiber。`./cordis` 另导出 `createModelResultReceiverTable`、`ModelResultReceiverTable` 与 `ModelResultReceiverConflictError`；新增的 `./testing` 入口有只实现登记的替身 `modelRuntime` 宿主与符合性用例。登记表只在本进程内有效，拆成多个进程时推送目标怎样到达，本版不定义。推送阶段在 model-host-local。见 [SPEC](SPEC.md#结果接收登记)。

## 使用

从[消费指南](docs/context.md)进入。[公开接口页](docs/public-api.md)导航到两个入口的源码声明。两个目录是仅有的具体 Service；需要执行能力时，由应用选择抽象 Service 的实现。

普通 runtime 使用 invocation reference。raw 实例服务实现 ModelInstanceDirectory，保持 tenant/call 路由。实际宿主另核当前观察资格。见 [SPEC](SPEC.md)。

## 契约

[SPEC](SPEC.md)拥有类型之外的行为，[公开接口页](docs/public-api.md)是源码导航，声明只在 `src/` 里。[验证义务](verification/index.md)规定交付所需证据。

## 设计

[架构](docs/architecture.md)、[对象模型](docs/object-model.md)和[流程](docs/flows.md)说明本成员的职责。六个主题见[文档索引](docs/index.md)。

## 配置与运行

框架定义从 `./cordis` 导出，根入口只允许纯类型。该成员的生产清单明确依赖 Cordis；业务插件归 model-host-local。安装与导入保证由 `tests/install/` 下的安装闭包设施对构建产物验证；根入口的闭包不得含 Cordis。

## 验证

在仓库根运行以下命令。包的 engines 要求 Node.js >=24，pnpm 版本为 10.28.1。实际验证过的 Node.js 版本以各次运行报告为准。

```sh
pnpm turbo run typecheck --filter=@omne-harness/model-cordis-contract
pnpm turbo run test --filter=@omne-harness/model-cordis-contract
pnpm turbo run test:fast --filter=@omne-harness/model-cordis-contract
pnpm turbo run test:slow --filter=@omne-harness/model-cordis-contract
pnpm run check:docs
```

Turbo 的 `test`、`test:fast` 与 `test:slow` 先构建本包及其依赖，再执行所选测试。`typecheck` 不先构建。直接运行 `pnpm --filter @omne-harness/model-cordis-contract test` 不自动构建，所需构建产物须已就绪。`test:fast` 与 `test:slow` 分别选择快层与慢层。

当前测试覆盖根入口没有运行时导出、`./cordis` 的运行时导出（每个定义按键发布，凭据服务另含转发与随提供者撤除）、登记类型的类型形状、Context 增补与事件文档、实例目录在真实 Cordis Context 上的行为（登记随调用方 fiber、登记时同步核资格、认回与冲突、条件撤除、后继、租户分隔、有界登记量）、转换目录在真实 Cordis Context 上的行为（查找顺序、登记随调用方 fiber、退役与租约排空、后继、在途转换、提供者的释放钩子、有界贡献量）、导出清单和安装闭包设施。清单里没有 `pending` 的名字。目录的未决项见 [SPEC](SPEC.md#实例目录的未决项)与 [SPEC](SPEC.md#转换目录的未决项)。协议、资源和生产生命周期的验证仍按[持续义务](verification/index.md)执行。

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
