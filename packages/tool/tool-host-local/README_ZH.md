# @omne-harness/tool-host-local

[English](README.md)

单机 Tool 宿主。根入口提供启动协调器、时钟、绑定登记与 Catalog、作者装载及执行绑定工厂。`./author` 提供贡献与换代工厂，`./cordis` 提供作者宿主、绑定插件和运行时组合工厂。完整 runtime、真实存储和执行设施的生产组合由应用装配负责；本入口不宣称这些组合已经验证。

## 职责与状态

本包是 Tool 启动排序域的第一个提供者（契约 SPEC 的 P04 与决定 G5）。`createLocalStartCoordinator` 为一台机器上的一个进程实现 `ToolStartAuthority`。应用装配把它作为 `ToolDependencies.authority` 交给 `@omne-harness/tool` 的 `createToolRuntime`。

## 支持范围

检出范围和跨包总表见[工具执行组的支持范围](../README.md#支持范围)。本节只写本包的部分。验证范围只说明测试核对了什么，不说明测试范围之外的行为已成立。

| 档                   | 本包的状态                                                                                                                                                                                                                                                                                                                                                                                | 入口                                                                   | 验证范围                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公开类型与工厂       | 根入口提供启动、来源、守卫、装载及绑定工厂；作者与 Cordis 工厂使用独立入口                                                                                                                                                                                                                                                                                                                | 根入口、`./author`、`./cordis`                                         | 公开入口测试核对导出、普通入口不加载 Cordis、生产源码不导入 testing                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 纯契约函数已实现     | 无。契约函数在 `tool-contract`                                                                                                                                                                                                                                                                                                                                                            | 无                                                                     | 无                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 独立执行已实现       | 无。它在 `tool`                                                                                                                                                                                                                                                                                                                                                                           | 无                                                                     | 无                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| runtime 已实现的路径 | 本包通过 `createLocalToolRuntimePlugins` 提供六插件运行时组合。它的启动排序提供者`createLocalStartCoordinator` 实现 `ToolStartAuthority`，含许可、consume、inspect、invalidate 与 exclude，受理台账放在记录仓的 `host` 域。它为一台机器上的一个进程服务。已实现 P01 的失效与排除操作绑定：同输入认回首次证据，异输入答 conflict。每个成功的排除操作都绑定本次理由，包括对已排除调用的操作 | 根入口。应用装配把协调器作为 `ToolDependencies.authority` 交给 runtime | `tests/start-coordinator.spec.ts` 在 `@omne-harness/tool/testing` 的非耐久记录仓上核对协调器。`tests/start-composition.spec.ts` 在真实 Tool runtime、账本与推进协程下运行它，执行绑定用替身。`tests/start-authority-conformance.spec.ts` 对它运行 `tool-contract/testing` 的启动围栏套件，19 项一致性用例全部通过，无不适用项。套件核对 P01 冲突与同输入认回，包括 SA13、SA14。协调器测试还核对历史失效、排除别名、重建、完整守卫字段与租户隔离。这是该套件目前唯一的真实实现对照。耐久性、进程崩溃与第二个进程都没有覆盖 |
| 未覆盖的生产组合     | 真实 Windows/SQL 端到端验收、跨 executor 重装回退与跨进程启动                                                                                                                                                                                                                                                                                                                             | 应用提供受信端口                                                       | 工厂与真实 Cordis 测试不证明这些组合；缺能力明确失败关闭                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 环境调度与凭据

根入口另导出 `createLocalScheduledEnvironment` 和 `createLocalToolCredentials`。调度器通过环境四动词消费显式宿主策略，只在本进程记队列和名额。凭据适配器在受保护使用前重核实际存储绑定。提供者责任与限制见[公开接口](docs/public-api.md)。已分配获取的首次采用映射与真实 vault 尚未交付。

## 宿主时钟、绑定登记表、Catalog 与缺席端口

根入口另导出 `createLocalToolClock`（[G4](SPEC.md#宿主时钟g4)）、`createLocalToolBindingRegistry` 与 `createLocalToolCatalog`（[G7](SPEC.md#绑定登记表与换代协调者g7)）以及 `createAbsentToolPorts`（[D-07](SPEC.md#缺席端口d-07)）。时钟用单调读数与进程 epoch 计时，对另一个 epoch 的标记回复失败，不重新计满。登记表只经注入的来源核验放行贡献，未注入时 `register` 回复 `unavailable`。Catalog 只列出提问租户可访问的 live 贡献，不透露他租户是否登记过。缺席端口的每个方法回复具名 `unavailable`。限制：登记表只在进程内、不耐久；工作区层贡献对任何租户范围都不可见；生产的来源核验尚未提供。

验证范围，均为单进程并带测试替身（文件内已标明）：`tests/clock-conformance.spec.ts` 与 `tests/bindings-conformance.spec.ts` 运行契约套件 `toolClockConformance` 与 `toolBindingRegistryConformance`，没有不适用用例。`tests/clock.spec.ts`、`tests/catalog.spec.ts`、`tests/absent-ports.spec.ts` 检查本包自己的规则。`tests/runtime-composition.spec.ts` 证明 `createToolRuntime` 接受这些部件。本包现在提供执行绑定适配器；其单元与真实 Cordis 用例不替代完整 runtime/提供者符合性结论。

## 账本守卫

根入口另导出账本守卫的生产件（[TL-11](SPEC.md#账本守卫tl-11)）：`createLocalToolLedgerGuards`（组装八项守卫）、`createLocalInvocationSource`（来源签发器与来源守卫，绑定写进记录仓的 `host` 域）、`createLocalOperationIdentities`、`createLocalGrantVerifiers`（一个范围值，D1）、`createLocalStartGuard`、`createLocalTextResults`，以及常量 `localArgumentLimits`、`INVOCATION_SOURCE_DOMAIN_KEY` 与 `PROGRAMMATIC_NOT_IN_M2`。它们都是纯工厂。资格裁定、主体比较与主体编码以参数进入。`./cordis` 另提供 `createLocalToolRuntimePlugins`，把账本守卫与运行时阶段接到同一记录仓。应用负责提供受信身份、存储、环境及接收端口，见[运行时装配](docs/cordis.md#运行时组合工厂)。

验证范围：`tests/ledger-guards.spec.ts`、`tests/invocation-source.spec.ts`、`tests/grant-verifiers.spec.ts`、`tests/start-guard.spec.ts`。它们用 `tool` 的真账本与内存记录仓，资格用 `createTableToolAccess`，只证明单进程内的行为：跨租户拒绝且不读记录仓、来源认回与伪造、授予、启动守卫、文本结果、组装的必填项与预算。不证明耐久，也不证明资格真件。

## 使用

每个进程用账本所用的同一记录仓构造一个协调器：

```ts
const authority = createLocalStartCoordinator({
  store, // createToolLedger 也使用的 ToolLedgerStore
  access, // 回答主体与租户的 start 和 invalidate 资格
  guardsOf: request => [
    {
      owner: 'permissions',
      resource: `${request.scope.owner}/${request.availability.definition.name}`,
    },
  ],
  commitAttempts: 8,
})
```

协调器不持有需要释放的资源，也不导入 Cordis。另一进程里使用同一记录仓的第二个协调器没有验证，所以不是受支持的装配。

## 契约

公开类型与 P04 协议归 [`@omne-harness/tool-contract`](../tool-contract/SPEC.md#p04-实际发起围栏)。[SPEC.md](SPEC.md) 说明本提供者在类型之外的行为：许可、受理、拒绝与失效的先后，台账不可读时的回复，以及租户检查。记录仓端口与 `host` 域归 [`@omne-harness/tool`](../tool/docs/public-api.md)。

## 设计

启动协调器位于 [start-coordinator.ts](src/start-coordinator.ts)。每个操作在本租户的进程内串行区里读该租户的 `host` 域、做决定、按域修订号条件提交。记录有守卫修订号、失效操作、排除操作、每个启动的当前许可、受理、拒绝与排除标记。操作记录保留输入绑定与首次证据，后续操作或重建协调器不改变该绑定。操作记录与业务变化在同一域中共同提交。[docs/architecture.md](docs/architecture.md) 说明这些记录与先后。

## 配置与运行

全部输入由装配拥有。`guardsOf` 声明哪些守卫资源适用于一个请求，每个资源成为许可里的一个守卫，它的拥有者经 `invalidate` 使它失效。`commitAttempts` 限制修订冲突后的重读次数。没有默认值。

## 验证

在仓库根使用 Node.js 24 或更高版本和 pnpm 10.28.1。准备一次 workspace 依赖后，构建并运行本成员检查：

```sh
pnpm --workspace-concurrency=1 --filter @omne-harness/tool... --filter @omne-harness/tool-host-local... -r run build
pnpm --filter @omne-harness/tool-host-local run typecheck
pnpm --filter @omne-harness/tool-host-local run test
```

两个成员命令应以 0 退出。找不到模块或声明时，先在本检出准备依赖并构建。非法 `commitAttempts` 在构造时抛错。资格或记录仓不可读时返回具名失败，不能当作启动已确认，详见 [失败行为](SPEC.md#6-身份租户与失败)。

普通调用、分页与交付解除的教学见 [Tool 教程](../tool/examples/README.md)。该教程使用内存 start authority。本包测试在非耐久记录仓上验证真实本地协调器，两类证据分别说明范围。二者均不提供生产宿主、耐久恢复或真实 Agent/Session 接入。

`pnpm turbo run test --filter=@omne-harness/tool-host-local` 先构建本包及其依赖，再运行测试。测试核对非耐久记录仓上的协调器，以及真实 Tool runtime、账本与推进协程下的协调器。[tests/README](tests/README.md) 列出每项行为对应的测试。耐久性、进程崩溃与第二个进程都没有覆盖。

## 维护

契约的 `ToolStartAuthority` 或 P04 变化时，本协调器与其测试随之变化。`@omne-harness/tool` 的记录仓端口或 `host` 域变化时，这里的记录布局随之变化。构造协调器的应用装配随 `LocalStartCoordinatorInput` 变化。

## 目录结构与文档职责

固定目录按责任分开。目录存在不表示其中已有实现、Schema、模型、证明或验收能力。根入口已交付本地启动协调器。`./cordis` 已提供作者宿主与绑定插件，采用范围见 docs/cordis.md。骨架页保留占位标记，直到拥有者写入正文。

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
├── src/                      README.md + index.md + index.ts + start-coordinator.ts
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
│   └── fixtures/             README.md + index.md
└── tsconfig.build.json / tsconfig.test.json / vitest.config.ts
```

本提供者的公共契约归契约包 [`@omne-harness/tool-contract`](../tool-contract/README_ZH.md)。完整文件导航见 [index](index.md)。主题职责见 [docs/README](docs/README.md)。

runtime 组合测试以 invoke 提交普通 payload，并配对来源签发器与核验器。测试宿主向 driver.run 显式提供 instance。本包不提供生产实例宿主、来源或身份签发器、claim 及接管协议。见 [SPEC 的宿主边界](SPEC.md#实例宿主与普通调用的边界)。

### 构造目录

`createLocalToolCatalog` 必须提供 registry、availability、view 与 search。
应用注入 `LocalToolCatalogViewSource`，给出受信范围证据、纳入版本，以及带 resident 标记的精确绑定键。
view 为 null 时返回 unavailable。search 显式配置，例如 `{ k1: 1.2, b: 0.75, maxCachedCorpora: 8 }`。

目录只对合法语料做 BM25 排名，在异步判断后重读视图。
搜索条件或披露材料变化会使游标失效。有界缓存只保存文本索引。
完整行为与限制见[实现范围](SPEC.md#登记表与-catalog-的实现范围)。

### 可信单目标转发

`createLocalInvocationSource` 可配置 `forwarding: { authority, isParent }`。这是受信提供者配置。来源暴露 forwarding、recoverBinding 与 receiver，普通调用不能自报保留的 forwarding consumer。运行时插件工厂提供惰性 forwarding()，并在 facade 内注册专属 receiver。

`createLocalToolForwarding` 接收惰性 runtime、catalog、consumer profile、目标 prepare 和 reader。把 bind 交给执行绑定的可选 capability 接缝。提供者退出时等待 close，并核对返回的 unknown 数。父调用结束不取消已固定目标。host known-call 容量至少为 2，资源并发仍可为 1。

精确行为和验证边界见[成员规格](SPEC.md#单目标转发来源与保管)。programmatic 启动和全局重启发现保持既有限制。内存存储上的协议测试不能证明耐久性。

`ToolHostAccess.request` 可选配置当前目标策略 `ToolRequestAccess`。装配将其作为 requestAccess 传给 start guard 与 coordinator。配置后每次 prepare 和 consume 尝试都重问策略。不可用或坏答复不能授予启动资格。精确结果见[目标请求当前资格](SPEC.md#目标请求当前资格)。
