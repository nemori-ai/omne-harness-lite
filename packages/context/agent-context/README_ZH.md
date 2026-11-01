# @omne-harness/agent-context

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Context 一侧的 Agent 适配集成成员，`service-provider` 变体。

## 职责与状态

本成员承载应用装配页的两行：`agent-account-outlet` 行提供 `agentAccountOutlet`，`agent-context` 行提供 `agentRequests` 与 `agentModelContext`。服务定义归 [agent-cordis-contract](../../agent/agent-cordis-contract/README_ZH.md)，Context 一侧的端口归 [request-context-contract](../request-context-contract/README_ZH.md)。行与依赖见[应用装配](../../../docs/architecture/runtime/application-assembly.md#插件树)，适配方案见 [Context 的适配方案](../request-context-contract/docs/context.md#适配方案)。

状态：第二步，实现中。本包是 Agent 与 Request Context、Runtime Context 之间的适配器，是 Context 组里唯一导入 Agent 契约的成员。它不导入 session-adapters：会话侧部件经键 `contextHolderSources`（K-RQ）到达，读取资格经 `runtimeContextReaderEligibility`（K-RC）到达。

- 已实现：账目出站。`createAgentAccountOutlet` 把一份 Agent 账目交接译成一条账目事实交给收件口，收件结果按名映射。`absentAccountTarget` 是没有目标的解析器。`AgentAccountOutletProvider` 是提供 `agentAccountOutlet` 的 Cordis 插件。
- 已知限制（见 [SPEC](SPEC.md#已知限制)）：本波没有成员初始化账目投影（ACCT-INIT），也没有成员解析账目目标（ACCT-TARGET）。真实装配里 `deliver` 总是答 `unavailable`，诊断 `scope-unresolved`，不会答 `received`。
- 已实现：请求准备与可读上下文读取。`createAgentRequests` 把 `prepare`、`derive`、`resume` 译成 Request Context 的调用，把每次调用的组值放进暂存表，并在目标的第一次调用时登记来源集合。`createAgentModelContext` 读取模型可读的 Runtime Context，完整或增量，块材料只在进程内。`createContextMaterials` 是两者共用的材料库。`AgentContextProvider` 是在同一 fiber 里提供两个服务的 Cordis 插件。
- 第二步的已知限制：组四的定义采用与工作区选择交 `null`（ASSEMBLE-CONTEXT-NULL）。压缩路径只在同一实例内走得通，本波 `derive` 读不到步骤结果（COMPACTION-PATH）。model-cordis-contract 交付键之前，插件按键名 `modelPreparationResources` 注入 Model 准备资源（X3-KEY）。`ready` 的结果容量取插件配置（RESULT-CAPACITY）。
- 已验证：出站在真实账目投影上通过 `AgentAccountOutlet` 的符合性套件。请求准备在真实的 Request Context 登记表与默认策略上运行，固定请求通过 Model 请求准备替身，第二轮带 `lineage.continues`。读取在真实的 Runtime Context 机制上运行。两个插件在真实 Cordis 4.0.4 上装载与停止，K-RQ 的持有者替身在结算之后才关读口。见 [tests/](tests/README.md)。
- 未验证：真实装配里的账目投影、真实 Model 一侧的结果接收方、真实的 K-RQ、K-RC 与 X-3 提供者、带块的 Runtime Context 读取、任何跨进程行为。

## 使用

独立使用需要一个 `ContextAccountingInbox`、发送方的采用身份与目标解析器：

```ts
import { absentAccountTarget, createAgentAccountOutlet } from '@omne-harness/agent-context'

const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: absentAccountTarget })
const outcome = await outlet.deliver({ access, handoff })
```

返回的出站不持有资源，无需释放。接入 Cordis 时，从 `@omne-harness/agent-context/cordis` 加载 `AgentAccountOutletProvider`，配置 `{ sender }`，它需要 `requestContext` 与 `contextAccountingInbox`。`./cordis` 入口不证明可独立安装。

请求准备与可读上下文读取共用一个材料库：

```ts
const materials = createContextMaterials({ owner, capacity: 256 })
const reader = createAgentModelContext({ materials, parts, eligibility, runtimeContext })
const requests = createAgentRequests({
  materials,
  parts,
  requestContext,
  preparation,
  conversions,
  model,
  resultCapacity,
  tools: firstWaveTools,
  stepResults: absentStepResults,
})
```

停止时调用 `requests.close()`，把它的结算交给部件的持有者，再调用 `materials.close()`。接入 Cordis 时加载 `AgentContextProvider`，配置 `{ owner, resultCapacity }`。它需要六个键：`requestContext`、`contextHolderSources`、`runtimeContextReaderEligibility`、`runtimeContext`、`modelRequestPreparation` 与 `modelPreparationResources`。见 [docs/context.md](docs/context.md) 与 [docs/cordis.md](docs/cordis.md)。

## 契约

三个出口的行为见 [SPEC.md](SPEC.md)，公开定义的索引见 [docs/public-api.md](docs/public-api.md)。端口及其答复归 agent-contract。收件口、事实、来源集合与操作组归 request-context-contract。K-RQ 与 K-RC 归 Context 组的两个 Cordis 契约成员。字段对应归 [Context 的适配方案](../request-context-contract/docs/context.md#适配方案)。

## 设计

出站先核调用的租户，再问目标解析器，再把一条事实交给收件口一次，调用之间不保存任何东西。请求准备先核本包证据的租户，经持有者解析历史依据，把本次的组值放进暂存表，再问 Request Context。读取按执行挂接保存最近一次完整读取的材料，只在进程内。见 [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md)、[docs/object-model.md](docs/object-model.md)。

## 配置与运行

出站插件的配置只有一个字段 `sender`，是出站给每条事实的采用身份。上下文插件的配置有 `owner`、`resultCapacity` 与可选的 `materials` 容量（初值 256）。不合的配置使加载失败。第一波传缺席解析器、第一波的工具规则与缺席的步骤结果读口。

## 验证

在本目录运行 `pnpm exec vitest run` 与 `pnpm run typecheck`。测试经构建产物导入所用成员，先构建依赖。覆盖：出站的各项用例，`prepare` 的四种结局，第二轮的 lineage，组与令牌，暂存表，登记，失败类别，压缩的核对，完整与增量读取，证据的可解析范围，拒绝，两个插件的真实 Cordis 生命周期。不覆盖真实装配里账目投影的初始化与真实的会话侧提供者。

## 维护

端口、字段对应或服务键变化时，同步插件的 `inject`、SPEC 的映射表与测试。model-cordis-contract 交付 X-3 的键之后，用它的常量代替 `MODEL_PREPARATION_RESOURCES`。消费者是 Agent（经三个键）与应用装配页。目标解析器有了真实提供者时，更新 SPEC 的已知限制。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、运行时校验与内部实现
tests/                    持续测试；fixtures/ 存放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 存放验收输入
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。docs 专题可以升级为同名目录，目录内须有 README.md 与 index.md；专题移动时同步本结构图。
