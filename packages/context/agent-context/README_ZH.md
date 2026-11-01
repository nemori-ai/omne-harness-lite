# @omne-harness/agent-context

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Context 一侧的 Agent 适配集成成员，`service-provider` 变体。

## 职责与状态

本成员承载应用装配页的两行：`agent-account-outlet` 行提供 `agentAccountOutlet`，`agent-context` 行将提供 `agentRequests` 与 `agentModelContext`。服务定义归 [agent-cordis-contract](../../agent/agent-cordis-contract/README_ZH.md)，Context 一侧的端口归 [request-context-contract](../request-context-contract/README_ZH.md)。行与依赖见[应用装配](../../../docs/architecture/runtime/application-assembly.md#插件树)，适配方案见 [Context 的适配方案](../request-context-contract/docs/context.md#适配方案)。

状态：第一步，实现中。本包是 Agent 与 Request Context 之间的适配器，是 Context 组里唯一导入 Agent 契约的成员。

- 已实现：账目出站。`createAgentAccountOutlet` 把一份 Agent 账目交接译成一条账目事实交给收件口，收件结果按名映射。`absentAccountTarget` 是没有目标的解析器。`AgentAccountOutletProvider` 是提供 `agentAccountOutlet` 的 Cordis 插件。
- 已知限制（见 [SPEC](SPEC.md#已知限制)）：本波没有成员初始化账目投影（ACCT-INIT），也没有成员解析账目目标（ACCT-TARGET）。真实装配里 `deliver` 总是答 `unavailable`，诊断 `scope-unresolved`，不会答 `received`。
- 未实现：`agentRequests`、`agentModelContext` 与来源集合登记，等会话侧部件的形状。
- 已验证：出站在真实账目投影上通过 `AgentAccountOutlet` 的符合性套件；插件在真实 Cordis 4.0.4 上与真实 request-context 提供者一起装载与停止。见 [tests/](tests/README.md)。
- 未验证：真实装配里的账目投影、真实 Model 一侧的结果接收方、任何跨进程行为。

## 使用

独立使用需要一个 `ContextAccountingInbox`、发送方的采用身份与目标解析器：

```ts
import { absentAccountTarget, createAgentAccountOutlet } from '@omne-harness/agent-context'

const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: absentAccountTarget })
const outcome = await outlet.deliver({ access, handoff })
```

返回的出站不持有资源，无需释放。接入 Cordis 时，从 `@omne-harness/agent-context/cordis` 加载 `AgentAccountOutletProvider`，配置 `{ sender }`，它需要 `requestContext` 与 `contextAccountingInbox`。`./cordis` 入口不证明可独立安装。

## 契约

出站的行为见 [SPEC.md](SPEC.md)，公开定义的索引见 [docs/public-api.md](docs/public-api.md)。端口 `AgentAccountOutlet` 及其答复归 agent-contract，收件口与事实归 request-context-contract。

## 设计

出站先核调用的租户，再问目标解析器，再把一条事实交给收件口一次，调用之间不保存任何东西。见 [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md)、[docs/object-model.md](docs/object-model.md)。

## 配置与运行

插件配置只有一个字段 `sender`，是出站给每条事实的采用身份；不合的配置使加载失败。第一波传缺席解析器。工厂的调用方提供收件口、发送方与解析器。

## 验证

在本目录运行 `pnpm exec vitest run` 与 `pnpm run typecheck`。测试经构建产物导入所用成员，先构建依赖。覆盖：符合性套件、租户次序、缺席解析器、字段映射、结果映射、真实 Cordis 生命周期。不覆盖真实装配里账目投影的初始化。

## 维护

收件口、交接或服务键变化时，同步插件的 `inject`、SPEC 的映射表与测试。消费者是 Agent（经 `agentAccountOutlet`）与应用装配页。目标解析器有了真实提供者时，更新 SPEC 的已知限制。

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
