# @omne-harness/tool-host-local

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

单机 Tool 宿主。根入口导出本地启动协调器（[G5](../tool-contract/SPEC.md#342-契约缺口决定)）。宿主时钟（[G4](../tool-contract/SPEC.md#342-契约缺口决定)）、绑定登记表（[G7](../tool-contract/SPEC.md#342-契约缺口决定)）与 `./cordis` 上的 Cordis 插件尚未交付。

## 职责与状态

本包是 Tool 启动排序域的第一个提供者（契约 SPEC 的 P04 与决定 G5）。`createLocalStartCoordinator` 为一台机器上的一个进程实现 `ToolStartAuthority`。应用装配把它作为 `ToolDependencies.authority` 交给 `@omne-harness/tool` 的 `createToolRuntime`。

## 支持范围

检出范围和跨包总表见[工具执行组的支持范围](../README.md#支持范围)。本节只写本包的部分。验证范围只说明测试核对了什么，不说明测试范围之外的行为已成立。

| 档 | 本包的状态 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开类型已导出 | 已导出：`LocalStartCoordinatorInput`、`StartCoordinatorAccess`、`GuardResource`，以及 `startCoordinatorAdoption`、`START_COORDINATOR_OWNER` 与 `START_COORDINATOR_DOMAIN_KEY`。`./cordis` 入口不导出值 | 根入口 | `tests/public-entry.spec.ts` 核对根导出，并核对根入口的导入图不含 Cordis。`tests/cordis-entry.spec.ts` 核对 `./cordis` 不导出值 |
| 纯契约函数已实现 | 无。契约函数在 `tool-contract` | 无 | 无 |
| 独立执行已实现 | 无。它在 `tool` | 无 | 无 |
| runtime 已实现的路径 | 本包没有 runtime。它给 runtime 提供启动排序的提供者：`createLocalStartCoordinator` 实现 `ToolStartAuthority`，含许可、consume、inspect、invalidate 与 exclude，受理台账放在记录仓的 `host` 域。它为一台机器上的一个进程服务 | 根入口。应用装配把协调器作为 `ToolDependencies.authority` 交给 runtime | `tests/start-coordinator.spec.ts` 在 `@omne-harness/tool/testing` 的非耐久记录仓上核对协调器。`tests/start-composition.spec.ts` 在真实 Tool runtime、账本与推进协程下运行它，执行绑定用替身。`tests/start-authority-conformance.spec.ts` 对它运行 `tool-contract/testing` 的启动围栏套件，这是该套件目前唯一的真实实现对照。耐久性、进程崩溃与第二个进程都没有覆盖 |
| 尚未交付的宿主与提供者 | 宿主时钟（[G4](../tool-contract/SPEC.md#342-契约缺口决定)）。绑定登记表（[G7](../tool-contract/SPEC.md#342-契约缺口决定)）。`./cordis` 上的 Cordis 插件。跨进程的启动排序域。耐久记录仓提供者（[#280](https://github.com/nemori-ai/omne-harness-lite/issues/280)） | 无 | 无 |

## 使用

每个进程用账本所用的同一记录仓构造一个协调器：

```ts
const authority = createLocalStartCoordinator({
  store, // createToolLedger 也使用的 ToolLedgerStore
  access, // 回答主体与租户的 start 和 invalidate 资格
  guardsOf: request => [{ owner: 'permissions', resource: `${request.scope.owner}/${request.availability.definition.name}` }],
  commitAttempts: 8,
})
```

协调器不持有需要释放的资源，也不导入 Cordis。另一进程里使用同一记录仓的第二个协调器没有验证，所以不是受支持的装配。

## 契约

公开类型与 P04 协议归 [`@omne-harness/tool-contract`](../tool-contract/SPEC.md#p04-实际发起围栏)。[SPEC.md](SPEC.md) 说明本提供者在类型之外的行为：许可、受理、拒绝与失效的先后，台账不可读时的回复，以及租户检查。记录仓端口与 `host` 域归 [`@omne-harness/tool`](../tool/docs/public-api.md)。

## 设计

只有一个模块 [start-coordinator.ts](src/start-coordinator.ts)。每个操作在一个进程内串行区里读该租户的 `host` 域、做决定、按域修订号条件提交。记录有守卫修订号、每个启动的当前许可、受理、拒绝与排除标记。[docs/architecture.md](docs/architecture.md) 说明这些记录与先后。

## 配置与运行

全部输入由装配拥有。`guardsOf` 声明哪些守卫资源适用于一个请求，每个资源成为许可里的一个守卫，它的拥有者经 `invalidate` 使它失效。`commitAttempts` 限制修订冲突后的重读次数。没有默认值。

## 验证

`OMNE_TEST_TIER=fast pnpm --filter @omne-harness/tool-host-local test` 先构建再运行测试。测试核对非耐久记录仓上的协调器，以及真实 Tool runtime、账本与推进协程下的协调器。[tests/README](tests/README.md) 列出每项行为对应的测试。耐久性、进程崩溃与第二个进程都没有覆盖。

## 维护

契约的 `ToolStartAuthority` 或 P04 变化时，本协调器与其测试随之变化。`@omne-harness/tool` 的记录仓端口或 `host` 域变化时，这里的记录布局随之变化。构造协调器的应用装配随 `LocalStartCoordinatorInput` 变化。

## 目录结构与文档职责

固定目录按责任分开。目录存在不表示其中已有实现、Schema、模型、证明或验收能力。源码入口和包根 README 保留 `PACKAGE_TEMPLATE_DRAFT` 标记。其他骨架页保留占位标记，直到拥有者写入正文。

```text
tool-host-local/
├── README.md / README_ZH.md / index.md
├── SPEC.md
├── documentation.json / package.json
├── docs/                     README.md + index.md
│   ├── architecture.md
│   ├── flows.md
│   ├── object-model.md
│   ├── public-api.md
│   ├── context.md
│   └── cordis.md
├── src/                      README.md + index.md + index.ts + cordis.ts + start-coordinator.ts
├── tests/                    README.md + index.md + entry, coordinator and composition specs + values
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

本提供者的公共契约归契约包 [`@omne-harness/tool-contract`](../tool-contract/README_ZH.md)。完整文件导航见 [index](index.md)。主题职责见 [docs/README](docs/README.md)。
