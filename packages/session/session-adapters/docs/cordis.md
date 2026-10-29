# Cordis 集成

本页写本成员每个插件的 `inject`、提供的键、登记与撤除，以及它们怎样符合 IC 约定。行为归 [SPEC.md](../SPEC.md)。`session` 服务键、端口服务键与调用方类归 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md)。邻域的服务键归各自的 Cordis 定义。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)，本页不复制。

现状：`src/cordis.ts` 与 `src/index.ts` 只有模板标记。下文是 SPEC 固定的目标形状，不是源码事实。AD-01、AD-02、AD-05 与 Journal 提供者的非耐久实现在 `./testing`，它不经 Cordis 装配。

## 入口

- 根入口 `@omne-harness/session-adapters` 只导出翻译纯函数与它们用到的类型，不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。
- `@omne-harness/session-adapters/cordis` 导出全部插件、端口提供者子类与 `ContextBlocks` 增补。
- 本成员不定义新的服务键，也不增补新事件。每个端口提供者 `extends` 定义拥有者的抽象类，不另写键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。

## 插件、注入与提供的键

`session` 的对象形式 `inject` 写作 `session: { caller }`。它仍是必需依赖，值只是 intercept 配置（[session-cordis-contract 的调用方类](../../session-cordis-contract/docs/cordis.md#intercept-配置与调用方类)）。

| 插件 | `inject` | 提供的键 | 登记 |
| --- | --- | --- | --- |
| AD-01 Agent 提交参加者 | `session: { caller: 'coordinator' }` | 无 | 向执行记录提供者登记 Session 参加者，形状待 P-1 |
| AD-02 Agent 同日志解释 | `session: { caller: 'coordinator' }` | 无 | 不订阅事件。经本成员 Journal 提供者的 `output.read`、`output.events` 与 `load` 读同一会话日志 |
| AD-03 持有者与生产者 | `runtimeContext`（数组形式）；`session: { caller: 'coordinator' }` | 无 | `registerProducer` 的生产者登记，每个租户一份 |
| AD-03 回放子插件 | `session: { caller: 'reader' }` | 无 | 无 |
| AD-03 变化提醒子插件 | `runtimeContext: { consumer: 'model' }` | 无 | 模型类绑定读者 |
| AD-04 历史源 | `session: { caller: 'reader' }`，读 `readModelView`；下界子插件 `session: { caller: 'coordinator' }` | 无；取得方式待 NP-02 | 不登记 |
| AD-05 Model 日志消费适配 | `session: { caller: 'coordinator' }`。不注入 `modelRuntime`（[AD-05](../SPEC.md#ad-05)） | 无 | 不登记。经本成员 Journal 提供者读 `received` 条目与材料 |
| AD-06 Tool 消费适配 | `toolRuntime`；`session: { caller: 'coordinator' }` | 无 | 无 |
| AD-07 模型选择 | `modelProfiles`；`session: { caller: 'coordinator' }` | `agentModelSelection`（`extends ModelSelectionService`） | 服务提供 |
| AD-08 受理拓展点 | `session: { caller: 'intake' }` | 无 | 不登记，待 NP-07 |
| AD-09 身份桥 | 身份来源的服务 | `sessionIdentity` | 服务提供 |
| AD-10 证据桥 | 装配采用、生产来源与保管来源的服务 | `sessionEvidence` | 服务提供 |
| AD-11 空闲输入 | `modelRuntime`、`toolRuntime`；`session: { caller: 'maintainer' }` | `sessionIdleInput` | 服务提供 |
| AD-12 Context 输入 | `runtimeContext` | `sessionContextInput` | 服务提供 |
| AD-13 驻留读取 | `session: { caller: 'maintainer' }`，读 `references` | Tool 契约定义的键 | 不登记，待 P-8 |
| AD-13 驻留动作 | `session: { caller: 'coordinator' }` | Tool 契约定义的键 | 不登记，待 P-8 |
| AD-14 `AgentDrivePort` | `agentInstances`、`agentExecutionRecovery`；`session: { caller: 'coordinator' }` | `sessionAgentDrive` | 服务提供 |
| AD-15 `ScopeReleasePort` | `executionEnvironment: { caller: 'maintainer' }` | `sessionScopeRelease` | 服务提供；恢复授权由装配入口构造时交入 |
| AD-15 重新释放子插件 | `executionEnvironment: { caller: 'maintainer' }`；`session: { caller: 'maintainer' }` | 无 | 无；恢复授权由同一个装配入口交入 |
| AD-16 `ToolStartFencePort` | `toolStartAuthority` | `sessionToolStartFence` | 服务提供 |
| AD-17 `DeliveryReleasePort` | `modelRuntime`、`toolRuntime` | `sessionDeliveryRelease` | 服务提供 |
| Agent Journal 提供者 | 无邻域服务；与 Session 共用会话日志的提交状态 | `agentJournal`（`extends AgentJournalService`）；同一提供者兑现 `agentJournalEntries` 与 `agentMaterials` | 服务提供。生产插件未交付；非耐久替身是 `./testing` 的 `createMemorySessionJournal`（[SPEC](../SPEC.md#agent-journal-提供者与非耐久替身)） |

说明：

- 端口提供者的抽象类名为端口名加 `Service`，由 session-cordis-contract 定义。本成员的子类只实现方法。
- 一个插件只需要某个依赖完成一段工作时，用 `ctx.inject([...], cb)` 把这段放进子 fiber，不把整个插件挂在它上面（[IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)）。
- 构造依赖端口的提供者不调用 `session` 的写操作。它们只在 Session 的提交路径里被调用。

## 登记与撤除

本成员的登记都落在登记它的插件 fiber 上（[IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。

| 登记 | 怎样登记 | 撤除时 |
| --- | --- | --- |
| 端口服务提供 | 提供者子类随插件装载登记在本插件 fiber 上 | Session 一侧只有需要该端口的操作返回 `unavailable` 或保留任务。`sessionDeliveryRelease` 缺席时 `release` 保持 pending。事务端口不在本成员 |
| `session.modes` 生产者 | `registerProducer` 在 Runtime Context 服务方法里以 `this.ctx.effect` 登记，效应落在 AD-03 的 fiber。登记带调用方可信主体与租户，生产者槽是租户加块键，为每个租户分别登记 | 每个租户的句柄分别撤除。读取按缺项返回。重跑时新一代先登记，旧一代后撤除 |
| 模型类绑定读者 | `bind`，随变化提醒子插件 | 读者结束。下一次绑定取完整快照 |
| Session 参加者 | 向执行记录提供者的组合登记，形状待 P-1 | 执行记录提供者对未登记参加者的共同提交返回 `unsupported`，不保存任何一半 |
| 执行句柄 | 随 AD-14 的 fiber | 句柄丢弃。AD-02 不持有订阅：Agent 条目留在会话日志里，换代后从 `ExecutionRef.readThrough` 续读 |
| Journal 服务提供 | 提供者子类随插件装载登记在本插件 fiber 上 | 静态注入 `agentJournal` 的 Agent 插件随依赖撤除而卸载（[Agent 的 Cordis 页](../../../agent/agent-cordis-contract/docs/cordis.md)）。已提交的 Agent 条目与 Session 事实保留在会话日志里 |

撤除不撤回已提交的会话事实，也不撤回已交给邻域的确认、释放或外部效果。

## 依赖换代

| 依赖 | 换代时 |
| --- | --- |
| `session` 服务 | 插件体卸载再重跑。在途调用按原操作身份认回 |
| `runtimeContext` | AD-03 重跑，之后按 [1a](../SPEC.md#ad-03-1a) 在每个作用域第一次签发资格之前完成一次 RC-09 恢复会话 |
| `agentInstances`、`agentExecutionRecovery` | AD-14 丢弃旧句柄。之后的 `submit` 与 `control` 在句柄重建前返回 `unavailable` |
| `executionEnvironment` | AD-15 与它的重新释放子插件重跑。子插件经 `releasedScopes` 按页取得已归档会话的作用域，按原任务身份重新释放（[AD-15](../SPEC.md#ad-15)）。事务域目录缺席时报告不可用，下一轮重试 |
| `modelRuntime`、`toolRuntime`、`toolStartAuthority`、`modelProfiles` | 对应插件重跑。AD-17 换代期间端口缺席，`release` 保持 pending，由恢复协调按 `pending(release)` 找回后重发。AD-17 进程内的 Tool 释放操作引用随旧一代丢弃。失效任务留在会话日志里，由重放发现 |

## 配置

插件配置经 Standard Schema 校验，配置错误时插件加载失败（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。可调项是配置字段，默认值只是初值：

- AD-02：每次 `output.read` 读取的事件数上限。它不超过 Journal 提供者声明的上限。
- AD-02、AD-05、AD-06、AD-14、AD-15、AD-16、AD-17：邻域调用的超时与重试退避。
- AD-15 重新释放子插件：`releasedScopes` 的页大小与本轮失败后的重试退避。

运行时对象不进配置。恢复授权由装配入口在构造 AD-15 与它的重新释放子插件时交入（[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 端口提供者 `extends` 定义拥有者的抽象类，不写键 | 没有源码 |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口只有翻译纯函数 | 没有源码 |
| [IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5) 只依赖契约与服务定义 | 只导入 Session 与邻域的契约及服务定义 | 没有源码 |
| [IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)、[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9) 必需与可选依赖 | 插件工作所需的服务写进 `inject`；本成员不现取可选服务 | 没有源码 |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | 见[登记与撤除](#登记与撤除) | 没有源码 |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) 配置校验 | 见[配置](#配置) | 没有源码 |
| [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 运行时对象不进树 | 恢复授权由装配入口交入 | 没有源码 |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 作用域与租户 | 会话与租户是操作参数，不为会话建 fiber 或 isolate | 没有源码 |
| [IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19) 靠同进程成立的保证 | 执行句柄、上一份快照与 Tool 释放操作引用只在本进程有效，丢失时按 SPEC 重建或认回 | 没有源码 |

## 验证义务

本成员验证：根入口不导入 Cordis；每个插件以声明的调用方类调用；端口提供者不另写键；插件卸载后登记已撤除；依赖换代后插件重跑且在途调用按原身份认回。行为义务见 [SPEC 的组合与验证](../SPEC.md#组合与验证)。
