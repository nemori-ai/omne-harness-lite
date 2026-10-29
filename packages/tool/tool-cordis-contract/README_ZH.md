# @omne-harness/tool-cordis-contract

[English](README.md)

Tool 的 Cordis 服务定义包。`./cordis` 导出抽象 Service 类和具体实例目录 `ToolInstancesService`，另导出 服务键、`Context` 增补与 `tool-cordis-contract/call-changed`、`tool-cordis-contract/binding-changed` 事件增补。`toolContributionAuthority`、`toolGenerations` 两个键与事件 `binding-changed` 来自 [RFC-0012](../../../docs/rfcs/RFC-0012-tool-dynamics.md)。键 `toolStartFence` 只给外层调用方启动排序域的 `invalidate`，由 `toolStartAuthority` 的提供者在同一排序域提供（[契约 SPEC](../tool-contract/SPEC.md#外层调用方的启动围栏)）。`./testing` 导出 `ToolInstancesService.register` 的登记语义套件、绑定登记表的 G7 套件（输入 `ToolAuthority`）、各自守约的非耐久替身，以及动态性套件骨架 `runToolDynamicsSuite`。根入口不导出值。

## 职责与状态

本包唯一拥有 Tool 的服务定义。它单独成包，是因为它的安装闭包含 `@deepseek-ai/cordis`，而纯契约包 `@omne-harness/tool-contract` 不能含。定义已经实现。`ToolInstancesService.register` 回复 `unavailable`，`ToolInstancesService.connect` 回复 `unsupported`，直到实例目录实现它们。本包没有提供者。登记套件先于登记实现就绪：实例目录实现 `register` 后，真实目录运行同一套件。套件和替身只证明条款的登记语义，不证明真实服务，也不在真实 Cordis 下运行。

## 支持范围

检出范围和跨包总表见[工具执行组的支持范围](../README.md#支持范围)。本节只写本包的部分。验证范围只说明测试核对了什么，不说明测试范围之外的行为已成立。

| 档 | 本包的状态 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开类型已导出 | 已导出：抽象 Service 类与 1 个具体类 `ToolInstancesService`，服务键、`Context` 增补、`call-changed` 与 `binding-changed` 事件增补、登记类型与 G7 类型（`ToolContributionAuthority`、`ToolGenerations`、`ToolLoadFailure`） | `./cordis`。根入口不导出值 | `tests/public-entry.spec.ts` 与 `tests/cordis-entry.spec.ts` 逐对核对键与类、导入图和清单依赖，并在真实 Cordis 4.0.4 下加载定义 |
| 纯契约函数已实现 | 无。本包没有契约函数 | 无 | 无 |
| 独立执行已实现 | 无 | 无 | 无 |
| runtime 已实现的路径 | 无。本包没有 runtime。唯一的具体服务 `ToolInstancesService` 回复上述具名失败 | 无 | 只测了 `ToolInstancesService` 的具名失败 |
| 尚未交付的宿主与提供者 | 动态性套件 `runToolDynamicsSuite` 的用例体（骨架把十条判据报告为不适用）。`toolContributionAuthority`、`toolGenerations`、`toolStartFence` 的提供者。`ToolInstancesService` 背后的实例目录。Tool 自有的提供者插件在 `tool-host-local` 的 `./cordis`，跨领域提供者由其拥有者交付。真实 Cordis 下的登记语义 | 无 | 无 |

`./testing` 入口交付登记语义套件和一个非耐久登记服务、绑定登记表的 G7 套件和一个非耐久登记表，以及动态性套件骨架。套件只对各自的替身运行（登记语义套件另对违约变体运行）。真实实现的对照尚未进行：它需要实例目录、本地绑定登记表（2.4）和真实的 Cordis 装配。

## 使用

提供或消费 Tool 服务的 Cordis 插件从 `@omne-harness/tool-cordis-contract/cordis` 导入定义，从 `@omne-harness/tool-contract` 导入类型。提供者继承抽象类，不再次 provide 同一个键。不用 Cordis 的代码只依赖 `@omne-harness/tool-contract`。`register` 的实现从 `@omne-harness/tool-cordis-contract/testing` 取 `toolRegistrationConformance`，写一个夹具工厂，工厂返回登记服务、租户、authority 证据和它能给的控制手柄（`asFiber`、`endFiber`、`refuseCheck`、`listing`、`checkedAgainst`、`renewedAuthority`，以及两租户用例所需的 `otherTenant` 与 `otherAuthority`），在自己的测试框架里逐条注册用例。用例类型、`NotApplicable` 与 `runConformanceCase` 取自 `@omne-harness/tool-contract/testing`。手柄缺失的用例报告不适用，不适用不是通过。

## 契约

行为归[契约 SPEC](../tool-contract/SPEC.md)。服务表、依赖分类、登记协议与事件规则归 [docs/cordis.md](docs/cordis.md)。源码导航见 [docs/public-api.md](docs/public-api.md)。

## 设计

两个模块。[src/cordis.ts](src/cordis.ts) 是 `./cordis` 入口。[src/testing.ts](src/testing.ts) 是 `./testing` 入口：套件、替身和夹具。它只以类型导入 `./cordis`，运行时不加载 Cordis。每个键常量取自唯一一个类的 `static provide`。本包为类型依赖 `tool-contract`，不依赖任何 Tool 实现。依赖方向是 `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`。

## 配置与运行

没有配置。本包不持有状态，不启动资源。生命周期归继承这些定义的插件。

## 验证

快层命令是 `pnpm turbo run test:fast --filter=@omne-harness/tool-cordis-contract`，慢层命令是 `pnpm turbo run test:slow --filter=@omne-harness/tool-cordis-contract`。turbo 先构建本包及其依赖，再运行本层测试。测试逐对核对键与类、`./cordis` 的导入图、清单依赖，并在真实 Cordis 4.0.4 下核对定义。`tests/registration-conformance.spec.ts` 自证登记套件：对守约替身全过，20 条用例各在一个只破坏一条规则的登记服务上失败。承载独立规则的断言都有违约变体，类型收窄的断言由编译器守护。逐断言的对应表见 [tests/README](tests/README.md#断言与违约变体的对应)。`ToolInstancesService` 目前只返回具名失败，测试只测这些失败。

## 维护

Service、键或事件变化时，继承或监听它们的插件都要同步：`tool-host-local`、各消费方的 Cordis 页和集成页。[docs/cordis.md](docs/cordis.md) 与键表测试要和源码一致。

## 目录结构与文档职责

```text
tool-cordis-contract/
├── README.md / README_ZH.md / index.md
├── SPEC.md
├── documentation.json / package.json
├── docs/                     README.md + index.md
│   ├── architecture.md
│   ├── flows.md
│   ├── object-model.md
│   ├── public-api.md
│   ├── context.md
│   └── cordis.md             服务定义、登记协议与装配规则
├── src/                      README.md + index.md + index.ts + cordis.ts + testing.ts
├── tests/                    README.md + index.md + 入口测试与类型测试
│   └── fixtures/             README.md + index.md
├── schema/                   README.md + index.md
├── verification/             README.md + index.md
│   ├── models/               README.md + index.md
│   └── proofs/               README.md + index.md
├── adr/                      README.md + index.md
├── examples/                 README.md + index.md
├── resources/                README.md + index.md
├── acceptance/               README.md + index.md
└── tsconfig.build.json / tsconfig.test.json / vitest.config.ts
```

完整文件导航见 [index](index.md)。主题职责见 [docs/README](docs/README.md)。

ToolRuntimeService 投影普通 invoke 及 queries、commands、instances、content 与 catalog，形状以 tool-contract 的 ToolRuntime 为准。受信 admission 和回应保留在 ToolCommandsService。本定义不增加提供者或生命周期保证。

`ToolResidencyReaderService` (`toolResidencyReader`) 提供持有者、租户与 shape 的分页引用查询，见[服务定义](src/cordis.ts)。
