# @omne-harness/session-adapters 行为规格

状态：适配成员，`draft`，技术设计已接受（[采用记录](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6562280172)），AD-08、AD-10 常驻工具部分仍为候选，AD-01、AD-02、AD-05 的同日志行为与 Agent Journal 提供者由 `./testing` 内存提供者实现。会话日志 Journal 的生产提供者 `createSessionLogJournal`（`src/cordis/agent-journal.ts`）与 AD-01 对应表已实现。提供 `agentJournal` 的 Cordis 插件 `SessionLogAgentJournalProvider`（`src/cordis/agent-journal-provider.ts`）已实现，经 `./cordis` 导出。AD-02 的生产插件 `createSessionJournalInterpretationPlugin`、AD-05 的生产插件 `createSessionModelLogConsumptionPlugin` 与 AD-06 的生产插件 `createSessionToolLogConsumptionPlugin` 已实现，见[生产提供者的实现现状](#生产提供者的实现现状)与[插件清单](#插件清单)；其余候选插件仍未交付。`./testing` 的会话事务替身还实现 `SessionTransactionPort` 的 `queryControlOperation`、`readModelSelection` 与 `commitEntries`，见[会话事务端口的契约面](#会话事务端口的契约面)。内存实现不证明耐久、跨进程或完整生产运行组合。本成员是 Session 组里唯一导入邻域契约的成员。它把 Session 的命令、端口与事实翻译成邻域公开契约里的操作，也把邻域交来的调用翻译成 Session 的命令。治理规则不在本页。

## 范围与依据

本成员拥有三类东西：

1. 入站适配插件。邻域按自己的契约调用它们，或它们读取邻域的输出，再以 Session 的命令写入会话事实。
2. 构造依赖端口与出站端口的实现。端口接口归 [session-contract](../session-contract/SPEC.md#构造依赖端口与出站端口)，服务键归 [session-cordis-contract](../session-cordis-contract/docs/cordis.md#端口服务键)，本成员只提供实现。
3. 翻译。名称与形状的翻译只在本成员发生，见 Session 契约的[五个锚点](../session-contract/SPEC.md#五个锚点)第 2 条。`session.modes` 的翻译表在本页的[模式翻译表](#模式翻译表)。

本页依据下列已冻结或现行的正文。本页只细化适配，不削弱它们。

| 依据 | 位置 |
| --- | --- |
| 会话的命令、端口、共同提交与条款 | [session-contract SPEC](../session-contract/SPEC.md)，含[常驻工具与会话冻结](../session-contract/SPEC.md#常驻工具与会话冻结)一节 |
| 服务键、调用方类与依赖分类 | [session-cordis-contract 的 Cordis 定义](../session-cordis-contract/docs/cordis.md) |
| Agent | [提交参加者协议](../../agent/agent-contract/SPEC.md#提交参加者协议)、[托管协调与运行实例](../../agent/agent-contract/SPEC.md#托管协调与运行实例)、[事件流与读取](../../agent/agent-contract/SPEC.md#事件流与读取)、[模型选择](../../agent/agent-contract/SPEC.md#模型选择)、[Agent 的 Cordis 定义](../../agent/agent-cordis-contract/docs/cordis.md) |
| Model | [资格、共同提交与实际发送](../../model/model-contract/SPEC.md#资格共同提交与实际发送)、[消费者 owner 的装配声明](../../model/model-contract/docs/public-api.md#消费者-owner-的装配声明)、[ACK 的前提与效果](../../model/model-contract/SPEC.md#ack-的前提与效果) |
| Tool | [P04 实际发起围栏](../../tool/tool-contract/SPEC.md#p04-实际发起围栏)、[可靠交接与处理的两条路径](../../tool/tool-contract/SPEC.md#可靠交接与处理的两条路径)、[Tool 的 Cordis 定义](../../tool/tool-cordis-contract/docs/cordis.md) |
| Runtime Context | [RC-02](../../context/runtime-context-contract/SPEC.md#rc-02-块声明注册与参数)、[RC-04](../../context/runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料)、[RC-06](../../context/runtime-context-contract/SPEC.md#rc-06-需要绑定与读者形状)、[RC-07](../../context/runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复)、[RC-09](../../context/runtime-context-contract/SPEC.md#rc-09-作用域结束恢复会话与恢复后供值) |
| Request Context | [历史源读口与 epoch 视图](../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图)、[RQ-06](../../context/request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界) |
| 执行环境 | [拒绝原因](../../execution/execution-environment-contract/SPEC.md#拒绝原因)、[恢复](../../execution/execution-environment-contract/SPEC.md#恢复) |
| 集成规则 | [IC 约定](../../../docs/architecture/cordis-integration-conventions.md) |

<a id="ad-00"></a>

### AD-00 全部插件的共同规则

1. 每个插件只以一个调用方类调用 `session` 服务。一项适配需要两个调用方类时，拆成两个插件。调用方类按操作授权，核对见 [Cordis 定义](../session-cordis-contract/docs/cordis.md#intercept-配置与调用方类)。
2. 插件只经邻域的公开契约与服务定义工作，不导入邻域的提供者实现（[IC-5](../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。本页只用邻域契约已有的操作名。邻域缺少的能力写成[具名前提](#具名前提与明确缺项)，不由本成员发明。
3. 邻域正文不因本成员而点名 Session。邻域只看到通用角色：外部协调者、提交参加者、消费者拥有者、作用域持有者、历史持有者、维护者。
4. 每次出站调用与每次 Session 命令都带 [OP-00](../session-contract/SPEC.md#op-00) 派生的身份。本成员把 Session 的身份确定地编码为邻域的操作身份，不另存映射，不用时间、随机数或连接参与编码。生产者交付解除的身份与认回归生产者自己：生产者收到 saved 后自己解除，结果接收方只返回 saved。本成员不维护另一份释放操作映射。
5. 租户是每次调用的参数（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。插件不从 Cordis 上下文、isolate 或安装者推断租户。
6. 未知保持未知。邻域返回结果未知时，插件按原身份查询或把未知原样交给 Session，不改写为成功或失败。邻域的拒绝只在下文写明的对应里成为 Session 的拒绝。其他拒绝按依赖不可用处理并报告，不变成业务拒绝。
7. 插件不保存业务事实。插件只持有可丢的派生物：活体句柄、订阅、上一份已过滤快照与缓存。派生物丢失时，插件从 Session 的权威读或邻域的公开读重建，不补造事实。
8. 外部效果不因插件卸载而撤回。卸载只结束订阅、登记与在途等待。

## 结果与不变量

### 插件清单

「方向」中的入站指邻域调用本成员或本成员读取邻域输出，出站指 Session 经出站端口调用邻域。「调用方类」是插件调用 `session` 服务时的 intercept 配置。

| 编号 | 插件 | 方向 | 提供的键 | 调用 `session` 的调用方类 | 邻域操作 | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- |
| [AD-01](#ad-01) | Agent 提交参加者 | 入站 | 无；参加者登记见 AD-01 | `coordinator` | Session 自有日志提交内的 CallerCommit 与只读核对 | `./testing` 内存提供者已实现四种 CallerCommit 与 open、submit、attach、tryFinish 的只读核对。attach 按 [PA-01](../session-contract/SPEC.md#pa-01) 第 3 条核对普通推进与取消收束，取消收束含 SE16 条件。tryFinish 含 [PA-02](../session-contract/SPEC.md#pa-02) 的取消分支。judge-cancellation 的判断输入带 Session 的参加者事实。生产提供者经 `session` 参加者在同一次存储提交里核对与参加（[生产提供者的实现现状](#生产提供者的实现现状)）；按 Cordis 插件登记未交付 |
| [AD-02](#ad-02) | Agent 同日志解释 | 入站 | 无 | `coordinator` | AgentJournal.load；同提供者 output.read/events | `./testing` 内存提供者已实现。生产插件 `createSessionJournalInterpretationPlugin` 已实现（`src/cordis/journal-interpretation.ts`，[实现现状](#ad-02-生产插件)），订阅 `session-adapters/agent-published`，经 `commitLog` 提交；在真实 Cordis 与 node:sqlite 替身上验证。控制事件是延后事实，后果由 Session 在解释提交时定（[控制归一](#控制归一)） |
| [AD-03](#ad-03) | Runtime Context 持有者与 `session.modes` 生产者 | 入站 | `runtimeContextReaderEligibility`（K-RC），由持有者插件提供 | 回放子插件与事实插件的历史子插件为 `reader`；持有者插件与事实插件注入 `session` 而不调用它 | `prepareRegistration`、`issueEligibility`、`revokeEligibility`、`applyCommit`、`registerProducer`、`bind`、`changes`、`diffForReminder` | 回放子插件 `session-ad03-replay`、持有者插件 `session-ad03`、事实插件 `session-ad03-facts` 及其历史子插件 `session-ad03-facts-history` 已实现（`src/cordis/context-holder.ts`），在真实 Cordis 上对 Runtime Context 内存替身验证。`replayFacts` 由事实插件回答，交给 `createSessionRuntimeContextTrust`；事实插件另以 `sessionScopeLookup` 回答作用域的归属（R2-D14）。作用域绑定从 SE27、SE28 窄读取，不读 `WorkSnapshot`（SCOPE-NARROW）。条目到提交输入的翻译协议由 AD-12 的 `createSessionContextTranslation` 交付，装配经入参 `translation` 交入。`session.modes` 生产者与变化提醒子插件未交付。`./cordis` 导出由集成方合入。见 [AD-03 的实现现状](#ad-03-的实现现状) |
| [AD-04](#ad-04) | Request Context 历史来源 | 入站 | `contextHolderSources`（K-RQ），由历史源子插件提供 | 历史源子插件为 `reader`；下界子插件为 `coordinator` | HistorySource.read/compactionContext；会话侧四个部件经 K-RQ 租借给 agent-context，AD-04 自己不调用 `register`/`replace` | 两个子插件已实现（`src/cordis/history-source.ts`），在真实 Cordis 上对本成员的内存会话验证，K-RQ 套件通过。历史依据解码与固定请求事实由装配交入，真实提供者未交付。`./cordis` 导出由集成方合入。见 [AD-04 的实现现状](#ad-04-的实现现状) |
| [AD-05](#ad-05) | Model 日志消费适配 | 入站 | 无 | `coordinator` | Agent Journal 的结果与账目读取；`sessionTransactions.commitEntries` | `./testing` 内存提供者已实现。生产插件 `createSessionModelLogConsumptionPlugin` 已实现（`src/cordis/model-log-consumption.ts`，[实现现状](#ad-05-生产插件)），订阅 `session-adapters/agent-published` 自动消费，在真实 Cordis 上装载与停止已验证；`./cordis` 导出由集成方合入。缺 `agentMaterials` 提供者时停在 `PENDING`（生产提供者插件已兑现该键，见 Journal 提供者一行）。Model ACK 到达未决 |
| [Journal 提供者](#agent-journal-提供者与非耐久替身) | Agent Journal 提供者 | 入站 | `agentJournal`；同一提供者兑现 `agentJournalEntries` 与 `agentMaterials` | 不调用 `session`；`inject` `sessionAccessCheck`、`storage` 与受信 `tenantDomainLookup`；与 Session 共用会话日志的提交状态 | AgentJournal、AgentJournalEntries、AgentMaterials | 非耐久替身 `createMemorySessionJournal`（`./testing`）已实现。生产提供者 `createSessionLogJournal` 按会话给出三个端口。插件 `SessionLogAgentJournalProvider` 在同一插件体内提供 `agentJournal`、`agentJournalEntries` 与 `agentMaterials`，三者出自同一会话日志 Journal，经 `./cordis` 导出。Journal 与 entries 按租户与 execution 路由到会话；`materials.read` 按材料来源所记的会话路由；`materials.preserve` 不带 execution 也不带会话，存储里没有从 consumer 到会话的索引，答 `unavailable` 且不写入 |
| [AD-06](#ad-06) | Tool 日志消费适配 | 入站 | 无 | `coordinator` | 同一 AgentJournal 的 entries/results 与 AgentMaterials 读取；`receive(execution/account)` | 生产插件 `createSessionToolLogConsumptionPlugin` 已实现（`src/cordis/tool-log-consumption.ts`），经 `sessionTransactions.commitEntries` 在 `tool-received` 通道提交，订阅 `session-adapters/agent-published` 自动消费（与 AD-05 共用 `subscribePublished`，输入给了 `coordinator` 时才订阅），在真实 Cordis 上对本成员 `./testing` 内存提供者验证（`tests/tool-log-consumption.spec.ts`）。Tool 交付材料的读法由装配交入；没有已采用的 schema（[TOOL-SETTLEMENT-SCHEMA](../../../docs/architecture/runtime/application-assembly.md#tool-settlement-schema)）时 Tool 条目答 `unavailable` 并保留。行 `session-ad06` 进应用 `./cordis` 桶由集成方合入 |
| [AD-08](#ad-08) | 受理拓展点接入 | 入站 | 无 | `intake` | 命令域与 hooks 的公开入口 | 待 [NP-07](#np-07) |
| [AD-09](#ad-09) | 身份桥 | 构造依赖 | `sessionIdentity` | 不调用 | identity 的 `PrincipalVerifier.verify`（服务键 `principalVerifier`） | 生产插件 `SessionIdentityBridgeProvider` 已实现（`src/cordis/identity-bridge.ts`），在真实 Cordis 上装载与停止已验证；`./cordis` 导出由集成方合入。装配用进程内核验器时只在同一进程内成立 |
| [AD-10](#ad-10) | 证据桥 | 构造依赖 | `sessionEvidence` | 不调用 | `sessionAdoptionSource`、`sessionProductionSource`、`sessionCustodySource` 三个窄来源端口 | 生产插件 `SessionEvidenceBridgeProvider` 已实现（`src/cordis/evidence-bridge.ts`），对三个来源的替身在真实 Cordis 上装载与停止已验证，未对真实来源运行；`./cordis` 导出由集成方合入。常驻工具部分待 [P-8](../session-contract/SPEC.md#具名前提与明确缺项) |
| [AD-11](#ad-11) | 空闲输入 | 构造依赖 | `sessionIdleInput` | `maintainer` | 子会话读取；`calls.inspect`、`queries.lookup` | 可登记 |
| [AD-12](#ad-12) | Context 输入 | 构造依赖 | `sessionContextInput` | 不调用 | `prepareRegistration`、`NeedBinding` | 生产插件 `createSessionContextInputPlugin` 与翻译协议 `createSessionContextTranslation` 已实现（`src/cordis/context-input.ts`），对 Runtime Context 内存替身在真实 Cordis 上装载与停止已验证；`./cordis` 导出由集成方合入 |
| [AD-14](#ad-14) | `AgentDrivePort` | 出站 | `sessionAgentDrive` | 不调用；读运行与输入为 `coordinator` | `agentInstanceProvision.acquire`、`agentInstances.resolve`、`invoke`、`resume`、`input.submit`、`agentExecutionControl.control`、`agentExecutionRecovery.query`、`load`、`detach` | 生产插件 `createSessionAgentDrivePlugin` 已实现（`src/cordis/agent-drive.ts`），对 Agent 替身在真实 Cordis 上装载与停止已验证，未对 Agent 宿主真件运行；`./cordis` 与根入口的导出由集成方合入。`recordResult` 待 [NP-04](#np-04)；`prewarm` 不调用 |
| [AD-15](#ad-15) | `ScopeReleasePort` | 出站 | `sessionScopeRelease` | 端口实现不调用；重新释放子插件为 `maintainer` | `executionEnvironment.releaseScope`；`releasedScopes` | 可登记 |
| [J06 提供者](#j06-会话路径的两个-agent-提供者) | 消息准入与当前条件 | 入站 | `agentMessageHandoff`、`agentConditions`，各一个插件 | `coordinator`；访问检查见 J06 | MessageHandoff.prepare、lookup、exclude；CurrentConditions.read | 两个生产插件已交付；当前条件是最小实现（R2-D145） |
| [显示适配](#实时显示适配) | 实时流显示 | 观察 | 无 | 读取关联时为 `reader` | 公共 StreamObserver.observe 与 StreamFrame | 只规定消费行为；生产插件未交付 |

「可登记」只说明邻域一侧的入口已经存在。它不表示已经实现或验证。

### 入站插件

<a id="ad-01"></a>

#### AD-01 Agent 提交参加者

- 注入：`session`，调用方类 `coordinator`。
- 提供：参加 Session 自己的日志提交。AgentJournal 提供者与 Session 参加者共用一个发布边界，不另接一个执行记录事实库。首次发布共同保护 Agent 原事实、适用的四种 CallerCommit 参加事实与 Agent 原操作答案。received 的完整材料、消费绑定与 saved 也在其原提交中共同可见。打开、挂接、交入与条件终结的 Session 参加只读核对，并在发布时复核修订。SE14/18/19/22/25/26 等后续解释及其进度不属于此批，按 AD-02 另笔提交。首次发布前失败该批全无，发布后丢答复按 Agent 原操作认回。原有四种交接翻译如下。
- 参加种类：本插件只声明 `message`、`context-transition`、`custody`、`processed` 四种（[PA-04](../session-contract/SPEC.md#pa-04)）。装配用它比对执行记录提供者的 `capabilities.participants`。
- 协调模式：会话日志一侧的执行记录提供者是 Agent 的 coordinated Journal 绑定，`capabilities.coordination` 为 `coordinated`，装配配置 `coordination` 与之相等（Agent SPEC 的[提交参加者协议](../../agent/agent-contract/SPEC.md#提交参加者协议)）。coordinated 绑定须在 `open`、`attach`、`submit` 与 `tryFinish` 四处完成协调核对，核对见下表。`attach` 的 Session 核对覆盖当前外部资格、原关联与适用推进资格效果；恢复或接管条件由 Agent 按主体核验，本插件不判断。

调用方交接到 Session 命令的翻译：

| Agent 的 `CallerCommit` | Session 命令 | 翻译的材料 |
| --- | --- | --- |
| `message` | `recordMessage` | 执行身份、提交种类、消息、来源与准入证据，以及本次写入的修订与回执（[P-2](../session-contract/SPEC.md#具名前提与明确缺项)） |
| `context-transition` | `commitDerived(compaction)` | 压缩记录（`covers`、`retained`、`derivation`）与转换证据。`judgeCompaction` 在 Session 的命令处理里执行 |
| `custody` | `preserveResult` | consumption、`ProducedResult` 与保管证据 `retained` |
| `processed` | `completeConsumption` | consumption、`ProducedResult` 与完成依据 `completion` |
| `none`，且这次 `commit` 以 `handoff.resolve` 应用 model-reply 来源的 prepared 结果（主回复的 Ja） | `recordMessage` | 同 `message` 一行。消息是 prepared 结果的确切消息，来源是原准入记录 `outcome.record`，准入证据是 prepared 结果的 `admission`。Agent SPEC 的[真实历史的提交点](../../agent/agent-contract/SPEC.md#真实历史的提交点)规定主回复的历史是 Journal 历史组合的核心义务，入口是 replyAdmission，不转换为 CallerCommit.message，与 `message` 交接共用同一个写者。rejected 的结果不写消息 |
| 其余的 `none` | 不参加 | 无 |

只读核对：

| Agent 的提交 | 核对 | 条款 |
| --- | --- | --- |
| `open`（经 `invoke` 发起） | 来源依据是 SE13 回执 | [PA-01](../session-contract/SPEC.md#pa-01) 第 1 条 |
| `submit` | 来源依据是该输入的 SE11 回执 | [PA-01](../session-contract/SPEC.md#pa-01) 第 2 条 |
| `attach`（经 `resume` 发起） | 来源依据是推进资格依据所指 attempt 的 SE15 回执，经 attach 输入的 `grant` 到达，分普通推进与取消收束两种情形 | [PA-01](../session-contract/SPEC.md#pa-01) 第 3 条 |
| `tryFinish` | 以 `judgeCompletion` 核对待交输入与取消 | [PA-02](../session-contract/SPEC.md#pa-02) |
| `commitSettlement` 的 judge-cancellation | 以 `judgeCompletion` 读本 execution 所属的 Run，构造 Session 的 `TerminalParticipantFact`，作为判断输入的参加者事实。allowed 记 ready。blocked 记 blocked，类别为 inputs，依据为第一项待交输入的 SE11 依据。cancelled 而 SE26 引用的控制等于判断的取消控制时记 ready，不等时记 changed。其他终态记 changed。读取失败记 unknown。事实的协议 Adoption 是本绑定自定的 `pa-02-terminal-participation`，对应 session-contract 的 PA-02，`purpose` 是本绑定的 judge-cancellation 用途依据。取消路线上的 tryFinish 重读同一事实，与判断记录比较 | [PA-02](../session-contract/SPEC.md#pa-02) |

`open` 与 `submit` 的核对把 Agent `AcceptedInput` 的 `source` 原样交给 `session` 参加者，作为来源依据：AD-14 交的 SE13 或 SE11 回执。参加者不拿它与输入的 `origin` 比较。

Session 结果到四种参加者响应的对应：

| Session 一侧的结果 | 参加者响应 | 依据 |
| --- | --- | --- |
| 命令或核对成立 | 参加 | 无 |
| 当前事实与提交前提不一致：`judgeAdvance` 不为 `ok`、`judgeCompletion` 为 `blocked` 或 `cancelled`、执行不是本 Run 的执行、会话已归档。例外：`judgeCompletion` 为 `cancelled`、终结带取消授权、结论为 cancelled、取消控制等于 SE26 引用的控制时，按 [PA-02](../session-contract/SPEC.md#pa-02) 的取消分支响应「参加」 | 冲突 | 当前事实：当前 `advance`、待交输入的 `InputId`、SE26 cancelled、SE27 |
| 同一操作身份配不同材料 | 冲突 | 原提交 |
| 读权威状态失败、存储不可用 | 失败 | 无 |
| 提交种类不在四种之内，或材料缺项 | 不支持 | 无 |

- `attach` 上的「冲突」译为 Agent 的 `denied`：推进资格依据的共同核对失败，恢复者停止并交恢复协调（[PM-05](../session-contract/SPEC.md#pm-05)），不译为 `changed`。`open` 的来源核对冲突同样译为 `denied`。`submit` 的冲突：输入不是 Session 已受理的输入时译为 `denied`，其他依据译为 `terminal`。`tryFinish` 的冲突译为成功答复 `FinishResult.changed`，revision 是这次核对所用的执行修订；不译为 `Failure.changed`（Agent SPEC「条件终结」结果表）。两侧都不写入。
- 派生 Session 参加的资格核对（`sessionAccessCheck`，装配页 `agent-journal` 行）在写入前进行，不是参加者在事务里的响应。拒绝译为 Agent 的 `denied`，核验不可用译为 `unavailable`。两者都不写入，也不开存储代次。拒绝的 action 是本次 Journal 方法名（`commit` 或 `recordResult`），在 Agent 契约 U-32 写定之前按这个现状实现（P6 决策记录）。
- 生产提供者的对应表在 `src/participation-mapping.ts`，只有一份。
- 参加提交成功后，本插件把回执与修订交给 Session 记入 `ExecutionRef`（[PA-04](../session-contract/SPEC.md#pa-04) 第 2 项）。
- 参加提交的结果未知时，由执行记录提供者认回（[PA-05](../session-contract/SPEC.md#pa-05)）。本插件不把它列入 Session 的 `unresolved`。
- 事务内的流水线（认回、权威读、领域服务、写事实）由 [session](../session/README.md) 与 [session-storage-sql](../session-storage-sql/README.md) 执行。本插件只做翻译与登记。

<a id="ad-02"></a>

#### AD-02 Agent 同日志解释

本插件经本成员同一 AgentJournal 提供者的 output.read / output.events 读取 AgentEvent 正文，按 Session EC-01/EC-02 解释同一日志。load 只读 ExecutionSnapshot 的 entries、results 及其他快照字段，没有 load.events。entries 按提交顺序包含 start-fence 与 received；事件按自身事件序号排序，readThrough 记录事件序号。entries 提交顺序与 results 快照不能充当事件 cursor 或替代 input-taken 的批界。禁止 receive(agent-event) 副本协议不禁止这些现有 output 读口，也不改变 Agent.acknowledge 公共契约。

解释前核对当前资格、租户、Session 与历史 execution-to-Run 关系。input-taken、producer、waiting、control、ended 分别产生 Session EC-01 规定的后果。message 不重复保存，entry 不产生 Session 后果。结束事实可形成 completed/failed；迟到结论只认回原 Run，不能更改后继。未知、缺口和不可用不能映射为不存在。

Agent 原事实先提交。解释进度、后果与该次 Session 操作的认回答案在另一笔 Session 提交一次发布，只保存来源身份或引用，不复制 Agent 事件正文。解释发布前失败只有本次解释批次不可见，Agent 已提交事实不撤销，解释进度不推进；解释发布后丢答复按该次 Session 操作查询。Agent ended 已提交而 Session 尚未解释时，cancel 仍可先写 cancelled；随后 ended 只保留原 Run 引用，不反转终态或更改后继。冻结后的终态批次仍解除余下待处理资格。未解释的记录计入未结工作，不能提前完成。它不新增 receive(agent-event) 变体。

##### 同根读取与原记录索引

本成员实现 [FR-01 至 FR-07](../session-contract/SPEC.md#fr-01) 的提供者责任。每个 `(tenant, session)` 只有一个发布根，execution 索引带 tenant，多个 execution 与 Session 投影共同排序。不得包装独立的 createMemorySessionTransactions 或 createMemoryAgentJournal 后再复制结果。组合直接调用 Session 的 decide、projectSessionLog、reduce 与 commandDigest。

在原 Journal 提交的同一发布点维护以下可重建索引。索引只定位原记录，不重新决定业务事实。

| 原记录 | 同根索引及用途 |
| --- | --- |
| 原 SE13 与 SE15 | execution-to-Run、attempt 原事实及原 grant。历史解释不能从当前 advance 猜原 attempt。 |
| open/attach 交来的 grant 与返回 Authority | grant-to-SE15/attempt-to-attachment。该关系在授予挂接前核实，后续消费原 effect Authority 定位发起 attempt。 |
| open/submit 原受理 | InputId 到全部原 execution 的反向目录、完整 count、有序成员键与版本。即使 Session 尚未收到 SE35，原受理已经同批更新目录。 |
| Agent 原提交 | execution、head revision、原 CommandReceipt、发出的 event sequences 与各事件原来源。head 和 event cursor 分开。 |
| 原 pending、effect 与结果 | consumption/action 到完整固定 pending、原 Authority、结果版本与真实来源。后续 checkpoint 前移不得使已发调用失去可恢复的原绑定。 |
| Session 后续解释 | readThrough、原解释操作答案、SE14 原事件/完整批次与 Session 调用登记。只在实际解释提交成功时推进。 |

对已存在的索引缺项先从同根原记录重建，不能用“尚无 SE35”或空页证明从未交入。原事实暂不可读返回已有 unavailable，权威 gap/损坏/矛盾按 Session SL14/SL18 处理。预算耗尽沿内部接续继续，不作为对外新结果。读取只展开 Q 的完整原关系和 E 的必要前缀；条目/字节预算、完整快照与最终整批容量边界沿 FR-07。

##### head 与原事实来源的翻译

在同根 G 捕获 load 与 output 页。observation.revision 取 load(G).revision，executionEvidence 取该 head 的原 CommandReceipt，source 取原事件/事实来源。sequence 取 event.sequence；快照结果对账为 null。不使用 cause.revision、load.history.revision 或材料 revision 代替 execution revision。不同根的 load/output 只能重读或重新核验，不合成为原子快照。

本提供者在准备 Session 解释提交前确定该提交自己的原 operation，并传入 observation.operation。它沿原操作处理未知认回和重试，不从 Agent 操作、事件来源或 evidence.record 推导身份。纯层的冲突、非法及旧省略分支按 [FR-05](../session-contract/SPEC.md#fr-05) 处理。

每项输入、调用、结果、等待和终态后果保留原 Run/attempt。Session 纯层仍按 FR-01/02/05/06 核本域关系。任何外域 decoder、resolver 或原关系核验失败，都不能先发布部分 Session 后果、cursor、操作答案或 alias。

##### 人工等待的原版本归一

本同日志提供者在发布包含human waiting事件的Agent原提交时，读取该提交的原checkpoint及仍有效的原Passage记录，以waiting.passage定位唯一Passage，完整定位waiting.cards对应的rounds及PassageCard。在同一原发布点保存最小、不可变的原材料片段：tenant/session/execution、原提交revision/receipt、event sequence/source、经过id/position/dimension/action、对应ask的ActionIdentity、原round标识，以及每张被报告卡的identity/card/response/processed。片段按原事件版本绑定；同一经过后来的答复或下一轮ask另有原版本，不覆盖已发布片段。它属于AD-02的同根原记录索引与必要材料，不是第二事实库或新的权威卡片决定。

Session后续解释从该原事件片段重建等待，不要求Agent公开load提供历史checkpoint，也不保留整份旧checkpoint作为前提。Agent仍可按原契约删除旧checkpoint；提供者只保留完成本域解释、历史来源核验和未结交接所需的上述材料。最小片段由同一tenant/session日志保管，具备与原事实相同的可见边界；首次发布前保存失败则该次原提交全无，发布后丢答复沿原操作认回，不另一次补写片段。保存片段不改变Agent动作/卡片的业务合法性判定。

解释完成不立即授予删除片段：尚有未解释原事件、可重放的解释/认回答案，或原等待/未结控制仍引用该来源时，原片段必须可按原版本读取。只有历史持有者按既定压缩与来源保留规则，证明这些责任均已退出或由同等可恢复的原来源承接后，才可回收；本卡内存替身不实现这种回收，保留必要片段到该后端释放。本承诺不要求将所有原checkpoint或Agent事件复制为Session条目。

成员顺序沿waiting.cards；每张卡的引用须与原片段完全一致。后继checkpoint的当前值不能补作原事件版本。原片段暂不可读沿unavailable；权威记录确认应有而丢失、版本矛盾或损坏沿既有隔离规则，不把允许删除旧checkpoint本身视为损坏。

有所属动作时，核对原Passage.action与原ask.ActionIdentity相符，归一为extension-batch，逐成员保留该真实动作身份。无所属动作时，必须同时证明原Passage.action=null、原位置/维度的ActionIdentity不要求动作、原ask不携带动作，并归一为extension-passage。缺失字段、未知记录或冲突不是合法无动作，不能据此选新分支。

每项decision按上表从对应原PassageCard.response取得；不从processed证据、round身份、request.identity、来源opaque record或当前动作推导答复。invalidated时保留原卡成员且decision=null，直到原Agent报告和既定规则决定等待变化；不代替HITL写有效决定。

归一必须覆盖原human等待的全部cards。原卡不存在、属于其它经过、来源有歧义、位置/维度/ask/action互相冲突时，按AD-02现有unavailable/损坏隔离规则返回，不发布部分等待、cursor或答案。Session契约不导入Agent类型，邻域字段翻译只由adapters承担。无动作不是“材料不可读”的降级分支。

##### 控制归一

同根读取原ControlRecord、阶段事实、SE24/25、固定selected、原SE18/SE22及关联条目。execution-to-Run/attempt沿原SE13/SE15与grant，不由当前Run猜测。源材料未知、缺失或矛盾分别沿AD-02原失败规则，不能降为observed。

本节与下文的 K 指 Session 直接发起的一次控制，即该控制的 Session 操作身份。它与 [J06](#j06-会话路径的两个-agent-提供者) 中 Agent 外部入口索引 Ki 无关。Session直接发起的控制，按既定deriveDriveOperation和完整原命令/目标核对因果，不解析opaque reason/source。独立具名控制可以证明某项原责任已合法交接，不因此证明它由Session K发起。没有任何适用K，且完整同根原关系能证明其不对本Session产生控制后果时，该事件为无Session后果的observed。没有找到K但关系未完整读到时仍是unavailable。不能创建假K。

同一Agent事实可涉及多个原K。分别从各K原目标、意图与原选择推导进度，不能只更新第一个匹配项。全部后果及该次解释进度/答案同批发布。

控制事件的后果读解释时的 Session 状态，Agent 提交时定不下来，所以它的事实边界是延后事实（kinds 为 `['deferred']`，session-contract [FR-01](../session-contract/SPEC.md#fr-01)）。规则只有一份：Session 纯层的 `decideControlConsequences`（session-contract `src/control-normalization.ts`）。本成员只把 Agent 一侧翻成它的中性证据 `SessionControlEvidence`（`src/testing/control.ts` 的 `controlEvidence`）：该事件时的控制记录（Agent 操作、命令种类、所指调用的调用引用、Tool 调用、已到达阶段、原命令修订）、该事件修订之前的调用收场片段，以及按驱动操作受理的紧急输入。内存替身在读取时用同一证据和同一函数归一；生产 Journal 在发布点算出证据，AD-02 随观察交给 `commitLog`，由 Session 在本次提交的快照上判定。

###### 原责任与解除判据

每个K的待办必须回到原SE24责任。当前pending去重只是投影；原来源不同的责任仍逐项核对。各来源均满足后，才能删去合并后的ProducerRef。关联转换不改变原解除判据，也不恢复业务等待。

| 原责任 | 可消费的证据 | 不足以解除的事实 |
| --- | --- | --- |
| 原SE24直接选择的停止请求核对项 | 原请求对应的生产者接受停止/中断的reached事实；或者原调用在中断前已真实收场的合法事实 | accepted、仅意图成立、未知、同execution的其它调用确认 |
| 原SE24直接选择的工具转后台项 | 原调用已真实转换且有耐久占位；按原Tool引用及原控制核验 | 仅接受转后台请求、另一调用转换 |
| 原selected U=(consumption,position)，未关联或后来关联为P | 原具名控制或合法交接事实证明该项原结果、费用及适用交接责任被合法接管/结清 | producer-confirmed或physically-stopped本身、空waiting、Run终态、关联成功 |

直接后台核对必须同时拥有原 K 的有效 intent-established、完整原 Tool 调用关联，以及同一原调用真实提交的 ActionSlot.background、placeholder 和 confirmation。生产者只确认接受请求时不成立。最小槽位片段在原 Agent 提交中保存；后来的 checkpoint 替换不改变原版本。后台效果可以先于 K，不由此推断 K 导致转换。效果在原控制事件之后、无新控制事件时，以新的 Session operation 和 sequence=null 快照对账，不改旧事件后果。

停止核对可消费两类先于原具名中断控制提交的原收场事实：原批准动作上完整绑定 Pending、ToolInvocation、consumption/position、结果、非 no-response 终态及 custody 的 ActionSlot.result；或原 step/action/call/resultVersion/source、Pending、ModelInvocation、consumption/position 完整关联的 ModelReplyAdmission（admitted 或 rejected）。片段由合法原 Journal 提交保存，顺序取原提交回执；当前 checkpoint 或壁钟不补历史。Model 准入 source 保留准入证据角色，不等同结果 source。单独 ProducedResult、后台 placeholder、账目、无准入的失败或无回复均不足。未公开的 Model facts schema 不在本提供者中猜测解释。

这些收场事实只解除直接停止核对，不解除 U 交接、不产生 Model ACK、Tool 物理停止或控制因果。仍须核对 K 的原传播；同 call 的独立控制不能替代。urgent interrupt 继续核原 submit 及完整输入，不虚构不存在的具名 ControlRecord。

原execution E的cancel达到duty-released，可覆盖原U通过SE18→initiatingAttempt→SE15/SE13证明属于E的责任，未取得ProducerRef不妨碍这种覆盖。不得扩大到别的execution或initiatingAttempt=null的Run外责任。原E的单调用interrupt/background的合法duty-released，只覆盖其精确原调用责任；核对原ToolInvocation/Model引用、原binding与consumption关系，不能凭execution相同扩大范围。

同一个P兼有直接停止核对和U交接来源时，必须两种判据均满足。具有足够范围的同一合法事实可以同时满足多项，不要求外域多造回执。Stage.state=unresolved或缺席不产生肯定事实。六阶段不互相推导。

###### 状态与解释

生成ControlProgress保持原operation/target/intent。保留尚未满足的pending及pendingUnassociatedWaiting，禁止扩大原范围或重开reconciled。原state为propagating时不因单个accepted退为committed。

reconciled须同时满足：

1. 按原ControlIntent核对意图的来源：
   - Session自己的控制意图以原SE24及其已成功的资格核对为准，不由Agent阶段倒推。
   - cancel-run、archive或auto-archive的Agent直接传播，以及stop-call/background-tool的直接具名传播：按deriveDriveOperation({kind:'control',execution,control:K})定位原ControlRecord，核对原命令/目标并要求intent-established为reached；accepted单独不足。相应原效果已在请求前完成的场景仍保留真实效果，但不以它补造该阶段。
   - interrupt：Session原SE24/SE11给出K.urgent的完整id、message、origin、原run与decision；由原SE13定位execution。按deriveDriveOperation({kind:'submit',execution,input:K.urgent.input})找到原Journal submit记录及其已提交AcceptedInput回执，核对同tenant/session/execution、InputId、priority=urgent和完整原内容/来源。该输入的可靠受理是本路径的传播受理依据，不要求不存在的urgent ControlRecord，不要求input-taken，不反推后续独立控制由哪次urgent造成。该记录未知时保持propagating。独立控制只按下文判据证明原责任的交接。
   - unarchive由原Session命令同批产生reconciled，不消费Agent阶段；其原事实保持。
     这张表只覆盖Session现有ControlIntent。Agent suspend及quiesce不在表中新增Session意图，#730不被采用。
2. 两类pending为空，并且按全部原来源复核确实无未交接或未核对责任。
3. cancel-run、archive与auto-archive的本域资格撤销须有原范围对应的SE16等实际提交；需要Agent取消execution推进的直接控制，还核原ControlRecord的qualification-revoked为reached。Session资格撤销不代替Agent阶段事实，Agent阶段也不代替Session提交。stop-call、background-tool及interrupt不撤整个execution推进资格，不套此全范围条件。
4. reconciled只表示该原控制的传播、生产者核对及FR-06原责任交接已对账。它不表示Tool排序域的全部旧启动已受阻、外部执行已物理停止、效果已撤回或归档任务已完成。Tool启动围栏仍归Agent/Tool的J03事实、验证和恢复，不再作为Session自行调用失效并等待生效的进度条件；本成员不恢复旧startFence字段或完整guard覆盖判定。不能从空pending、SE16、Agent accepted、相同execution、Authority写者或某一真实start-fence推导完整围栏生效。Agent/Tool对围栏的未知与#502恢复缺口继续保持，Session只如实保留和读取原start-fence的所属含义，不因本域reconciled伪造它的成功。

不满足上述条件时，仍可以发布已证明的责任减少与原state保持，不以欠缺一种闭合证据否定其它真实阶段。范围完整但尚无新后果时不单写cursor。相同源与相同后果按原操作认回，解释时不发生产者控制、不撤资格、不触发ACK。

archive的cascade与scope-release保留独立任务及原回执，ControlProgress.reconciled不表示这些任务已完成或整个归档处置已结束，也不把任务完成强塞进该状态。Model结果版本的producer ACK不由duty-released推导；MODEL-ACK-ARRIVAL和#730继续保留。

##### 调用归一的公开来源

| Session 所需值 | 原公开字段与核验 |
| --- | --- |
| execution、原事件、报告挂接与因果 | AgentEvent.execution、sequence、executionAttachment、cause。核对原记录确属当前 tenant/session 的历史 Run。 |
| consumption、action、consumer、request | PendingCall.consumption、action、position、fixed。consumer 四字段与 fixed 原证据完整保存，不由名称猜消费位置。 |
| 原 invocation 与 purpose | Model 的 reference/purpose；Tool 的 association/reference。保留 main/compaction/extension/action；intent 不补 reference。 |
| 原发起 attempt | EffectIntent.authority 与 load.effects 中的原 effect/pending，结合原 grant-to-attachment 与已成立 SE15。waiting 事件的当前报告 attachment 不替代原发起 attachment。 |
| 旧 pending 的补找 | checkpoint.calls、checkpoint.batch.actions[].call、checkpoint.passages[].operations[].pending、load.effects[].pending。只按同 consumption/action 与一致固定材料定位，不取第一项、不重发调用。 |
| 完整结果 | producer 事件的 consumption/result 或 load.results。核对 producer kind/call、version、delivery、source 与原 binding。 |

Model/Tool 的 invocation reference 经各自公开 resolver 核对 tenant 并得到原 call，再与 result.producer.call 比较。通过后，Session result.producer 使用原 binding 的 ProducerRef。禁止字符串切割或 JSON 拆字段猜不透明 reference。Session contract 不导入 Agent、Model 或 Tool 类型。

首次 waiting 先翻译所有缺少的 SessionCallRegistration，再翻译完整等待集合。首次 producer 先取得原 binding；需要时登记 SE18 或把 Tool intent 关联，再解释 SE19。后果在同一 observation 中按顺序交纯层，SE18/22 或 SE18/19 与进度同批。关联前后同 consumption、consumer、action、fixed 与 initiatingAttempt 不变。公开字段和保留原关系不足时，仅停止依赖该材料的后果，不发明新 Agent 查询端口。

##### 准备与终态的排序

凡是后继输入消费及 [FR-04 的 SE38 入口](../session-contract/SPEC.md#fr-04)，先捕获 Q 的完整原交入目录与相关 E，再完成捕获 E 的必要连续前缀，最后重算 Q 并以当前根 CAS 发布。Q 因某段 SE14 缩小不能跳过原 E 剩余前缀。准备停在 ended 前；中间其它适用后果照常解释，不靠摘取 input-taken 推进 cursor。

`finishRun.expected` 不因内部准备而改写。独立解释推进 Session 修订时，新请求可以按原并发规则返回 changed，且不成立该请求的终态、SE38 或成功答案。调用者重读后以新 operation 与新 expected 收束；已提交原操作仍先认回。

已成功的解释段和原 Agent 事实保持成立。取消准备不解释 ended，独立正常 ended 解释仍可在最终 CAS 前先形成 Session 终态，按 PA-08 返回原终态。未冻结普通 cancel 与 active Run 上的 freeze 不新增 SE38 准备门槛。原 grant 的当前业务资格在真正发布点复核，已失效 grant 不再产生新 taken，合法 custody/received 不被旧 grant 误拒。

finishRun 仍核原目标 Run、expected、恢复者资格和收束依据。PM-02 首输入拒收时，同批首条 SE35 rejected 先解除其资格，再为其余仍 pending 的输入写 SE38。P-5 不可解释依据不能证明未 taken，缺必要承接前缀仍不能完成冻结终态。归档保留 SE27 自己的取消范围，不能用它替代 SE38 的原因。

<a id="ad-03"></a>

##### AD-02 生产插件

`createSessionJournalInterpretationPlugin(input)`（`src/cordis/journal-interpretation.ts`）返回插件 `plugin`（名为 `session-ad02`）与调用入口 `interpret`。插件不提供键。

- 装载：`inject` 为 `session: { caller: 'coordinator' }`、`sessionTransactions`、`storage` 与受信 `tenantDomainLookup`。缺任一键时插件停在 `PENDING`，不提交。`input.coordinator` 与 AD-05、AD-14 的同名输入相同。`sessionTransactions` 没有 `commitLog` 时，调用答 `unavailable`。
- 触发：插件订阅 `session-adapters/agent-published`（见下一条）。每个事件按会话排队，同一会话的解释一次只做一个。插件启动时不扫描存储；漏掉的事件由同一 execution 的下一个事件补上。`interpret({ tenant, session, execution })` 只进入当前一代插件，插件停止或缺依赖时答 `unavailable`。
- AD-02 触发事件：`session-adapters/agent-published`（参数 `tenant`、`session`、`execution`，`@mode parallel`）声明在 `src/cordis/agent-journal-provider.ts`。Journal 插件在写方法（open、attach、detach、commit、submit、control、acknowledge、recordResult、recordControl、recordHandoff、tryFinish、commitSettlement、recordTerminalObservation）与 `agentJournalEntries.record` 答复成功之后恰好发一次；读方法、失败的写、没有路由成功的调用、插件停止之后都不发，`materials.preserve` 也不发。插件分发时不等监听者，监听者失败写 warn 日志，不改变答复。载荷只是唤醒信号，不携带事实，订阅者自己读日志。
- 读取：插件以 `coordinator` 经 `session.work.readWork` 找出拥有该 execution 的 Run 与已存的事件进度 `readThrough`，找不到时答 `unavailable`（`owner` 为 `session-history`）。然后插件经 `readExecutionInterpretation` 读该 execution 的头行与 `readThrough` 之后的事实行（`execution-record.execution-facts`，session-storage-sql 已知限制第 20 条）：执行头的修订、边界行所记的头回执（占位回执读作没有头），以及 `readThrough` 之后的每个事件和发布点为它归一的后果与控制证据。只读进度之后的事实，读量与会话长度和该 execution 的记录大小无关。页与页之间头行的修订或 `emittedThrough` 变了就从头重读，三次后答 `unavailable`；序号不连续（缺一行事实）答 `unavailable`，不跳过；最后一页读到的最后序号小于头行的 `emittedThrough`（缺尾行或页被截断）也答 `unavailable`。没有正文行的旧事实回退到读分区（K-21）。发布点在写事实行的同时写正文（`indexOf` 把与 `notes` 相同的后果与控制证据放进事实记录）。
- 提交：每个事件组一个观察 `SessionLogCommitObservation`，经 `sessionTransactions.commitLog` 提交，一次一个事件，按序号顺序。后果只是 `observed` 的事件没有 Session 行，不单独提交，由下一个提交的事件在间隔里覆盖（session-contract FR-03）。操作身份由观察确定地派生，形如 `ad02_` 加摘要：同一读取的同一事件是同一操作。
- 失败与认回：`commitLog` 答 `commit-unknown` 或抛错时，插件以同一操作、同一观察再发，最多发三次。session-storage-sql 对 log 形式的 `queryOperation` 答 `conflict`，所以插件不查询，只靠同一操作认回（这是本成员的实现取舍，偏离 DP2-1 第 3 节「unknown 走 queryOperation」的字样）。答 `changed` 时插件重读一次；事件队列这一路在重读后仍答 `changed` 时，于同一队列位置对同一 execution 再解释一次（上界 `REQUEUES = 1`），从已存进度开始读，不重复提交。这是补「接收方经自己的 Journal 副本写入不发 `agent-published`」这一唤醒缺口的本成员补丁，缺口本身待唤醒约定收口。其他拒绝原样返回并写日志，不重试。插件停止后不再发送。
- 控制事件：事实为延后事实的事件，插件发后果为空、带 `control` 证据的观察，后果由 Session 在提交里判定（[控制归一](#控制归一)）。判定只有 `observed` 时，这次提交只推进解释进度。
- 停下：后果没有归一、也不是延后事实的事件（原片段缺失的事件）停止本次解释。插件不把它当作 `observed`，也不提交别的东西；答复的 `waiting` 记从它起尚未提交的事件数。头回执是占位回执（另一 execution 的调用改动了该执行）时答 `unavailable`。
- 验证：`tests/journal-interpretation.spec.ts` 在真实 Cordis 4.0.4 与 node:sqlite 替身上运行生产 Journal 插件与本插件：一次 Agent 写入之后不经测试调用就解释，进度到达后需要历史的 Session 命令通过（没有插件时答 `unavailable`）；`observed` 事件不提交；丢答复以同一操作认回，日志只有一次提交；同一事件触发两次只提交一次；插件停止、缺 `sessionTransactions`、另一租户的事件与拒绝 `commitLog` 的视图都不提交；R2-D28 反例（取消之后后继 `startRun` 读旧执行的非 `observed` 尾部）在插件提交尾部之后通过；3 轮与 200 轮里每轮的 `commitLog` 次数都是 1。

##### 发布点的后果归一

生产 Journal 在同根索引行的组装处（`src/cordis/agent-journal.ts` 的 `indexOf`）对每个新事件调用内存参照的同一个归一函数 `normalizeAgentEvent`（`src/testing/history.ts`），参数是写入之后的公共根与该执行。事实行的 `kinds` 就是归一结果的种类列表，同一份后果随 Agent 记录状态保存在 `notes.consequences`，边界行所记的头回执保存在 `notes.heads`，所以以后的解释读到的后果与索引一致。

- 归一读的原片段（事件回执、事件的 Pending 与每个消费的首个调用事件、人侧材料）由提交钩子在写入时按内存替身的同一函数 `captureEventOriginal` 捕获，随 Agent 记录状态经 `journal-state` 编码保存。
- 控制事件的后果读解释时的 Session 状态，发布点不判定。发布点用内存替身的同一函数 `controlEventEvidence` 算出该事件的 Agent 证据，事实行写延后标记 `kinds: ['deferred']`，证据随 Agent 记录状态保存在 `notes.controls`。证据算不出（原片段缺失）时写空 `kinds`，不补造。原片段缺失的其他事件同样写空 `kinds`。
- 受理行（`er_admission_idx`）带原挂接的 attempt：取 open 或 attach 的提交钩子已记的 Authority 到 attempt 关系；取不到就不写，不按当前推进猜。

#### AD-03 Runtime Context 持有者与 `session.modes` 生产者

本插件以作用域持有者身份使用 Runtime Context 的持有者面，以生产者身份供给 `session.modes`。作用域引用由 Session 铸造，按 Runtime Context 根入口的解码函数解码。

- 注入：数组形式 `runtimeContext`（作用域持有者的适配器），`session` 调用方类 `coordinator`。回放子插件自己注入数组形式 `runtimeContext`（持有者面），并以 `reader` 调用 `session` 的历史读取；它与主插件各自注入，分开换代，不借用主插件闭包里的句柄。变化提醒子插件以对象形式 `runtimeContext: { consumer: 'model' }` 绑定模型类读者。
- 块声明：本插件把 `session-contract` 导出的 `sessionModesBlock` 翻译为 Runtime Context 的块声明，并在本成员的 `./cordis` 增补 `ContextBlocks`。Session 契约不导入 Runtime Context，所以增补落在本成员。
- 生产者：本插件以 `registerProducer` 登记 `session.modes`。第一个参数是调用方可信主体，登记输入带租户，并给出按作用域供值的回调（[RC-07](../../context/runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复)）。生产者槽的身份是租户加块键。本插件为几个租户供值时，为每个租户分别登记，并分别撤除各自的句柄。
  - 回调收到作用域、租户与本次供值的代租户主体，以 `readWork` 读本会话三轴的当前值。
  - 句柄带只读的租户。SE03 提交后，本插件经句柄发布新值，发布输入是作用域、租户与值。使值失效的目标是指定作用域，或本租户全部作用域。目标里的租户必须等于句柄的租户。
  - 恢复方式为 `persisted`：恢复完成后，第一次合法的普通读取遇到待刷新标记时，Runtime Context 再次调用回调。本插件按回调重新发布日志里的原值，不用默认值补。

持有者的三项义务：

1. <a id="ad-03-1a"></a>恢复会话（1a）。本插件用 [RC-09](../../context/runtime-context-contract/SPEC.md#rc-09-作用域结束恢复会话与恢复后供值) 的恢复会话恢复一个作用域。本插件在下列时点开始恢复会话：创建一个作用域；本插件体在 Runtime Context 提供者换代后重新运行，之后第一次为该作用域签发资格之前；`applyCommit` 返回「顺序不符」时。步骤：
   1. `beginReplay`：输入作用域、租户、检查点与被取代的恢复引用。旧资格与旧读者在这一步失效。
   2. 构造完整恢复材料，共三部分，全部限定于本次恢复的原 scope：按会话日志提交顺序，经历史读取取出的该 scope 全部注册提交（SE07，含移除意图）；该 scope 每个 `checkpointed` 状态块最近一次步提交的全值，从该 scope 的 `change(context-step-commit)` 条目归约得出，更新清单为空；该 scope 已经确认的结束。已注册而还没有步提交的 `checkpointed` 块不在材料中，允许缺席，重启后由生产者或下一次步提交重新建立值。这是已知限制，取 [RC-09](../../context/runtime-context-contract/SPEC.md#rc-09-作用域结束恢复会话与恢复后供值) 允许缺席的读法；RC-09 原文由 W1-RUN-10 的设计首步核实后才确认，原文不允许缺席时，按 RC-09 补写注册与步提交原子的入口，再改本步。旧 scope 的注册、检查点与结束不得重放到新 scope。代次绑定与新 scope 初始化的责任边界见 [J18](../session-contract/SPEC.md#j18-作用域引用与结束事实)，新 scope 的初始化按下文第 1a 项后的顺序进行。
   3. `finishReplay`：输入恢复引用与恢复材料。
   4. `ready(open)` 后核当前普通授权、可信绑定及所需注册，重签读取资格并绑定读者。签发不以供给值已经恢复为前提；首个模型请求另等必要输入齐备。

   首次创建作用域时，材料为空，也先完成一次恢复。围栏打开之后，Runtime Context 才接受普通的注册与步提交。「顺序不符」时，本插件以新的检查点开始一个取代旧会话的恢复会话，完整恢复之后，若恢复包已覆盖该原提交，只追平投影，不再施加旧增量；若只覆盖其前序且原提交尚未 applied，才用原提交的完整输入重试 `applyCommit`。
   恢复只接受 `ready(open)` 或 `ready(ended)` 为完成。`ready(ended)` 不签发普通资格。invalid、refused、unavailable、unknown、超时或中断均不开放业务恢复。新检查点显式 supersedes 当前恢复会话；旧 replay 不撤销后继。注册含移除、checkpoint 每个已有步提交的最终 checkpointed 块恰好一次并按原 commit/step 合组（已注册而没有步提交的块允许缺席）；end 与已知结束一致。空数组不证明完整，恢复容量不足不截断材料求成功。

   新 scope 的业务初始化沿 Session [J18](../session-contract/SPEC.md#j18-作用域引用与结束事实)。没有本 scope 原记录时，先证明空恢复材料完整，完成 `ready(open)`，再从当前合法声明准备注册，经 `change` 提交 SE07，确认后按原 CommitRef 应用。注册已提交但初始化未完成就重启时，完整恢复本 scope 的原注册与已有检查点，继续尚未完成的初始化，不重复注册。旧 scope 的注册、checkpoint 或结束不迁入。

   普通资格按当前授权、可信绑定与所需注册签发，不等恢复供值完成。恢复仅标记 needsSupply，第一次合法普通读取核读者与逐块权限后触发原生产者供值。生产者仍核本次普通供值授权；必要初值由合法生产者或步提交建立。恢复授权不能充当普通读取或供值身份。必要注册、可信来源或资格缺口阻止依赖它们的读取或动作；首个模型请求所需输入未齐时继续暂停。失败保留待刷新状态与原初始化责任，不用零值或默认值补齐。

   普通 applyCommit 的成功去重绑定原完整输入；当前资格通过后，同值认回，不回退修订，异值为 commit-conflict。out-of-order、invalid、refused、unavailable 和 unknown 不占成功表。恢复包不写入普通增量去重表，不重放 reducer updates 或原业务效果。相同 begin 输入在仍为最新会话时认回原 ReplayRef，已完成也不重关围栏；已完成 finish 的同包重试认回，异包为 replay-conflict。旧引用的拒绝不关闭后继 ready。恢复期间 staging 不对普通读者披露，只有最终核 current、绑定、epoch、end 与 appliedCommits 版本后才原子安装。ReplayRef 是本实例引用，不能耐久复用或当权限。

   `RuntimeContextAuthority` 与 `ScopeBindingSource` 必须从真实作用域绑定、日志检查点和结束记录取依据。其 `current()` 同步核验需要与资格写者和最终动作共用有效序列化边界。首批 authorization 的异步准入不提供这个保证。真实跨进程接线尚未交付，不把本规格当作已实现证明。

   本成员的根导出 `createSessionRuntimeContextTrust` 把这两个端口构成 `runtimeContextTrust` 的内容，由装配入口在受信子树交给 Runtime Context。四个入参都必需，没有默认放行：原 `authority`、原 `bindings`、`current`（`RuntimeContextCurrentBridge`，`capture()` 返回一个失效后不再恢复的视图）、`replayFacts`（`SessionReplayFacts`，持有者从会话日志读出的事实）。它是组合适配，不做第二次授权：
   - 持有者、生产者、读者的每次调用，在第一次 await 之前调用 `capture()`，再问原 authority，答复保留原分支。授权答复的 `current()` 取原 `current()` 与已捕获视图的合取。`bindings` 原样交出，不缓存答复，未知不读作未绑定。
   - 它自己的一项核对是完成恢复的覆盖。原 authority 授权 `finish-replay` 之后，先问可信绑定：作用域未指派给动作的租户时答 `refused`，绑定不可用或未知时答同样的 `unavailable` 或 `unknown`，且不读持有者事实。然后 `replayFacts.stepCommittedBlocks` 给出该作用域在 `through` 之前已有步提交的最终 checkpointed 块。材料遗漏其中任一块，答 `invalid`（`replay-incomplete`）。已注册而没有步提交的块不在答复中，缺席不算遗漏。事实读不到时答 `unavailable` 或 `unknown`，不当作覆盖完整。授权答复在读取期间已失效时，原样返回，不披露覆盖结论。
   - `current` 与 `replayFacts` 的真实提供者归装配与本成员的恢复接线。没有同步失效来源的缺口仍归 [#677](https://github.com/nemori-ai/omne-harness-lite/issues/677)，本函数不补这个保证。
   - 契约套件的按面性质（工作资格撤销不使生产者答复失效，请求登记代次不使持有者答复失效）要求桥按面区分。`capture()` 不带面参数，所以满足套件的接线是每个面各配一个桥，即为持有者、生产者、读者各建一个工厂实例，各用只观察该面所依赖来源的桥。单个不分面的桥会使其余面的答复过早失效。让桥带面参数要改契约的夹具与 `RuntimeContextCurrentBridge`，归契约拥有者。

2. <a id="ad-03-1b"></a>保留上一份快照（1b）。本插件为每个读者保留上一份已按资格过滤的快照：值与摘要。它是 `diffForReminder` 的前值来源。它是可丢派生物，只在进程内保存。丢失时，下一次读取按完整快照处理，第一份变化材料不带前值，本插件不补造提醒。
3. <a id="ad-03-1c"></a>补拉的上界（1c）。唤醒只加速补拉。本插件在两个时点必须补拉：
   1. 每次步边界提交（`change(context-step-commit)`）成功之后。
   2. 本插件经句柄发布 `session.modes` 新值之后。

   上界是「下一次步边界提交之后」，与时间无关。已知限制：AD-04 与本插件是不同插件，之间没有通道，AD-04 不能在给出新的历史依据之前等本插件补拉。两次步提交之间、来自其他生产者的 Runtime Context 变化，可能晚一次模型请求才进入提醒。触发条件：Runtime Context 拥有者按 NP-11 给出补拉上界规则，或者本成员为 AD-04 与本插件定义一条装配内的通道之后，恢复「下一次模型请求之前」的上界。Runtime Context 契约把这个上界交给持有者定（[明确缺项](../../context/runtime-context-contract/SPEC.md#明确缺项)）。1b 与 1c 是本成员推出的技术决定，由 Runtime Context 拥有者确认，见 [NP-11](#np-11)。

变化提醒的写法与时点：

1. 本插件用模型类读者的游标调 `changes`，再以上一份快照调 `diffForReminder`，得到变化材料。
2. 本插件以 `commitDerived(context-reminder)` 把变化材料写成 SE10 的系统提醒。来源标记取 message 包的封闭取值。操作身份从会话与变化材料身份派生，同一变化材料认回。
3. 会话已归档时，提交返回 `archived`，本插件不再追加提醒。
4. 游标作废时，本插件丢弃上一份快照，下一次读取取完整快照。

资格的签发与撤销：

- 执行开始或建立新的执行挂接时，本插件按读者的消费者类签发资格。资格带块键集合与需要绑定集合。需要绑定来自注册材料（[AD-12](#ad-12)）。
- 压缩提交之后，本插件对模型类读者重签资格（[RC-04](../../context/runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料)）。在提交与重签之间崩溃时，恢复先重签，再接续。
- 会话归档后，本插件撤销该作用域的全部读取资格。作用域结束按 RC-09 是持有者已经确认的提交事实（只结束作用域，或者注册决定与步提交带结束标记）；Session 在归档成功的同一次提交保存原 scope 的已确认结束事实；撤销归档另铸新代次，不重新开放旧 scope，精确绑定和提交后应用边界见 [Session 的 J18 条款](../session-contract/SPEC.md#j18-作用域引用与结束事实)。新 scope 的实际初始化按本节第 1a 项后的顺序进行。结束之后，签发、绑定、读取与发布都答 `scope-ended`。作用域永不重开。新的业务代次铸造新的作用域引用（[RC-01](../../context/runtime-context-contract/SPEC.md#作用域引用的铸造)）。
- 纯 scope end 使用 CommitInput 的 scope 分支，不制造空注册或虚假 step；registration/step 带 scopeEnded 时整笔原子应用。executionEnded 只影响原 untracked 块，不等于 scope end。
- 访问核验：持有者面每个操作的第一个参数是调用方可信主体。每个带目标的入口先问权威端口，再问可信绑定来源。「作用域到租户」的可信绑定来源是调用方提供的端口（RC-01），由装配提供。该装配缺口归 [#677](https://github.com/nemori-ai/omne-harness-lite/issues/677)。

注册决定由 Session 提交：原初始化计划内的增加由 create 或 completeInitialization，之后由 change。本插件是调用 `applyCommit` 的唯一一方，AD-12 只准备材料，不调用 `applyCommit`。本插件的回放子插件监听 `session-cordis-contract/committed`，事件种类含 SE07 时以 `reader` 经历史读取取出该批注册，沿每份决定的原 CommitRef 与完整输入调用 `applyCommit`，批内多个注册按持久顺序应用。`applyCommit` 是 Runtime Context 持有者面的操作，不调用 `session`，所以回放子插件调用 `session` 只用 `reader` 一种调用方类（[AD-00](#ad-00) 第 1 条）；持有者面由它自己注入的 `runtimeContext` 取得，不把注册交回主插件应用。提供者换代时子插件按自己的 `inject` 重跑，重跑后的应用靠同值认回保持幂等。通知丢失时，下一次恢复会话（1a）的完整材料覆盖这些注册，或下一次 `applyCommit` 返回「顺序不符」并开始恢复会话。同值重复应用按原输入认回，所以注册不会重复生效。

已知限制：注册从 Session 日志进入 Runtime Context 没有时间上界。通知丢失或监听者失败之后，如果没有新的 SE07、没有 Runtime Context 提供者换代、也没有重启，该批注册留在 Session 日志里而不进入 Runtime Context。依赖它的首个模型请求继续暂停，S3 的八个待办原因都不覆盖这一状态，没有调度器找回它。安全性成立：注册不会重复生效。触发条件：实测出现这种暂停，或 Runtime Context 拥有者按 NP-11 给出对账时点之后，为本插件加一个对账时点（例如签发资格时核对该 scope 未应用的 SE07），并写明上界。Session 返回 `commit-unknown` 时，本插件不调用 `applyCommit`，先按操作身份查询（[身份桥、证据桥与 Context 输入](../session-contract/SPEC.md#身份桥证据桥与-context-输入)）。

##### AD-03 的实现现状

`createSessionContextHolder`（`src/cordis/context-holder.ts`）给出三个插件和一个端口：`{ holder, replay, facts, replayFacts }`。三个插件必须来自同一次工厂调用，因为它们共用作用域索引。持有者与回放子插件在 `runtimeContext` 或 `session` 缺席时停在 `PENDING`；事实插件只需要 `session`。

1. 回放子插件 `session-ad03-replay` 注入 `runtimeContext`（不带 intercept 配置）与 `session: { caller: 'reader' }`。它是唯一调用 `applyCommit` 的一方。
   - `committed` 通知的种类含翻译协议列出的种类时，它以 `reader` 前向读完该会话的上下文记录，按日志顺序分到各作用域。
   - 本代次没有恢复过的作用域，先做第 1a 项的恢复会话。through 取该作用域的最后一个提交。材料按第 1a 项第 2 步构造，只含有步提交的 checkpointed 块。块被移除之前的步提交，不算作重新增加之后的块的步提交。
   - 已恢复的作用域，按原 CommitRef 与完整输入，逐条对尚未覆盖的记录调用 `applyCommit`。记录包括 SE07、步提交与作用域结束。
   - `out-of-order` 与 `replay-incomplete` 开始一个取代当前会话的恢复会话。恢复没有完成时，下一次通知或下一次签发之前再恢复，并取代没有完成的那个会话。
   - 新作用域（第 1a 项「创建一个作用域」）：会话日志里还没有它的记录。事实插件在本代次第一次收到某会话的通知时，以及收到铸造作用域的通知（`session.created`、`session.unarchived`）时，读该会话的作用域绑定，把未结束的作用域记进索引。通知的种类不总能列出创建：Session 的提交通知只读一页条目，大的创建条目可能不在页内。
     - 作用域绑定的读法（SCOPE-NARROW，R2-D229）：不读 `WorkSnapshot`。以 `reader` 经历史读取，对 `CONTEXT_SCOPE_KINDS` 的每一种（SE27 `session.archived`、SE28 `session.unarchived`）各读一次，每次只带一种。只带一种的读取在存储里走种类索引，所以读到的行数是这两种条目的条数，不随会话历史增长。读到的条目交给 session-contract 的 `contextScopesOf` 归约：创建铸造第 1 代，SE28 铸造新一代，SE27 结束一代。作用域引用不是按本会话与代次铸造的那一个时，整次读取失败，不当作本会话的作用域。
     - 同一会话的并发首次通知共用正在进行的那一次读取。会话在创建之前没有通知，所以这次读取已经看到创建铸造的作用域。铸造作用域的通知另读一次。
     - 读不到时，该会话记为「未能建索引」，带读不到的原因。持有者为一个不在索引里的作用域作答之前，先重读同租户下这些会话的作用域绑定。重读仍失败时答 `unavailable`，诊断写重读失败的原因。
     - 第一次为新作用域签发之前，回放子插件完整读一遍该会话的上下文记录。读完而没有它的记录时，回放子插件再以 `reader` 重读作用域绑定。这次读取每次都重做，结果不记住，因为 `ended` 会变。绑定列出它且 `ended` 为 null 时，以空材料（through 为 null）完成恢复。绑定列出它已结束时答 `absent`，不恢复；结束记录随下一次读取进入 Runtime Context。绑定没有列出它，或者读不到时，答 `unavailable`。记录读不完时也不恢复，答 `unavailable`。
     - 以空材料恢复过的作用域在归档时由结束记录让 Runtime Context 得知结束：翻译协议按该会话的租户还原 SE27，回放子插件按原 CommitRef 调用 `applyCommit`，之后答 `absent`（R2-D219）。
2. 持有者插件 `session-ad03` 注入 `runtimeContext` 与 `session`（不带 intercept 配置），提供 K-RC `runtimeContextReaderEligibility`。它不调用 `session`；注入 `session` 只让它与回放子插件同时运行。`current` 的政策如下：
   - 先核作用域的租户。租户不符时答 `refused`，不读会话，也不签发。
   - 本插件没有见过的作用域答 `unavailable`。同租户下有会话未能建索引时，先重读这些会话的作用域绑定（见第 1 项的新作用域）。恢复没有完成时答 `unavailable`。作用域已经结束时答 `absent`。
   - 同一主体、消费者类与作用域已有资格，并且作用域的恢复与注册修订都没有变时，再交出这份资格。
   - 否则当场签发。块键集合是该消费者类不带翻译的绑定的块键，需要绑定集合是它带翻译的绑定。两者都为空时也签发，答 `current`，读者读到空快照（R2-D202）。`absent` 只留给没有资格可签的情形（作用域已结束、Runtime Context 以 `scope-ended` 拒签），所以真缺资格不会被当作空读。同一次恢复内的重签取代旧资格。旧资格属于更早的恢复时，`beginReplay` 已使它失效，所以不取代它。
   - 持有者权威拒绝签发时答 `refused`。Runtime Context 不可用或未知时，原样答 `unavailable` 或 `unknown`。
3. 事实插件 `session-ad03-facts` 注入 `session`（不带 intercept 配置），以 `sessionReplayFacts` 与 `sessionScopeLookup` 两个键提供服务（服务类来自 session-cordis-contract）。它的全部读取经子插件 `session-ad03-facts-history`，后者只注入 `session: { caller: 'reader' }`：历史读取只接受 `reader`，一个插件只用一个调用方类（[AD-00](#ad-00) 第 1 条）。子插件不在时记录读取与作用域绑定读取都答 `unavailable`。它在会话的第一次通知与铸造作用域的通知后读作用域绑定，把未结束的作用域记进共用索引（见第 1 项的新作用域）。已读过的会话按索引上界记在本代次内，不重复读。同一会话正在进行的读取由并发的首次通知共用。插件停止时两个服务撤下，持有旧引用的调用答 `unavailable`。
   - `replayFacts.stepCommittedBlocks` 交给 `createSessionRuntimeContextTrust`，不再经回放纤程：事实插件读同一批上下文记录，截到 through，答最终注册中有步提交的 checkpointed 块。through 不在日志中时答 `unknown`。回放子插件不运行时它仍可回答；事实插件未运行、读不完的历史与翻译缺陷答 `unavailable`。
   - 作用域查找（R2-D14）：索引只说去哪里找。命中后读该会话的作用域绑定，找该作用域：找到答 `known`（tenant、session 取自该会话，generation 取自绑定，不取自 Cordis 代次或作用域文本）；绑定没列出它答 `unknown`（伪造、他租户或尚未铸造的作用域落在这里）。读取失败、主体取不到、绑定不是按本会话铸造的、插件已停止答 `unavailable`。已结束的作用域仍答归属，答复不表示它仍然活跃。查找不授权任何访问。作用域未命中索引时，先等尚未结束的通知读取再答 `unknown`。
   - 记住的答复（SCOPE-NARROW）：作用域属于哪个租户、哪个会话、第几代，一经铸造就不变（作用域引用是这三项的单向摘要，[J18](../session-contract/SPEC.md#j18-作用域引用与结束事实)）。所以一次完整读取给出的 `known` 答复在进程内记住，之后不再读存储；上界同为 `scopeIndexEntries`，最旧的先丢。记住的答复不带 `ended`，所以不需要失效来源。`unknown` 与 `unavailable` 不记住：作用域可能之后才铸造，读取可能之后恢复。

持有者插件不调用 `session`。事实插件本身也不调用；回放子插件与事实插件的历史子插件使用 `reader` 类，只调用历史读取，主体是装配交入的会话协调者主体。没有插件读 `WorkSnapshot`。入参 `coordinator` 与 AD-14 的是同一个端口，取值按 #978 的答复。插件只保存派生物：作用域到会话的索引与记住的查找答复（进程内，有上界，跨代次保留，上界同为 `scopeIndexEntries`。回放子插件按上下文记录与作用域绑定写入索引，事实插件按记录与作用域绑定写入）、未能建索引的会话及其原因（有同一上界）、每个作用域的恢复状态（回放子插件的 fiber）和已签发的资格（持有者插件的 fiber）。读取或翻译失败时，插件报告不可用，不把它当作空材料或业务拒绝。

已知缺口：

- 条目到 `CommitInput` 的翻译是 AD-12 的翻译协议（`createSessionContextTranslation`），插件从入参 `translation` 取得它。本成员的验证对翻译与会话服务用脚本替身，翻译本身在 `tests/context-input.spec.ts` 对真实 Session 条目验证。
- 作用域到会话的索引只从 `committed` 通知与未能建索引的会话的重读建立。进程重启之后，一个会话在下一次提交之前，K-RC 对它的作用域答 `unavailable`。
- `session.modes` 生产者、变化提醒子插件、第 1b 项、第 1c 项、归档之后撤销资格，以及签发时核对未应用的 SE07，都尚未交付。
- 每次同步都重读该会话的全部上下文记录，不按游标增量读取。事实插件经历史子插件对每个上下文类通知也重读一次（与回放子插件各读一次），成本随会话的上下文记录数线性增长（E9）。作用域绑定的读取不读快照，行数是 SE27 与 SE28 的条数，随归档与撤销归档的次数增长，不随会话历史增长。SE27 的载荷带归档任务列表，大小随子会话数增长。
- 事实插件只在自己运行期间建索引。它重启或冷启动后，一个会话的作用域答 `unknown`，直到该会话下一次出现 `committed` 通知：任何种类的首次通知都按作用域绑定记下未结束的作用域，已结束的作用域还要等上下文类通知按记录记下（R2-D14「冷启动后未见过的作用域：答 unknown」）。需要冷启动即可查找时，由调用方用 `unknown` 以外的途径补，本成员不提供。

`historySessionOf(source)`（`src/history-session.ts`，根入口导出）从 Journal 核心铸的 history 证据解出 (tenant 文本, session)，供 ad03、ad04、ad05、ad14 行的 `heads.sessionOf` 使用。规则：owner 等于 Journal 的 owner；record 为命名空间、execution 与 `/history`；命名空间是 JSON 文本 `[tenant, session]`。它不解释 `consumer.work`，不授访问权；调用方在使用 session 之前仍须把 tenant 文本与调用者的租户比较并检查访问。它与 `materialSessionOf` 同源，不共享私有辅助函数。

验证：[tests/context-holder.spec.ts](tests/context-holder.spec.ts) 在真实 Cordis 4.0.4 上运行。Runtime Context 是 runtime-context-contract 的内存替身。信任端口是 C18 的 `createSessionRuntimeContextTrust` 加本插件的 `replayFacts`。翻译协议与会话服务是脚本替身。没有对 runtime-context-cordis 真件、真实会话服务或真实存储运行。

<a id="ad-04"></a>

#### AD-04 Request Context 历史源与未结工作下界

本插件提供 RQ 的 `HistorySource`，并把它作为同一目标 `ContextSources` 的一部分登记。输入与结果以 [RQ 公开端口](../../context/request-context-contract/src/ports.ts)和[来源协议](../../context/request-context-contract/src/sources.ts)为准，不使用旧位置参数读口。

- 本项适配拆成两个子插件，各用一个调用方类（[AD-00](#ad-00) 第 1 条）：历史源子插件以 `reader` 调用 Session 的历史读取；下界子插件以 `coordinator` 调用 `readWork`。身份来自本次 `Access`，目标来自 `HistoryEvidence.target` 的显式 tenant/scope。scope 必须与可信 Session 绑定一致，不从 scope 文本猜租户。
- `read({ access, evidence, cursor, budgetBytes })` 读取固定 evidence 的模型历史。`compactionContext({ access, evidence, coverTo })` 读取同一依据的 CM-02 判断窗口，成功返回完整 evidence。两个入口每次都重新核验当前访问资格。
- `HistoryEvidence` 含 target、epoch 和 upper。upper 是 empty 或 entry(seq)，seq 是规范非负十进制文本，不用 number 或 -1。Session 模型视图的 seq 从 1 开始，Request Context 历史的 seq 从 0 开始（[历史源读口与 epoch 视图](../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图)）。Session 第 n 行是历史第 n−1 行：`ModelViewBasis.upper` 为 `"0"` 时转成 empty，正值 n 转成 entry(n−1)；历史游标 after h 指 Session 第 h+1 行之后。Session 的游标是存储签发的不透明值，本适配不解码它：页的 next 非空时，历史游标指向本页最后一行，签发游标记在这一行上（见下表 `history.read`）。换算按任意精度十进制，不以浮点数往返转换；Session 行号 `"0"` 不是合法行，按翻译缺陷答 unavailable。行 bytes 从已校验的安全字节计数转为规范十进制文本。非规范值、超范围数或缺失目标返回 invalid，不静默截断。
- cursor 绑定完整 tenant/scope/epoch/upper 与 after。每页保持原依据，epoch-changed 带当前完整 evidence，不能拼接两个 epoch。Session 的 unavailable 保持 unavailable，不返回空页；unknown 不改为空历史或未发生。缺访问身份或可信目标时不调用历史读。
- 本插件不等 AD-03 补拉：提醒是否落在固定 upper 内，取决于 AD-03 [1c](#ad-03-1c) 的补拉时点，两者之间没有通道（1c 的已知限制）。history 组 `readCount/readSource` 的 token 覆盖新输入的可靠保存、固定全部页、压缩窗口和 open 下界。前后 token 相同意味着这些相关事实未变。重启、来源替换或计数回绕换代；RQ 最多两次稳定读取，不把 execution revision 或到达顺序当作跨 execution 的 Session 顺序。

CM-02 的来源完整性由本插件及其 Session 历史提供者负责：

1. 无此前合法压缩时交出固定上界内完整窗口。存在最新合法压缩 C 时，交出 C.retained 原件、C 和旧 C.covers.to 之后直至固定 upper 的全部未覆盖尾项。不能按 C 的插入位置截断。e1、e2、e3、C1 中 C1 覆盖 e1-e2 且保留 e2 时，下一窗口仍含 e2、e3、C1。
2. previous 窗口的有效 Tool 结果带原最近可答调用的引用或 null，以及原 after、pairings 与 open 证据。隐藏调用只给关系材料，不重读已摘要正文代替原判断窗口。完整性、最新合法 C、retained、tail 与 open 都绑定同一 evidence。
3. assistant 行的 `sourceCall` 只在有真实原 Model 来源时给出，并带原 tenant 与 ModelCallId。其他角色不带 sourceCall。不从 execution、消息作者或到达顺序补造 Model 调用身份。缺完整原前缀及 system/tools/parameters/replay/visibility 的可信不变依据时省略 continues。
4. `CompactionPlan.basis` 保留原 context、projected、pairings/sourceCall、selection、representation 与 continuation 依据。序列化恢复不读另一份历史来补原依据。非法 basis 不推进进度，但已发出的摘要调用及未知责任保留。trim 只裁剪摘要材料，不改原合法性依据。真正提交压缩仍由 Session 核当前 epoch，经 AD-01 的 context-transition 共同提交。

模型视图只给消息页，不能单凭 `readModelView` 伪造完整压缩窗口或来源证据。适配从同一 Session 日志的固定历史读、原关系索引和合法来源取补充材料。必要原材料或来源读口未具备时返回 unavailable，不发布不完整来源集合；生产索引及来源接线尚未交付。

- 未结工作下界：本插件以 `readWork` 取快照，调 `openWork`，把各类未结工作映射为条目引用集合（跨边界编码为 `RecordEntryRef`），交给压缩计划作为保留名单的下界。FR-06 的 unassociatedWaiting 按原 consumption/position 定位原 SE18 与生效 SE22，两者均进入下界和 compaction.open 核对；关联后沿同一责任映射并去重。控制解除等待后，尚未交清的 pendingUnassociatedWaiting 仍由同一 openWork 交出，其原 SE18、原 SE22 与承载待办的 SE24/SE25 一并进入下界和核对。其后真实关联使 unassociatedWaiting 移除而 waiting 仍为空时，unsettledControls 仍以原控制操作身份定位原 SE24 的固定选择、生效 SE25、原 SE18/SE22 与关联条目，保留到原责任依证据解除。不以无 ProducerRef 或字段省略交空下界。未读的 Agent 事件计入下界（[EC-03](../session-contract/SPEC.md#ec-03)）。权威读失败时，本插件报告不可用，不交空集合。

来源集合登记与结束：

- 来源适配者以显式 `(tenant, scope)`、owner 与当前来源代次调用 `ContextSourceRegistry.register`，一组发布 groups、adopted、history、conversions、eligibility、preparation。七组中 identity 仍由 RQ 按调用访问身份取值，其余组按公开 `ContextGroupSources` 提供。AD-04 不单独注册半套 history。
- replace 使用原 RegistrationRef。旧 withdraw 不能删除后继，旧代在途不能发布新结果。withdraw.settled 等待该代实际操作与 Model 租约交还。应用装配负责来源关闭；独立窄 adopted/accounting 读取与 registry 借用分别收口，不能用一边 settled 推定另一边结束。
- `AdoptedRequestSource.readCount/readSource` 只读已有固定请求权威事实，输入是普通 Access/target。权威事实是会话日志 Journal 提供者的分区 `a`（[分区存储](#分区存储)），它与主用途 M0 同一次提交写入。不回调 RC、assemble 或 usage，不制造执行修订为会话采用顺序：`order` 取 `a` 自带的采用计数。合法 adopted=null 与 usage 的非法 value:null 分开。not-fixed、unmeasured、actual、estimate 保持 RQ-14 原状态，required:true 不变。
- 原账目从 Agent Journal 经 Agent 的 AccountOutlet 交给 Context，不由 Session 转发，不更换其幂等键。系统重建授权、checkFact 与后续追赶归对应来源拥有者，普通 Access 不替代系统授权。
- 来源齐备与 current 接线是生产提供者的验证义务。NP-02 只保留缺少真实来源材料与生产接线的状态，不再声称 RQ 没有登记入口。窄采用来源的材料已由分区 `a` 交付，发行装配的接线（F6）仍待完成。

前缀摘要缓存只缓存已核权页，键含 tenant/session/epoch/seq；命中不代替每页核权。人侧视图调用 RQ 纯操作 `projectForHuman`，不写回。

##### AD-04 的实现现状

按 [P2 决策记录](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6561777147) 第 2、3 条，来源集合由 agent-context 登记。AD-04 不调用 `register` 或 `replace`，它提供 K-RQ `contextHolderSources`，把会话侧四个部件租借给登记者。上文「来源集合登记与结束」中由 AD-04 登记的各条，按该决策由 agent-context 承担。RQ-12 的结算义务仍在 AD-04：它是来源持有者。

`createSessionHistorySource`（`src/cordis/history-source.ts`）给出两个子插件。两个子插件都在 `session` 缺席时停在 `PENDING`。

1. 历史源子插件 `session-ad04` 注入 `session: { caller: 'reader' }`，提供 `contextHolderSources`。每次 Session 调用都用本次部件调用的 Access，插件没有自己的主体。
   - 租借是借用方 fiber 的效应。`release` 或借用方卸载结束租借，持有者在这时拉取借用方交入的结算函数。持有者卸载时先拒绝新的租借（答 `unavailable`），等全部已拉取的结算结束，再关闭借出的读口。读口关闭之后，四个部件都答 `unavailable`，不再调用 Session。
   - 每个部件先核 Access 与目标：缺 Access 或租户为 `invalid`；目标租户不等于 Access 的租户时答 `denied`，不调用 Session。
2. 下界子插件 `session-ad04-lower-bound` 注入 `session: { caller: 'coordinator' }`，以本次 Access 调用 `readWork`。历史源子插件经同一工厂的内部链接使用它，用于未结工作下界与会话的作用域绑定。它缺席时，历史依据解析与压缩窗口答 `unavailable`，`read`、读取资格与窄采用来源照常工作。

四个部件：

| 部件 | 怎样兑现 |
| --- | --- |
| `resolveHistory` | 装配交入的解码端口 `heads` 把历史依据（Agent 执行快照的 `history`）译为租户与会话。不认识的依据答 `invalid`；租户不等于 Access 的租户时答 `denied`。然后以 `readWork` 取会话的作用域绑定：最新绑定是当前作用域，它已结束时答 `unavailable`。会话的全部作用域进入作用域到会话的索引。再以 `readModelView`（依据为 null）取当前 epoch 与上界 |
| `history.read` | 由索引找到目标作用域的会话。索引里没有时答 `unavailable`，不调用 Session。依据译为 `ModelViewBasis`，返回行的 seq 按上面的行号换算。续读用 Session 签发的游标，代价与界限见 K-18：源子插件按会话与 epoch 在进程内记住每个签发游标所在的行和见过的每行字节数，每次从 after 之前最近的已记游标开始读，跳过 after 及之前的行，交回的行不超过 `budgetBytes`（至少一行）。到达上界的页不带游标，所以这样一页之后再读一次上界前一行之前的行，取得上界前一行的游标；下一轮从那里开始，只多读一行。没有可用的游标时（冷启动的源子插件、另一个 epoch、Session 拒收记住的游标，或已记的游标被上限淘汰）从 epoch 开头读，跳过已有的行。一次读取内用本次读取里 Session 返回的 `next` 游标翻页前进，不靠游标表里还剩哪些记录，所以表满时从开头读也一定前进到 after，每页最多 200 行（存储的页限制），Session 调用数约等于行数除以 200；游标表满 16 个时丢掉行号最低的游标，刚签发的那个不丢；Session 拒收记住的游标时丢掉该会话的全部记录，再读一次。游标必须绑定同一依据，否则答 `invalid`。行的 `bytes` 转为十进制文本；没有行带 `sourceCall`，因为模型视图不带原 Model 调用。`epoch-changed` 带当前完整依据。Session 的失败不成为空页 |
| `history.compactionContext` | 先读上界所在的行，再以 `reader` 前向读完整个会话日志，以 `coordinator` 读 `readWork`。窗口与未结工作下界用本成员 `./testing` 会话的同一个窗口函数（`compactionReads`，含 `openWork`）求得，然后截到上界所在的条目。`coverTo` 不在上界之内时答 `invalid`。最后再读一次上界所在的行，epoch 已变时答 `epoch-changed` |
| `eligibility.check` | 由索引找到会话，以本次 Access 做一次 `readModelView` 读取。Session 允许时答 `allowed`，`denied` 原样交出，其余失败答 `unavailable`。`revision` 只随历史源子插件的代次变化 |
| `adopted` | 先做与 `eligibility.check` 相同的核验。然后按调用取 `sessionAdoptedRequests`（session-cordis-contract，会话日志 Journal 提供者在 `agentJournal` 的同一插件体里提供），以本次 Access 与索引里目标作用域的会话调用 `readAdoptedRequest`。服务缺席时答 `unavailable`（诊断 `adopted-requests-absent`）。提供者的 `denied` 原样交出，`unavailable` 与抛错答 `unavailable`，不答 `null`。提供者答 `null`（本会话还没有主用途 M0）时答 `null`。有记录时用 request-context-contract 的 `decodeFixedRequestRecord` 解码 `record`，不能解码答 `invalid`（`adopted`、`unsupported-format`）。记录的租户不等于 Access 的租户时答 `denied`。记录的作用域不等于目标作用域时，读完分区 `a` 之后再做一次相同的核验，并以 `readWork` 读会话的当前作用域：目标仍是当前作用域时答 `null`（上一次主用途 M0 固定的是更早作用域的请求，目标作用域还没有固定过）。目标作用域已经退役（例如读取期间会话归档、撤销归档换到新作用域，新作用域的首次 M0 已落盘）时答 `unavailable`：它固定过的请求已经读不到，不是「没有固定过」。当前作用域读不到，或下界子插件缺席时，也答 `unavailable`。`a.coverage` 缺席，或记录里覆盖的摘要（规范文本的 SHA-256，base64url，与 agent-context 铸证据的算法相同）不等于 `a.coverage.digest` 时，答 `invalid`（`adopted`、`source-evidence-conflict`）。`reference` 经 model-contract 的 `resolveModelInvocationRef` 按目标租户解不开时答同一个 `invalid`。都通过时交出 `AdoptedRequestFact`：`coverage`、`candidate`、`windowTokens`、`forecast`、`continuation` 取自记录，`target` 是本次目标，`call` 是解出的调用，`order` 是 `a.order`，`committed` 是 `a.fixed`，`accounting` 恒为 `unsettled`（账目依据在波 3 的 F7）。`readCount` 读同一事实：有事实时令牌由历史源子插件的代次、`order` 与 `committed.digest` 组成，没有时由代次、`none` 与目标作用域组成，只在新的主用途 M0 落地时变化 |

epoch 的翻译：Session 的 epoch 文本可能含控制字符（本成员内存会话的 epoch 就含一个），`EpochId` 不接受它们。本插件把控制字符、空格、DEL 与 `%` 写成 `%xx`，反向时还原，所以翻译可逆。

已知缺口：

- 历史依据到会话的解码由装配交入（`heads`）。现在的 Journal 核心铸造的 `history` 依据只带会话命名空间与执行修订。解码的真实提供者没有交付。
- 窄采用来源的 `accounting` 恒为 `unsettled`，所以 RQ-14 的 `usage` 最多到 `estimate`。`unique` 要从结果接收条目的账目关联，放在波 3 的 F7。`continuation` 也在 F7 填写。本改动之前写入的会话没有分区 `a`，读作 `null`。
- 作用域到会话的索引只由 `resolveHistory` 建立，在进程内保存，有上界。进程重启之后，同一作用域在下一次解析之前答 `unavailable`。
- 压缩窗口每次前向读完整个会话日志，不按游标增量读取。它用的窗口函数在 `src/testing/`，与 K-10 同理。上一次合法压缩之后的窗口（`base` 为 `previous`）没有用例，因为内存会话的压缩提交要经 Agent 参加。
- 前缀摘要缓存没有实现，每页都读 Session。
- 历史源子插件以 `reader` 调用 Session，主体是本次 Access 转交来的会话协调者主体（[#978 答复](https://github.com/nemori-ai/omne-harness-lite/issues/978#issuecomment-6562982342) Q-3）。`forSession` 的 actor 只有 `coordinator` 与 `maintainer`，所以主体的 actor 不等于调用方类 `reader`。Session 的调用方类核对只比插件配置，不比 actor，所以放行不受影响。

验证：[tests/history-source.spec.ts](tests/history-source.spec.ts) 在真实 Cordis 4.0.4 上运行。Session 是本成员 `./testing` 的内存会话，经脚本 Session 服务接入；历史依据解码是脚本替身。`contextHolderSourcesConformance` 的十一个用例通过，窄采用来源是真实实现，读的是脚本化的 `sessionAdoptedRequests`。窄采用来源另有十一个用例（FIXED-FACTS F5、R2-D242）：没有主用途 M0 时答 `null`，一次之后 `AdoptedRequestFact` 的十个字段逐项等于映射；令牌只在新的 M0 时变化；两个 execution 的 M0 依次答 `order` 1 与 2；记录的租户不符答 `denied`，作用域是更早作用域且目标仍是当前作用域时答 `null`；脚本化提供者在读取期间把目标作用域换成退役作用域、新作用域的 M0 已落盘时答 `unavailable`；记录是另一作用域而下界子插件缺席时答 `unavailable`；提供者答 `unavailable`、`denied` 或抛错时分别答 `unavailable`、`denied`、`unavailable`，不答 `null`；服务缺席答 `unavailable`；记录的覆盖被改过或 `a.coverage` 缺席时答 `source-evidence-conflict`，记录不能解码时答 `unsupported-format`；RQ-14 组合用真实的 `createContextAccounting`（request-context 只作开发依赖），目标经空重放重建，`usage` 在首次 M0 之前为 `not-fixed`，之后为 `estimate`，`usedTokens` 与 `windowTokens` 取自记录；真实 agent-context 的 `prepare` 得到的 `ready.state` 与 `ready.coverage` 作为分区 `a` 的内容，AD-04 的覆盖摘要核对通过（agent-context 与 runtime-context 只作开发依赖，夹具 `tests/fixtures/agent-context-ready.ts`）。变异：把提供者的 `unavailable` 改成 `null`、`order` 改取 `fixed.revision`、去掉覆盖摘要核对、令牌不随事实变化、不比较作用域、作用域不符时不再核对当前作用域（直接答 `null`）、摘要改成十六进制或不排序的文本，各自让对应用例变红。SS-21 用例里读者持有上一次读取的游标，对 N = 10 与 N = 100 行比较游标之后的 Session 调用数（两次）与读到的行数。内存会话按行号续读，看不出游标是否不透明，所以 [tests/history-source-cursor.spec.ts](tests/history-source-cursor.spec.ts) 用 session-storage-sql 的 Session 端口（node:sqlite 替身，运行发布的模块，游标经签名）验证：跨页读只交出 Session 签发的游标；连续三轮每轮新增两行，每轮读到的行数在 4 行与 40 行的历史上相同，不超过 5 行；冷启动的源子插件、被拒收的游标与另一个 epoch 都从开头读，答出的行正确；420 行的历史先记满 16 个以上高位游标，再从开头读，答出全部行，Session 调用数不超过行数除以 200 取整加 3（上限淘汰后的回退）。SS-21 用例把读到上界后的两次 Session 调用（一页续读、一次补取游标）写成具名常量，两档历史都断言等于它，并带一条从头读的负控（调用数随历史增长时同一断言变红）。变异：恢复上限淘汰的原次序（刚签发的游标可被丢）或换回上一版的 `history-source.ts` 时，游标表满的用例变红；每次都不记游标时读取量与 SS-21 用例变红；把行号当游标交出时跨页与多轮用例变红；游标记录不按 epoch 分开时 epoch 用例变红。没有对真实 sqlite-provider、真实 agent-context 或真实 Request Context 运行。

<a id="ad-05"></a>

#### AD-05 Model 日志消费适配

本插件只读 Agent 宿主结果接收方已经写入同一日志的结果与账目，不 inject modelRuntime。它经同一 AgentJournal 的 `load().entries` 选择 `kind: received` 且 `delivery.producer: model` 的条目。结果交付的 `delivery.accounts` 是冻结时各 dispatch 的账目快照；账目交付的 `delivery.account` 是 `delivery.key` 指定修订的 CallAccount。两者按原生产者交付键认回，不把没有报告写成零。完整结果材料用该条目的 `material` 引用，经同一提供者的 `AgentMaterials.read` 取得，并按 Agent J02 核对既定 schema、租户、原调用、版本与消费绑定。entries 字段缺席表示不支持，返回 unavailable，不能当作空列表；材料缺失或不可读显式失败，不能用 results 或事件补造。`load().results` 只读取原结果责任及下述 Tool 确认，不承担 Model 账目读取。事件正文另经 output.read / output.events 读取，不读取 load.events。每次读与解释均核对当前资格、租户、原 execution/Run、consumption 与完整版本，再翻译为现有 Session 生产者事实。后果、解释进度与该次认回答案按 AD-02 在后续 Session 提交原子保存，不撤销 Agent 先前已发布的 received、材料、绑定或 saved。读取不可用时保持未知，重复读取按原事实身份认回，不重新调用 Model。

收到 received 与 saved 不能推导 ACK。Model 确认路径是 Session [JC-Release](../session-contract/SPEC.md#jc-release) 的 MODEL-ACK-ARRIVAL 未决义务。冻结 Agent recordResult 排除 Model 采用，接收共同提交不执行 ACK。因此没有已采用的 ACK 记录可读时保持 pending，暂停该 confirmed 投影。不得发明 JournalEntry、Agent 端口或直接 Model ACK 路径。

Tool 宿主收到 saved 后自己解除交付责任，结果接收方只返回 saved。Tool 原生产者确认怎样进入同一日志，是 Session 的具名偏离 [JC-RELEASE-TOOL-PATH](../session-contract/SPEC.md#jc-release-tool-path)。日志中已有该确认时，本插件按 load().results 读取并投影。详细资格、原版本、receipt 与认回条件同 JC-Release。两类生产者不得混同。

##### AD-05 生产插件

`createSessionModelLogConsumptionPlugin(input)`（`src/cordis/model-log-consumption.ts`）返回插件 `plugin` 与调用入口 `consume`。插件不提供键。

- 装载：`inject` 为 `session: { caller: 'coordinator' }`、`agentJournal`、`agentMaterials` 与 `sessionTransactions`。缺任一键时插件停在 `PENDING`。任一依赖换代时插件重跑。`input.coordinator` 与 AD-14 的同名输入相同：装配入口按会话给出 coordinator 主体。
- 触发：插件订阅 `session-adapters/agent-published`，对事件所名的执行调用自己的 `consume`，按会话排队。`consume` 从已存进度起读，所以没有新 Model 条目的事件不提交。received 经 `agentJournalEntries.record` 写入后自动消费一次。
- 调用：`consume({ tenant, session, execution })` 只进入当前一代插件。插件停在 `PENDING` 或已经停止时，调用答 `unavailable`。插件停止时仍在等待读取的调用不提交，答 `unavailable`。
- 读取：插件以 `coordinator` 经 `session.work.readWork` 读会话，找出拥有该 execution 的 Run。找不到时答 `unavailable`，`owner` 为 `session-history`。插件再经 `agentJournal.load` 读执行。`entries` 缺席时答 `unavailable`。`kind: received` 且 `delivery.producer: model` 的条目按提交顺序组成 `model-received` 通道。
- 核对与翻译：插件从已存进度之后逐条处理。
  1. 插件按租户解析调用引用。引用属于另一租户时答 `denied`。
  2. Session 快照须有该调用的 Model 生产者绑定。没有绑定时，本条与其后各条等待，不提交，也不当作空项。绑定的 consumption 或 consumer 与条目不同时答 `invalid`。
  3. 插件经 `agentMaterials.read` 读条目的 `material`。读取失败原样交回：拒绝保持拒绝，其余答 `unavailable`。材料须是 facts 分支，schema 等于 Agent 结果接收方的采用 `agent:received-model-delivery/1`。材料里的租户、交付键、consumer、账目快照或账目须与条目相同，并通过 model-contract 的 `judgeModelDelivery`。租户不同时答 `denied`，其余不符答 `invalid`。
  4. 结果条目译为该调用的 `execution` 事实。有 dispatch 报告了账目时，另译一个 `account` 事实。账目条目译为 `account` 事实。没有报告不产生事实，不写零。两种事实的来源都是条目的 `material` 引用。
- 提交：已核对的各条组成一次观察，交给 `sessionTransactions.commitEntries`。后果行、进度行与操作答案在一次 Session 提交里发布。`start` 取 `readWork` 读到的已存进度。操作身份由观察确定地派生，形如 `ad05_` 加摘要。Agent 快照没有执行头证据，插件按 load 的修订与通道条目派生 `boundary.executionEvidence`，`owner` 为 `session-adapters/model-log`。
- 失败与认回：`commitEntries` 答 `commit-unknown` 时，插件以同一观察再发一次，认回原操作。答 `changed` 时插件重读进度，最多三轮。`commitEntries` 抛错时答 `commit-unknown`。提交失败不撤销 Agent 已发布的条目、材料、绑定与 saved，进度也不推进。依赖在提交前抛错时答 `unavailable`。
- 重复读取：已存进度覆盖的条目不再读材料，也不再提交。插件不注入 Model，也不调用 Model。
- 不在插件里：Model ACK 到达仍未决，插件不产生 release 或 confirmed，`commitEntries` 也不接收它们（EI-20）。Tool 原确认的投影（JC-RELEASE-TOOL-PATH）不在本插件。插件自己经发布事件触发；装配页现在没有这一行。
- 装配给：`agentJournal` 与 `agentMaterials` 来自同一个提供者，读同一份已提交状态。生产侧两键都由 `SessionLogAgentJournalProvider` 在同一插件体内兑现（[已知限制](#已知限制)第 6 条只剩 `materials.preserve` 的路由）；装配页还没有本插件的行，生产组合里 `session-ad05` 仍是替身。
- 验证：`tests/model-log-consumption.spec.ts` 在真实 Cordis 4.0.4 上运行，Session 与 Agent Journal 用 `./testing` 的内存提供者，结果接收方的写入用同一提供者的 `received.commit`。用例覆盖：发布事件之后不调用 `consume` 也消费一次、插件停止后事件不消费、结果与账目的翻译、未报告账目、重复读取、丢答复认回、`changed` 重读、`entries` 缺席、材料读不到与各类不符、绑定不符、进度超过条目、执行不属于会话、未绑定调用等待、另一租户的目标、调用引用与材料、提交失败与抛错、四个依赖逐个缺席、停止后与停止时在途的调用。内存提供者不证明耐久、跨进程或会话日志生产提供者上的组合。

<a id="ad-06"></a>

#### AD-06 Tool 日志消费适配

- 注入同一 AgentJournal 提供者的读取与材料视图，并以 `coordinator` 调用 `session`。不注入 `toolRuntime`，不查询 Tool 收场、结果、附件或账目。
- Agent 宿主结果接收方先把 Tool 结果与账目写入同一会话日志。本插件从 `load().entries` 选择 `received` 且 delivery.producer 为 tool 的条目，并经同一提供者 `AgentMaterials.read` 取得原材料。Tool 结果带 account 或 null，账目交付带原修订的 CallAccount。只有原 Journal 记录可证明的字段才投影；尚无报告保持未知，不填零。原 recordResult 路径的公开结果责任按 load().results 读取，不以条目字段缺席表示空记录。
- 读取前核当前资格、租户、原 execution/Run、原 Tool 调用、consumption、完整版本及 schema。缺材料、未知 schema 或读不可用按原失败关闭，不直接读生产者补齐，也不发明新 Journal 条目。
- 当前公开 `ReceivedDelivery` 保留 Tool 的 key 与账目，`Material.tool` 只有 ProducedResult 和结果页，`load().results` 只有结果责任；它们不直接声明 terminal、actualTerminal、effect。Agent J02 第 11 项的完整 facts schema 约定只明确覆盖 Model。Tool 收场解释若缺少原拥有者已经采用且可读的完整材料，返回 unavailable 并保留任务；不能从结果页、release 或“存在 received”推定已收场。完整 Tool 收场材料的生产与 schema 接线归 Agent 契约与宿主拥有者，补采用放在里程碑 M2，见应用装配页缺口表的 [TOOL-SETTLEMENT-SCHEMA](../../../docs/architecture/runtime/application-assembly.md#tool-settlement-schema) 行。本成员不在此处另定协议。
- 收场与账目分别以 `receive(execution)`、`receive(account)` 提交，身份从原生产者记录与修订确定派生。Session 后果、解释进度与该次答案沿 AD-02 同批发布。重复读取认回；未知先查原操作；失败不撤销已经保存的 Agent 原事实。
- Tool 的迟到版本归原消费绑定，不创建新 Run 或调用。仍有后续投递资格的后台结果按 EC-08 登记后交受理；归档撤销资格的结果按 EC-07 只保管，不自动进队列。
- 触发：插件订阅 `session-adapters/agent-published`（同 AD-05，共用 `src/cordis/published-queue.ts` 的 `subscribePublished`），对事件所名的执行读一次，按会话排队。事件只是唤醒，不带主体：输入的 `coordinator` 与 AD-05 同形，按会话给出 coordinator 主体，插件在每个事件上取一次再读。`coordinator` 缺省时插件不订阅，只有 `consume` 可读；`coordinator` 拒绝时不读、不提交，写 warn 日志。`consume` 从已存进度起读，所以没有新 Tool 条目的事件与重复事件不提交。插件停止后的事件不触发，已在途的触发在提交前核对停止、不提交。已知限制：装配页的 `session-ad06` 行目前不给 `coordinator`（页上没有会话 coordinator 主体的来源），所以该行装配出的插件尚不自动消费；行补上 `coordinator` 与 Tool 交付材料读法（[TOOL-SETTLEMENT-SCHEMA](../../../docs/architecture/runtime/application-assembly.md#tool-settlement-schema)）后触发才生效。
- 本插件不发送生产者交付解除，也不写 ProducerFact.release。Tool 原确认的读取归 AD-05，遵循 Session [JC-Release](../session-contract/SPEC.md#jc-release)，Tool 原确认怎样进入同一日志见 [JC-RELEASE-TOOL-PATH](../session-contract/SPEC.md#jc-release-tool-path)。Model ACK 未决状态保持。

模型选择由应用装配一侧的适配器实现 Agent 的 ModelSelection，Session 组不提供 `agentModelSelection`。会话只保存选择及其来源；解析与发送资格仍由各拥有者负责。

### J06 会话路径的两个 Agent 提供者

本成员在会话路径分别提供 `agentMessageHandoff` 与 `agentConditions`。它们扩展 Agent 已公开的 `MessageHandoffService` 与 `CurrentConditionsService`，不另定义键。每个插件以 `coordinator` 调用 Session（当前条件的子插件以 `maintainer` 读保存的模型选择，见下文），并从同一日志的可信 execution/Authority 到 Session/Run 绑定定位目标，不从全局容器或连接猜会话。

| 提供者 | 消费的公开输入 | 本插件责任与结果 |
| --- | --- | --- |
| `agentMessageHandoff` | `MessageHandoff.prepare` 的 Access 与判别分支（execution 带 PendingHandoff 与 advance；invoke 带 InputHandoff 与 InvokeRuntimeContext；submit 只带 InputHandoff）；`lookup` 的 Access 与 HandoffLookup；`exclude` 的 Access、PendingHandoff 与取消 control | 依 Agent 的[消息准入](../../agent/agent-contract/SPEC.md#消息准入)核六类原来源、候选消息及原位置。prepare 先耐久固定 Agent 外部入口索引 Ki 到 H 的映射、完整原 request 与 origin，再固定 prepared（确切消息与准入证据）或 rejected（原原因与证据）后返回；同 Ki 或 H 配同完整业务输入认回原结果，异输入 conflict。模型完整回复、工具结果、被拒绝动作的拒绝消息、系统提醒与压缩转换消息只因校验失败或保存失败返回 rejected。外部输入的内容处理与业务否决由 Session 受理方在交给 Agent 前完成，本端口不追加业务否决。submit 分支只核原 execution 的当前提交资格，不要求活体 runtime、挂接或槽。lookup 只核当前读取资格，返回 recorded、excluded 或 unknown，不转换、不写历史；exclude 从同一日志的可信 P 与取消 control 核验后封闭尚未发出的内部准入，不写 Session 消息。身份或依赖失败沿 Agent Reply 返回，不变成 rejected。证据绑定本次候选及原来源；prepare 不写 Session 消息。最终消息分三路写入：工具结果、拒绝消息、系统提醒与压缩转换消息由 Agent 的应用操作 Ja 经 AD-01 的 message 或 context-transition 参加写入；外部输入随原 open 或 submit 写入；主回复经 Ja 的 replyAdmission 写入。prepared 不伪造已提交消息。 |
| `agentConditions` | `CurrentConditions.read` 的 Access、advance、previous | 以原 Authority/grant 定位当前 Session Run，读取当前 Session 事实和实际已采用配置、模型选择、Context 及 bindings，构造公开 RuntimeConditions。source 是这些事实的真实依据。previous 只供比对，不授予资格或允许复用失效条件。缺少任何必要原来源时 unavailable，不用模式词补造推进授权，也不从默认配置填空。 |

两个插件都逐次核当前访问与原租户关系，各用的访问检查如下（与装配页 `session-handoff`、`session-conditions` 两行一致）：

- `agentMessageHandoff`：`inject` `agentAccessCheck`，对 `prepare`、`lookup` 与 `exclude` 收到的 Agent `Access` 每次调用核一次当前访问。它读写 Session 时经 `session` 面，由 Session 执行边界按 `sessionAccessCheck` 在每次面操作开头再核一次，那是 Session 操作自己的裁定，不替代 Agent 一侧的检查。
- `agentConditions`：不 `inject` `agentAccessCheck`。`CurrentConditions.read` 收到的 `Access` 只经 `session` 面使用，由 Session 执行边界按 `sessionAccessCheck` 核当前访问；本插件不自行裁定，也不缓存 allowed。装配页给它加上 `agentAccessCheck` 之前，Agent 一侧没有独立的访问检查，这是已知限制。

#### J06 消息准入的生产插件

`createSessionMessageHandoffPlugin(input)`（`src/cordis/message-handoff.ts`，行 `session-handoff`）返回提供 `agentMessageHandoff` 的插件。

- 装载：`inject` 为 `storage`、受信 `tenantDomainLookup`、`agentAccessCheck` 与 `session: { caller: 'coordinator' }`。缺任一键时停在 `PENDING`，不提供键。配置是声明的 Session 日志组合（`combinationVersion`、`manifestDigest`）。`input` 给出协调者主体端口 `coordinator`、主体的稳定身份 `principalIdentity`（不含凭据）与本实现的采用 `provider`。插件停止后，持有旧引用的调用答 `unavailable`。
- 绑定（Agent 消息准入第 1 步）：每个分支的会话来自可信事实，不来自输入。
  - invoke：`runtime.scope` 是 AD-14 交给实例的会话槽作用域（`sessionScopeEvidence`）。它的 record 是会话。按调用者租户重算的摘要与 scope 不等时答 `denied`，这只是一致性核对：摘要不带密钥，谁都能算出同一租户、同一会话的值，所以它不是守卫。跨租户隔离由租户域查询（租户没有可用的事务域时读不到、写入次数为 0）与 Session 执行边界（协调者读该会话快照并按 `sessionAccessCheck` 核访问）保证。再以协调者读该会话快照，当前 Run 须活跃且属于请求的 execution。然后以 `invoke` 与 `scope` 目标问 `agentAccessCheck`。
  - submit：沿执行索引按 (租户, execution) 找会话；没有时答 `denied`。快照的当前 Run 须属于该 execution，再以 `submit` 与 execution 目标问 `agentAccessCheck`。
  - execution：沿执行索引找会话，从同会话的 Journal 状态认回 P（请求须与 Journal 保存的 P 相同，否则 `invalid`）。这是运行时在已核验操作之内的调用，不再问 `agentAccessCheck`。
- 认回（第 2 步）：外部请求按 Ki（execution 与原入口操作），内部请求按 H 读 `execution-record.preadmission`。已有记录的请求不同答 `conflict`；已有结果原样返回，先于 advance 判定。
- 推进资格（第 3 步，execution 分支）：Journal 状态里该 advance 对应的 attempt 须等于快照的当前推进，否则答 `stale-advance`。
- 意图（第 4 步）：首次调用以 `preadmission` 意图阶段同次保存 Ki、H、完整 request、origin、主体稳定身份、资格依据与实现采用，存储提交确认之后才继续。
- 结果（第 6 步）：当前没有表示转换，prepared 的 message 取原 candidate，准入依据取原资格依据；候选不通过 `judgeMessage` 时为 rejected。以结果阶段固定一次，然后答复。
- `lookup` 以 `read-message-handoff` 问 `agentAccessCheck`，只读记录：有结果答 `recorded`，只有意图答 `unknown` 并带原记录，没有记录答 `unknown`。`exclude` 尚未交付，答 `unsupported`。
- 验证：`tests/message-handoff.spec.ts`（node:sqlite 替身）覆盖三个分支、同 Ki 认回且不写、伪造与他租户作用域、无 Run 的 execution、资格拒绝、P 不符、`stale-advance` 与结果先于 advance 认回、lookup 不写、他租户读不到。`tests/message-handoff-real.spec.ts`（真实 sqlite-provider，慢层）在子进程保存后杀进程，新进程按原 Ki 读回完整记录，同一 prepare 认回且不写。

#### J06 当前条件的生产插件

`createSessionConditionsPlugin(input)`（`src/cordis/conditions.ts`，行 `session-conditions`）返回提供 `agentConditions` 的插件。这是 R2-D145 的最小实现：每个字段都从已提交的 Session 事实读取，公开形状与完整设计相同；完整设计（波 4）把 `configuration` 的来源换成采用协调者的读口，不改形状。

- 装载：`inject` 为 `storage`、受信 `tenantDomainLookup` 与 `session: { caller: 'coordinator' }`。缺任一键时停在 `PENDING`，不提供键。插件体另装子插件 `session-conditions-selection`，它只 `inject` `session: { caller: 'maintainer' }`。没有配置。`input.defaultModes` 是运行时对象：按 `(tenant, session, definition, source)` 解出 `tenant-default` 模式的值与依据，装配者基于部署的定义映射实现它；它只能交出与 `source` 逐字相等的采用所代表的模式，否则答不可用。插件停止后，持有旧引用的调用答 `unavailable`。
- 定位（以原 Authority）：按 `Access.tenant` 取事务域，租户没有事务域答 `unavailable`；沿执行索引按 (租户, `advance.execution`) 找会话，没有时答 `denied`；以 `coordinator` 面、调用方自己的 `Access` 读快照，Session 执行边界按 `sessionAccessCheck` 核访问，Session 的 `denied` 原样交回，其余失败答 `unavailable`。快照的当前 Run 须活跃、持有该 execution，并且 Journal 记录里该 Authority 的 attempt 等于 Run 的当前 attempt（与消息准入第 3 步同一规则），否则答 `stale-advance`。
- 字段：`configuration` 是当前 Run 的采用（SE08/SE13）。`progression` 由当前协作模式投影：`co-work` 为 `evaluate-completion`，`auto-drive` 为 `continue`（[系统页](../../../docs/architecture/runtime/session-and-run.md#会话模式)：`auto-drive` 增加目标完成检查）；当前模式取快照 `changes` 里最后一条 `collaboration-mode` 声明，其 `authorization` 为 basis；没有声明时取创建的 `modes`：`explicit` 直接取值，basis 为快照 `declarations`；`tenant-default` 经 `defaultModes` 解出值与 basis。`model` 是 `readModelSelection` 保存的路由的采用依据。这项读取只接受 `intake` 与 `maintainer`（[控制与模型选择](../session-contract/SPEC.md#控制与模型选择)），所以由子插件 `session-conditions-selection` 以 `session: { caller: 'maintainer' }` 读，调用方自己的 `Access` 原样交给 Session（[AD-00](#ad-00) 第 1 条：一个插件只用一个调用方类）。子插件没有运行时，读取答 `unavailable`。投影是：`{ owner: basis.owner, name: selection.name, revision: basis.revision, digest: basis.digest }`。`context` 是会话未结束的 Runtime Context 作用域绑定的证据（`owner: 'session'`，`record` 为作用域，`revision` 为代次）。`bindings` 是快照 `residents` 逐条投影的采用（`owner` 与 `digest` 取准入证据，`name` 为能力，`revision` 为版本）。`source` 的 `digest` 是这五项的摘要，同一事实得到同一值。
- 缺失：`defaultModes` 不可用、尚无模型选择、没有未结束的作用域，都答 `unavailable`，不取任何默认值；`previous` 只供比对，不授予资格，也不跳过任何核对。
- 已知限制：生产 create 的常驻集随映射填充（G-RESIDENTS，R2-D159、R2-D169），首装限制见应用的 [adoption-sources 行页](../../../apps/harness-server/docs/rows/adoption-sources.md)；Session 保存的模型选择没有采用身份，`model` 按上述投影；`adoptionCoordinator` 读口（#688）到位前 `configuration` 直接取 Run 采用。
- 验证：`tests/conditions.spec.ts`（node:sqlite 替身、真实 Cordis；替身 Session 按调用方类拒绝 `readWork` 与 `readModelSelection` 的表外调用）覆盖完整来源时各字段与原事实一致且同事实同 `source`、auto-drive 的默认与声明变化、默认模式不可解、无模型选择、未登记 execution、已停止提供者、他租户 Access 读不到快照、被取代 Authority 带 previous 仍答 `stale-advance`。

两个插件的当前来源、合法 Authority、配置/Context 采用和受理前内容政策仍由各原拥有者提供，本规格不发布新的政策端口。真实提供者未交付时不能装一个默认允许或空条件的插件冒充就绪。

### 实时显示适配

显示适配只消费 `@omne-harness/stream-arrival` 公开的 `StreamObserver` 和 `StreamFrame`。按 Session 日志的稳定原调用关联取得生产者当前 StreamRef，观察请求另带真实 Access 与 AbortSignal。重新挂接重新取得当前引用，引用不带凭据，引用租户与 Access 必须一致。

snapshot 建立显示基线，delta 只接同一流及原 from；gap 明确显示缺口并重新同步，不补造丢失正文。ended 的 source-closed、observer-closed、stale-stream、denied、unavailable、capacity 与 producer-ended 仍保留原区别。显示断开、结束或取消均不能控制执行，不能确认结果保管、处理或交付解除，也不形成 Run 终态。最终历史消息仍来自 Session 的正式提交。显示插件的生产实现尚未交付。

<a id="ad-08"></a>

#### AD-08 受理拓展点接入

- 注入：`session`，调用方类 `intake`。
- 编排归 `session` 的受理流水线：它持有拓展点的有序清单、决定顺序与提交边界（[EX](../session/SPEC.md#ex-受理流水线的拓展点编排)）。本插件只把流水线交来的单个拓展点调用翻译为命令域或 hooks 的入口，并把结论交回。
- 顺序：受理前一组依次是用途提醒、内容型斜杠命令展开、用户提示提交的 hook。之后是 `accept` 受理提交。受理后一组是分流与推进条件检查。顺序与提交边界见系统页的[受理流水线与业务流程拓展点](../../../docs/architecture/runtime/session-and-run.md#受理流水线与业务流程拓展点)。
- 拦截时，本插件返回原因，不保管正文。拦截结论以槽拥有者的 `GuardCommand` 进入 `accept`，`accept` 在原受理标识下只写 SE12（[SE12 的适用范围](../session-contract/SPEC.md#se12-的适用范围)）。SE12 条目、`decide` 分支与回执形状随交付本插件的卡一起交付。
- 验收项「拦截留痕」：before-admit 槽拦截一次，`accept` 在原受理标识下写 SE12，不保管被拦正文，不取得待处理资格；同一受理标识重试认回原拦截。M2 装配声明 `admission: 'none'`，所以这一项只在测试装配里核，见 [VA-20](#组合与验证)。
- 拓展的语义归命令域与 hooks 的拥有者。它们的公开入口尚未定义（[NP-07](#np-07)）。入口定义之前，本插件不登记；受理准入按不可用处理，`accept` 返回 `unavailable`，除非装配声明本部署没有命令域与 hooks（[EX](../session/SPEC.md#ex-受理流水线的拓展点编排)、[session-cordis 性质 8](../session-cordis/SPEC.md#唤醒调用方与扫描者)）。

#### 构造依赖端口的实现

AD-09 至 AD-12 生成的 `GuardCommand` 中，`participant` 标识材料的拥有者：身份桥、证据桥、Context 输入或空闲输入。它不是存储参加者的名字。材料随命令交给本组的存储参加者，这四个端口实现不各自成为存储参加者（[身份桥、证据桥与 Context 输入](../session-contract/SPEC.md#身份桥证据桥与-context-输入)）。

<a id="ad-09"></a>

##### AD-09 身份桥

- 提供：`sessionIdentity`，实现 `SessionIdentityBridge`。插件 `extends` 对应的端口抽象类。
- 动作：本插件核实主体的可信来源，生成绑定租户、会话、操作与命令的 `GuardCommand`。材料不能用于另一命令，不序列化主体的秘密。
- 核验：本插件以 identity 的 `PrincipalVerifier.verify` 核实主体（[identity 的签发与核验](../../identity/identity/SPEC.md#签发与核验)）。`verified` 时生成材料；`rejected` 时返回 `denied`，不生成材料，Session 的变更不提交；`unavailable` 时按下一条处置。核验只证明来源，不证明当前成员资格或动作获准，后者归访问检查。
- 失败：身份来源不可用时返回 `unavailable`，`owner` 为身份来源。Session 一侧只有变更操作因此返回 `unavailable` 或 `denied`。
- 注入与缺席：本插件 `inject` identity 的 `principalVerifier` 服务（必需依赖）。该服务缺席时插件停在 `PENDING`，不提供 `sessionIdentity`，Session 的变更操作按[端口服务键](../session-cordis-contract/docs/cordis.md#端口服务键)返回 `unavailable`，读取照常。核验器服务卸载时本插件随之卸载；新核验器到位后插件体重新运行。插件停止后仍被持有的旧句柄不交出材料，返回 `unavailable`。
- 租户绑定：`GuardCommand` 材料只含完整 `SessionCommand` 的摘要，不含主体的任何成员，也不含命令正文。命令已含租户、会话与操作身份，所以摘要同时绑定这四项与命令种类。同一命令经另一个已核验主体（重试、恢复）得到同一材料。核验之前先核对命令里的租户与会话和本次 `Access` 一致，不一致返回 `denied`。核验为 `verified` 的代租户行事主体，其租户与本次 `Access` 的租户不一致时返回 `denied`，不生成材料。系统主体不绑租户，其操作资格归访问检查。
- 核验结果的容错：核验器抛错、答复形状不属于 `verified`、`rejected`、`unavailable`，或 `verified` 返回的主体不是传入的那个对象，一律返回 `unavailable`，不当作 `verified`，也不当作 `rejected`。`unavailable` 的 `owner` 为 `identity`。
- 实现现状：`src/cordis/identity-bridge.ts` 的 `SessionIdentityBridgeProvider extends SessionIdentityBridgeService`。验证见 `tests/identity-bridge.spec.ts`：真实 Cordis 4.0.4 的装载、停止、缺席与换核验器，`rejected`、伪造主体、另一租户主体与不可答复的核验源。
- 已知限制：装配用 identity 的 `inProcessPrincipalAuthority()` 的核验器时，核验只在同一进程、同一份已加载模块内成立（[签发与核验](../../identity/identity/SPEC.md#签发与核验)）。跨进程来源验证归后续核验提供者，不由本插件承诺。本插件不读授权域，也不核当前成员资格。

<a id="ad-10"></a>

##### AD-10 证据桥

- 提供：`sessionEvidence`，实现 `SessionEvidenceBridge`。初始化时复用既有 prepare，按 [Session 初始化守卫编码](../session-contract/SPEC.md#初始化守卫编码)核初始定义真实采用、完整来源计划、原绑定、结果及必要成功事实。completeInitialization 的注册准备复用 AD-12 的适配函数，不扩 SessionContextInput 的参数联合。编码在可信边界生成，caller JSON 或非空材料不能代替原拥有者证据。
- 按命令种类取材料：

| 命令 | 材料 |
| --- | --- |
| `startRun` | 当前定义采用与候选采用。登录门不是本插件的材料：Session 的存储参加者在提交事务里读首条输入保存的 `origin`，由 `decide` 核对（R2-D198，[契约的 `decide` 段](../session-contract/SPEC.md#领域服务与归约)）。候选采用材料带新纳入的常驻工具（写 SE36）与登记键（随 SE08），可带冻结判定 |
| `reload` | 当前定义采用与候选采用。候选采用材料同 `startRun`，可带冻结判定 |
| `create` | 真实初始定义采用、入口、资产、声明条件与完整来源计划。不带冻结判定 |
| `completeInitialization` | 按原初始化项核验协议、原绑定、结果及必要成功事实。execution-adoption 纯准备 ready 只写 SE02；确有新增能力实际采用时，材料带完整能力身份/ResidentKey 对和首次纳入的常驻定义，同批写 SE02、SE08 与必要 SE36。沿 [JC-02](../session-contract/SPEC.md#共同提交与共享事务域) 和[初始化守卫编码](../session-contract/SPEC.md#初始化守卫编码)，不补造初始定义采用，不变更原定义版本 |
| `preserveResult` | 生产来源与耐久保管 |
| `completeConsumption`、`completeExternalConsumption` | 原消费位置与投递资格 |
| `receive` | 原生产记录或 Agent 事件的来源 |
| `change` | 入口、资产与声明条件。执行环境模式变化时，另带会话层目标环境设置声明（见[模式翻译表](#模式翻译表)） |
| `freeze` | Tool 的冻结判定与耐久证据 |

- 来源：本插件 `inject` 三个窄来源端口，按命令把准备交给它们，不自己读取原事实拥有者。`sessionAdoptionSource`（`SessionAdoptionSource`）准备 `create`、`startRun`、`reload`、`completeInitialization`、`change` 与 `freeze` 的采用材料；`sessionProductionSource`（`SessionProductionSource`）准备 `receive`、`preserveResult` 与 `completeInitialization` 的生产来源；`sessionCustodySource`（`SessionCustodySource`）准备 `preserveResult`、`completeConsumption` 与 `completeExternalConsumption` 的保管与消费位置。命令集合以 [ports.ts](../session-contract/src/ports.ts) 的三个命令联合为准。任一来源缺席时本插件停在 `PENDING`（装配页缺口表）。
- 来源失败：来源答失败时，本插件原样交回该失败，保留来源报告的 `owner`；来源抛错时返回 `unavailable`，`owner` 为该来源的服务键，`diagnostic` 带原因。本插件不缺一项材料仍交出其余材料，也不把来源失败改写为业务拒绝。
- 常驻工具的规则与采用点判定由 Tool 契约规定（[P-8](../session-contract/SPEC.md#具名前提与明确缺项)）。装配协调者调用公开 planAdoption，Session 推进触发以原 SessionAccess 交回判定。Session 组不实现 Tool 驻留端口；Reader 由应用装配桥接，租户从 references 每项原样取得。
- 候选采用材料带回冻结判定时，Session 的 `startRun` 或 `reload` 返回 `frozen`，不提交。失败的 `verdict` 就是本插件放进候选采用材料的这份判定。之后由推进协调以该判定调用 `freeze`（[常驻工具与会话冻结](../session-contract/SPEC.md#常驻工具与会话冻结)）。
- 会话已冻结时，`frozen` 的 `verdict` 为 null。这个结果来自会话状态，不来自本插件的材料。
- 失败：材料准备失败时，本插件返回失败并指明拥有者。它不缺一项材料仍交出其余材料。
- 实现现状：`src/cordis/evidence-bridge.ts` 的 `SessionEvidenceBridgeProvider extends SessionEvidenceBridgeService`，`inject` 三个来源。本插件按上表的命令种类依次问对应来源，按来源顺序交出材料。它自己只做下列边界核对：
  - 命令的租户不是 legal-identity 铸造的值时，返回 `denied`，不问任何来源。
  - 来源交出 `owner` 为 `session-initialization` 的初始化材料时，材料 `binding` 中的租户与 Session 必须等于命令的租户与 Session。不相等时返回 `denied`（[初始化守卫编码](../session-contract/SPEC.md#初始化守卫编码)）。
  - 表内命令的全部来源都没有交出材料时，返回 `unavailable`，不交出空成功。一个来源为空而另一个来源有材料时照常交出。
  - 来源答失败时原样交回，并停止询问后续来源。来源抛错或答复形状不对时，返回 `unavailable`，`owner` 为该来源的服务键。
  - 表外命令（`claim` 与非普通输入的 `accept`）不问来源，交出空材料。Session 的判定不读这些命令的证据材料。
- 验证见 `tests/evidence-bridge.spec.ts`：真实 Cordis 4.0.4 的装载、停止、任一来源缺席、换来源；按命令的来源路由；来源失败、抛错、形状错误与空材料；未铸造租户、另一租户或另一 Session 的初始化材料。
- 已知限制：常驻工具部分（候选采用材料里的常驻工具与登记键，P-8）仍是候选。本插件原样传递来源的材料，不编码常驻键，也不核对冻结判定。真实来源未交付，本插件只对替身验证。

<a id="ad-11"></a>

##### AD-11 空闲输入

- 提供：`sessionIdleInput`，实现 `SessionIdleInput` 的 `inspect` 与 `prepare`。
- 注入：`modelRuntime`、`toolRuntime`，`session` 调用方类 `maintainer`。
- 动作：本插件组合四类覆盖：时钟连续性、会话原区间与关系、全部子会话的工作、生产者的在途调用。子会话经 `readWork` 读取。在途调用经 `calls.inspect` 与 `queries.lookup` 按原调用读取。
- 观察为 `unknown` 的情形：来源无法证明离线区间、时钟回拨、任一子方或调用不可读、仍有未结工作。本插件不只看 Run 或活体目录。
- `prepare` 在裁定时重新核对全部范围，供 `recordIdle` 与 `considerAutoArchive` 在同一事务域内共同提交（[SessionClock 与 SessionIdleInput](../session-contract/SPEC.md#sessionclock-与-sessionidleinput)）。

<a id="ad-12"></a>

##### AD-12 Context 输入

- 提供：`sessionContextInput`，实现 `SessionContextInput.prepare`，用于 `create`、`change`、`startRun`、`reload`。
- 动作：本插件以 Runtime Context 的 `prepareRegistration` 核对注册材料，再把需要、绑定与参数值编码为带 schema 的 JSON（`ContextMaterial`）。需要绑定带翻译纯函数，翻译见[模式翻译表](#模式翻译表)。
- 材料是已可靠准备、尚未生效的增加、更新或移除。Session 是本会话注册决定的唯一提交拥有者。原初始化计划内的初始增加由 create 或 completeInitialization 提交 SE02/SE07，后续变更由 change 提交。拒绝时材料仍只是候选。
- 初始注册按原 createOperation、owner、item 固定，既有 creating=true 支持同一 scope 创建过程中的多个提交。原键到 CommitRef 的无碰撞编码、每个 SE07 的 basedOn/revision 链及 same-batch 引用归 [Session 的初始注册条款](../session-contract/SPEC.md#初始注册的身份与修订)。不能将同一 Session operation 直接复用为多个不同注册的 Context 提交身份。
- prepareRegistration 核对完整输入，prepared 与 currentRevision 只是准备材料。Session 在最终提交的临时注册视图重核整批修订与相容性，原项结果、SE07、结果索引及操作答案同批；确有新增能力采用才另含 SE08、必要 SE36。已存在的同值决定只引用，异材料拒绝。
- 本插件不调用 `applyCommit`。Session 提交确认后，由 AD-03 按原 SE07 顺序调用现有 applyCommit（[AD-03](#ad-03) 的注册决定一段）。未知时先查原操作；失败沿原 CommitRef 和原输入恢复，不改 basedOn、不先应用。注册 ready 不证明块当前有值，生产者内容提交和 Context 首次恢复围栏仍分别受原契约约束。
- Runtime Context API 保持。生产工作区加载、实际采用的供证能力与首次 scope 恢复分别归原提供者；来源和结果的可核验性须有相应提供者证据。
- 失败：`prepareRegistration` 拒绝时，本插件交回逐项原因，Session 的命令返回 `invalid`。Runtime Context 不可用时返回不可用。
- 实现现状：`src/cordis/context-input.ts`。插件工厂 `createSessionContextInputPlugin({ coordinator, definitions })` 给出插件 `session-ad12`。它 `inject` `runtimeContext`，不调用 `session`。`coordinator` 与 AD-03、AD-14 是同一个装配端口，`prepareRegistration` 以该会话协调者的主体调用。`definitions`（`SessionContextDefinitions`）由装配按精确已采用定义给回绑定与状态块声明。
- 翻译协议：材料的 schema 是 `session-context-material` 修订 1（`SESSION_CONTEXT_MATERIAL`）。材料只存 JSON。不可序列化的部分（绑定的翻译函数、需要的形状、状态块声明）存为对精确已采用定义的引用，由 `definitions` 还原。编码器只接受定义给回的同一对象，所以编码后的材料一定能还原。
  - 注册：`need` 存定义、变更种类、块键、必需性、是否带声明与头部。初始注册的头部为 null，作用域、租户、前修订与提交身份取自 Session 的 SE07 决定（`encodeInitialContextRegistration`）。后续注册的头部存租户、作用域、前修订、creating、提交身份与是否结束作用域（`encodeContextRegistrationChange`）。`binding` 存（需要名，块键）引用。`parameters` 存参数值，未定义时显式标出。
  - 步提交：`updates` 的首项是块名 `@step` 的头部，存租户、作用域、步、提交身份、两种结束与待处理更新。其后每个已提交块一项，存全值与折入的更新（`encodeContextStepCommit`）。`@step` 不含点，不会等于块键。块值与更新必须是 JSON 数据。
  - 提交身份：沿初始注册的字符串数组编码，各用自己的域标识。后续注册是 `["session-context-change","1",scope,operation,key]`，步提交是 `["session-context-step","1",scope,operation]`，作用域结束是 `["session-context-scope-end","1",scope,归档操作]`。
  - 解码：`createSessionContextTranslation(definitions)` 给出 AD-03 回放的 `translation`。`commitOf(entry, session)` 把 SE07（初始与后续）、`change(context-step-commit)` 与 SE27 的结束还原为 Runtime Context 的提交输入，其他条目为 null。`session` 是日志里有该条目的会话，由 AD-03 交入。SE27 不带租户，结束取该会话的租户，所以没有注册与步提交的作用域也能结束。注册与步提交所记的租户不是该会话的租户时答失败。读不懂的记录答失败，不猜。翻译不保存状态。
- 准备：
  - 命令与本次访问的租户或 Session 不同时，返回 `denied`，不解码也不调用任何一方。
  - 材料解码不了时返回 `invalid`。`definitions` 抛错时按依赖失败返回 `unavailable`，`owner` 为 `context-definitions`。
  - `change` 的注册：材料头部的租户不是本次访问的租户时，返回 `denied`。提交身份不由本次 `change` 的操作派生时，返回 `invalid`。之后以协调者主体调用 `prepareRegistration`，`prepared` 交出一份材料（`owner` 为 `runtime-context`，`participant` 为 `context-input`）。`rejected` 返回 `invalid` 与逐项原因。拒绝、不可用、未知、抛错，以及评判的变更不是交入的变更，都返回 `unavailable`（[AD-00](#ad-00) 第 6 条）。协调者主体答 `denied` 时返回 `denied`，其他失败返回 `unavailable`。
  - `change` 的步提交：同样核租户与提交身份，不调用 Runtime Context，交出一份材料。
  - `create`：只核每个 `context-registration` 来源都能还原，不能还原时返回 `invalid`，否则交出空材料。初始注册的准备在 `completeInitialization` 由采用来源完成，复用导出的适配函数 `prepareContextRegistration`。
  - `startRun`、`reload` 与其他声明的 `change` 不带注册材料，交出空材料。
- 验证见 `tests/context-input.spec.ts`：真实 Cordis 4.0.4 的装载、停止、缺席与换提供者；跨租户与跨 Session 的命令、另一租户的材料；提交身份；`prepareRegistration` 各答复；协调者主体；步提交与创建；以及经 Session 真实判定写出的初始 SE07、后续 SE07、步提交与 SE27，由翻译还原为原输入。接到 AD-03 回放的用例在 AD-03 持有者合入后由集成方加入。
- 已知限制：
  - 后续注册的材料头部记有准备时的作用域。Session 写 SE07 时取当前作用域，不与材料比较。二者不同时（例如准备之后撤销归档换了作用域），翻译答失败，AD-03 把该会话的记录作为读不到处理。触发条件：Session 的判定比较二者之后，这种记录不再出现。
  - 步提交同理。步提交的头部记有准备时的作用域，Session 写条目时取当前作用域。二者不同时翻译答失败，回放把该会话作为读不到处理。触发条件同上。

### 出站端口的实现

出站端口由 [session-cordis](../session-cordis/README.md) 按调用经 `ctx.get` 现取，再交给 [session](../session/README.md) 的协调器使用。端口缺席时，Session 一侧的任务保留并重放，见 [Cordis 定义](../session-cordis-contract/docs/cordis.md#端口服务键)。

<a id="ad-14"></a>

#### AD-14 `AgentDrivePort`

- 提供：`sessionAgentDrive`。插件 `extends` 对应的端口抽象类。
- 注入：`agentInstances`、`agentInstanceProvision`、`agentExecutionRecovery`、`agentExecutionControl`；`session` 调用方类 `coordinator`，只用于 `readWork` 与 `readInput`。五项都是必需依赖。任一项缺席时插件停在 `PENDING`，`sessionAgentDrive` 缺席，Session 保留任务并重放。
- 主体：出站调用的主体是应用装配为会话协调者签发的主体，即该会话 `coordinator` 的会话工作主体。装配入口经插件工厂 `createSessionAgentDrivePlugin({ coordinator })` 直接交入取得它的函数，装配入口以 `forSession({ actor: 'coordinator', tenant, session })` 实现这个函数。它不进配置，也不是插件树上的键。每次端口调用按目标的租户与会话取一次主体。取主体答 `denied` 时端口答 `denied`，答 `unavailable` 或 `quarantined` 时端口答 `unavailable`，都不调用 Agent。同一次端口调用里，`readWork`、`readInput`、`acquire`、`resolve` 与 Agent 操作都用这个主体。Agent 在实际执行处以 `AgentAccessCheck` 核验它。

| 端口操作 | Agent 操作 | 翻译 |
| --- | --- | --- |
| `invoke` | 按[会话槽](#会话槽引用)取实例：`agentInstanceProvision.acquire`，再 `agentInstances.resolve` 取 `AgentRuntime`，再 `invoke` | 首条输入经 `readInput` 取内容，组成 `AcceptedInput`；来源依据为 SE13 回执；`grant` 为本 attempt 的 SE15 证据；执行身份为 SE13 所记。本插件保留返回的执行句柄。成功的回执见[回执的读回](#回执的读回) |
| `submit` | 执行句柄的 `input.submit` | 输入经 `readInput` 取内容；来源依据为该输入的 SE11 回执 |
| `resume` | 按[会话槽](#会话槽引用)取实例，同 `invoke`，再 `AgentRuntime.resume` | `recovery` 为恢复依据或交接证明；`grant` 为新 attempt 的 SE15 证据。接管资格由 Agent 按主体核验，本插件不判断。本插件保留返回的执行句柄 |
| `control` | `agentExecutionControl.control` | 按下表翻译原控制意图，保留原 operation 与原因依据；不要求句柄或挂接。原因依据指向 Session 的原控制操作，见[原因依据](#原因依据) |
| `detach` | `agentExecutionRecovery.detach` | 本插件先以 `load` 取目标挂接的 `Authority`，再带原因依据交还。快照没有挂接时答 `unavailable`，不调用 `detach` |
| `recordResult` | 合格保管方经 `reconcile` 内的 `recordResult` | 见 [NP-04](#np-04) |
| `query` | `agentExecutionRecovery.query` | `committed`、`excluded`、`unknown` 原样交回，`excluded` 等于 Session 的 `not-committed`。`rejected` 按下表「`query` 的 `rejected`」一行处置 |
| `inspect` | `agentExecutionRecovery.load` | 快照映射为 `ExecutionStatus`：执行状态、挂接状态、修订、结束结论与依据。映射见[inspect 的映射](#inspect-的映射) |
| `prewarm` | 无 | 不调用 Agent，返回 `unsupported`（[P-7](../session-contract/SPEC.md#具名前提与明确缺项)） |

控制映射以 Agent J07 为准。左列是 Session 契约的 `ControlIntent`（[values.ts](../session-contract/src/values.ts)）：

| Session 意图 | Agent 操作 | 所需前提 |
| --- | --- | --- |
| `control(stop-call)`，`producer` 为 Model | control(interrupt-model)，原具名 Model call | 当前控制资格，不要求推进资格 |
| `control(stop-call)`，`producer` 为 Tool | control(interrupt-tool)，原具名 Tool call | 当前控制资格；Agent 自己核原关联及控制阶段 |
| `control(background-tool)` | control(background-tool)，原具名 Tool call | 同上 |
| `control(cancel-run)`、`control(archive)`、`auto-archive` | 对 Session 已固定范围里的每个 execution 发 control(cancel) | 只对已固定范围逐一发出，不扩范围；当前控制资格 |
| `interrupt` | input.submit，priority urgent | 输入准入；插队不是控制，原输入仍先由 Session 接受 |
| `control(unarchive)` | 无 | 由原 Session 命令同批产生 reconciled，不调用 Agent（[AD-02 控制归一](#控制归一)） |

Session 没有 suspend 意图，本插件不发 control(suspend)（#730 不被采用，见 [AD-02 控制归一](#状态与解释)）。交还挂接不是控制意图：它是端口操作 `detach`，见上表 `detach` 一行；针对仍存活的其他 runtime 另需 takeover。

控制受理不证明六阶段全部完成，也不授予推进资格。active 挂接如何获知长期控制仍归 Agent #502，不由本插件补造通知协议。

##### 具名调用的解析

Session 用调用引用指明 Model 与 Tool 调用：`producer.call` 是 `ModelInvocationRef` 或 `ToolInvocationRef` 文本（session-contract [稳定调用引用的读取](../session-contract/SPEC.md#稳定调用引用的读取)），即 AD-05 与 AD-06 从 `key.reference` 取的值。Agent 的 `interrupt-model`、`interrupt-tool` 与 `background-tool` 指明调用身份（`ModelCallId`、`ToolCallId`）。

- 本插件用生产领域的公开解析器取调用身份：Model 用 `resolveModelInvocationRef`，Tool 用 `resolveToolInvocationRef`，租户为 `DriveTarget.tenant`。不切割字符串，也不拆 JSON 字段。
- 回程不由本插件做。Agent 控制记录指明的调用，由 AD-02 的控制归一按该 execution 的原效果找回调用引用（`src/testing/control.ts` 的 `referencesOf`），再与 `producer.call` 比较。
- 引用不能解析（格式错误、种类不对，或给的是调用身份而不是引用）：答 `unavailable`，诊断以 `translation defect` 开头，以 error 级写入日志，不调用 Agent。不答 `unsupported`，因为 Session 收到 `unsupported` 后停止重放，控制会被静默丢掉。Session 收到 `unavailable` 后保留任务并重放，控制不进入已传播。
- 引用属于另一租户：答 `denied`，不调用 Agent。
- 验证见 `tests/agent-drive.spec.ts` 的「control goes to the long-term control entry」一组。

结果的对应：

| Agent 的结果 | 端口结果 |
| --- | --- |
| 受理回执、挂接回执、交接依据、命令回执 | 成功，带修订与证据 |
| `busy`、`denied`、`terminal`、`changed`、`stale-advance`、`unsupported`、`conflict` | 同名的 `DriveFailure` |
| `invalid`，且是消息准入拒收（字段为 `value`），并带准入提供者的拒收记录 | `invalid`，带拒收原因，拒收证据原样转交 |
| `invalid`，且是消息准入拒收（字段为 `value`），但没有可用的拒收记录 | `unavailable`，诊断为「Agent invalid 未带拒收证据（NP-12）」。不成为拒收，不产生 SE35，见 [NP-12](#np-12) |
| 其他 `invalid` | `unavailable`，诊断标为翻译缺陷，并报告。它不成为拒收，不产生 SE35 rejected |
| `query` 的 `rejected` | `unavailable`，诊断标为翻译缺陷，并报告。本端口只查询自己发起的驱动操作，`rejected` 不属于它们；不映成 `not-committed` |
| `unavailable` | `unavailable` |
| `commit-unknown` | `commit-unknown`，带原操作身份 |

- 结果未知时，Session 先 `query`，不换身份重发。本插件不自行重试未知的调用。
- `submit` 仍需要执行句柄；缺席时保留原任务并返回 unavailable（NP-03）。`control` 使用公开长期入口，不因无句柄拒绝。无活体执行的后续收束仍按 Agent 自己的 resume/取消授权规则，不能把控制受理写成已经收场。
- `inspect` 不能区分「记录不存在」与其他读取失败：`load` 只有 `denied` 与 `unavailable`（[NP-05](#np-05)）。本插件不产生 `missing`。PM-14 的「尚未受理」以 `query` 的 `excluded` 判断。
- 本插件不调用 `prewarm` 对应的任何 Agent 入口。
- Agent 的 `not-ready` 不在上表。本插件把它答为 `unavailable`，Session 保留任务。
- 端口的 `submit` 不带优先级，本插件一律以 `ordinary` 提交。上面控制映射里 `interrupt` 的 urgent 插队在本插件尚未实现，等端口能区分插队输入时补上。
- 拒收证据是准入提供者一条耐久记录的定位符。本插件不生成它（[AD-00](#ad-00) 第 2、7 条）。Agent 的 `invalid` 带 `rejection` 成员且它是合法的 `DurableEvidence` 时，本插件原样转交。现行 agent-contract 的 `invalid` 只带字段与原因，所以消息准入拒收在本插件答 `unavailable`（[NP-12](#np-12)）。
- 已知限制：NP-12 闭合之前，Session 的 PM-02 有界收束（首条输入被消息准入拒收）经本端口走不到。Session 按 `unavailable` 退避重试，然后等 S3。
- 翻译缺陷的答复是 `unavailable`，诊断以 `translation defect` 开头，插件同时以 error 级写入日志。依赖或插件内部抛出的异常也按翻译缺陷处理。

##### 会话槽引用

`AdvanceRef.instance` 不记活体实例身份，记会话槽引用。格式归本插件，是一条纯规则，由 `src/slot-ref.ts` 的 `encodeSessionSlotRef` 与 `decodeSessionSlotRef` 实现：

```text
AgentInstanceRef = { owner: 'agent', id: JSON.stringify(["slot1", <SessionId 文本>, adoption.owner, adoption.name, adoption.revision, adoption.digest]) }
```

- `adoption` 是这次 `startRun`、`claim` 或 `reload` 所属 Run 的采用：`startRun` 与 `reload` 取输入的 `candidate`，`claim` 取 `RunState.active.adoption`。
- 租户不进文本。会话日志属于租户自己，本插件解析时从 `DriveTarget.tenant` 取租户。
- 解析要求：`owner` 是 `agent`；`id` 是 JSON 数组，恰好 6 项，每项是字符串；第 1 项是 `"slot1"`；数组重新 `JSON.stringify` 后与 `id` 全等。不满足任一项时解析失败。
- 会话协调器 C2 在 session 包里按同一规则计算，不导入本成员。两边的测试断言同一组样例。

| 样例 | 会话 | 采用（owner、name、revision、digest） | `id` 文本 |
| --- | --- | --- | --- |
| 普通文本 | `session-1` | `conformance`、`assistant@1`、`1`、`sha256:assistant@1` | `["slot1","session-1","conformance","assistant@1","1","sha256:assistant@1"]` |
| 需转义的文本与非 ASCII 文本 | `sess-"引号"\终` | `assets/agents`、`定义 A`、`42`、`sha256:00ff` | `["slot1","sess-\"引号\"\\终","assets/agents","定义 A","42","sha256:00ff"]` |

`invoke` 与 `resume` 取实例的步骤：

1. 以 `coordinator` 调用方类 `readWork`，取 `run`。`run` 不是 `active` 时答 `unavailable`。
2. `run.advance` 为空，或 `advance.instance` 解析失败，或解析出的会话不等于 `DriveTarget.session`，或解析出的采用不等于 `run.adoption` 的四项：答 `unavailable`，作为翻译缺陷报告，不取实例。
3. 组成实例槽：租户为 `DriveTarget.tenant`；安全作用域为会话作用域证据 `{ owner: 'session', record: <SessionId 文本>, revision: '1', digest: <JSON 数组 [租户文本, SessionId 文本] 的 sha256 十六进制> }`；定义采用为解析出的采用。同一会话在重启前后得到同一值。宿主只按全等比较，不解析。
4. `agentInstanceProvision.acquire`，再 `agentInstances.resolve`。`acquire` 与 `resolve` 的失败按上面的结果表对应：`invalid` 答 `unavailable` 并报告翻译缺陷。
5. 在取得的 runtime 上 `invoke` 或 `resume`。答 `unavailable` 时，本插件再 `acquire` 一次。得到的实例与上次不同时，表示旧实例已被宿主回收，本插件在新实例上重试一次，交回这一次的结果。实例相同时交回原来的 `unavailable`。本插件不因其他失败重试。

执行句柄按租户、会话与 execution 保留。本插件监听 `agent-cordis-contract/instance-retired`，按租户与实例丢弃对应的句柄。插件重跑或卸载时丢弃全部句柄。之后的 `submit` 在句柄重建前答 `unavailable`（NP-03）。`control` 不用句柄，不受影响。

##### 回执的读回

`AgentRuntime.invoke` 与 `resume` 只交回执行句柄，不交回执。本插件随后以原操作身份调用 `agentExecutionRecovery.query`：`committed` 时交回该回执的修订与证据；`unknown` 时答 `commit-unknown`，带原操作身份；`excluded` 或 `rejected` 与已受理矛盾，答 `unavailable` 并报告翻译缺陷。查询失败按结果表对应。句柄在读回前已保留。

##### 原因依据

`control` 与 `detach` 的原因依据由本插件按规则生成，指向 Session 的原操作：`{ owner: 'session', record: <Session 操作身份>, revision: '1', digest: <JSON 数组 [租户文本, SessionId 文本, Session 操作身份] 的 sha256 十六进制> }`。`control` 取端口输入的 `control`，`detach` 取 `DriveTarget.operation`。`control(unarchive)` 不调用 Agent，端口答 `unsupported`。

##### inspect 的映射

| 快照 | `state` | `attachment` | `conclusion` |
| --- | --- | --- | --- |
| `ended` | `ended` | `null` | 结论种类、`fail` 与 `cancelled` 的原因、处置依据 |
| `suspended` | `suspended` | 有挂接为 `detached`，否则 `null` | `null` |
| 其他 | `open` | 有挂接为 `active`，否则 `null` | `null` |

`revision` 取快照修订，`evidence` 取快照的 `history`。快照不带挂接状态，所以本插件不产生 `superseded`。

<a id="ad-15"></a>

#### AD-15 `ScopeReleasePort`

本插件实现 `sessionScopeRelease`，以 `executionEnvironment: { caller: 'maintainer' }` 调用公开维护面。恢复授权由应用装配的维护拥有者直接交入端口实现，不进配置或插件树，不使用会话用户身份。用户退出或撤权不阻断合法系统回收。

原获取描述 `OriginalAcquisition` 由发起获取的集成方在新获取前保存，包含 tenant、acquisition、origin、scope 和完整 placement 指纹。AD-15 只消费该拥有者交来的原描述，不从资源列表或 SessionId 重建。普通查询为 `inspectAcquisition(access, {kind:'local', acquisition} | {kind:'original', original})`；维护查询为 `inspectRecoveryAcquisition(recoveryAccess, original)`。系统恢复为 `recoverOwned(scope, recoveryAccess, known?)`，归档释放使用 `releaseScope(scope, recoveryAccess, known?)`。现有两参数 releaseScope 仍合法。

查询只认回原事实，不重新 acquire、plan、permit、adopt，不执行原效果。notAllocated 必须排除原键的迟到成功；曾分配后补偿完成是 settled，不能改成从未分配。allocationFailed 保留原失败与 cleanup 状态，清理不改原工作结果或费用。查询 unknown/unavailable 保持未知，不清空责任。

`OwnedRecovery` 的资源与 acquisition 两路必须同时结清：

| 公开结果或组 | Session 处置 |
| --- | --- |
| 两路枚举完整；stopped 与 settledAcquisitions 已覆盖全部原责任；其他组全空 | released，带真实读回证据 |
| pending 资源，或 pendingAcquisitions 的 pending/unknown | pending。resources 为空仍保留任务与额度责任 |
| unsupported 资源/提供者，或 unsupportedAcquisitions | unsupported，保留该项并报告 |
| unavailable 提供者组；任一路枚举/查询 unavailable 或 unknown | unavailable，保留任务与原诊断，不当空页 |
| notAuthorized | not-authorized，不换用户身份重试 |
| LookupUnknown，包括 authority 抛错 | 本次结果未知，保留原释放任务并稍后按原身份接续 |

一次读回可以包含多类，逐项保留。原描述 conflict 归 pendingAcquisitions(reason:unknown)，不处置不匹配对象。只有 settledAcquisitions 列表不能证明目录完整。releaseScope 先封本实例新准入、使旧租约失效，再推进原清理；重复调用仍驱动 pending，不返回缓存空成功。调用超时或抛错不编造读回，Session 保留 unknown。

提供者换代后，重新释放子插件以 `maintainer` 调用 Session，使用同一系统恢复授权：

1. 以 `releasedScopes` 逐页读取已有 SE25 的原 scope 与任务身份，再沿原任务 releaseScope。目录缺席或任一页失败时停止该轮并报告，不把已读页当完整目录。
2. 归档已提交而 SE25 尚未形成的原 scope-release 任务不在上一路。Session 调度器另经 tenant 内 `pending(tasks)` 与 `loadRecovery` 恢复这些任务，并调用同一端口。目录不完整时不能宣称所有租户均完成清理。
3. 重新释放已有 SE25 的作用域不补写新的归档事实。尚未完成的原任务仍按 receive(scope-release) 保存真实读回并决定是否解除。两路不混同。

执行环境重启到重新释放完成之间的原窗口仍保留。已知结束的集成方先拒绝新获取，但 Context scope-ended、本实例封口及空资源列表均不证明未知目录没有在途获取或失败关闭责任。消除窗口须由执行环境与发起获取的集成方另行提供采用及实现证据。

### 模式翻译表

翻译是本成员里带来源证据的纯函数。它们在模式变化时算好，不在请求或工具调用时翻译。授权域与元能力宿主只读自己的值，不认识模式词。Tool 与扩展不是 `session.modes` 的消费者。

`session.modes` 经 Runtime Context 的需要绑定（`NeedBinding`）交给消费者：

| 轴 | 会话值 | 消费者与它的需要 | 翻译后的值 |
| --- | --- | --- | --- |
| 权限处理 | `never` | 授权域的询问处理需要（暂名 `DecisionMode.onAsk`） | `deny` |
| 权限处理 | `auto_permission` | 授权域的询问处理需要（暂名 `DecisionMode.onAsk`） | `ask-human` |
| 权限处理 | `bypass-permissions` | 授权域的询问处理需要（暂名 `DecisionMode.onAsk`） | `skip-ask` |
| 协作 | `co-work` | 元能力宿主：人机交互可用；可请求批准 | `true`；`true` |
| 协作 | `auto-drive` | 元能力宿主：人机交互可用；可请求批准 | `false`；`false` |

- 翻译结果带来源证据：SE03 的回执与翻译函数的版本。
- `skip-ask` 只跳过询问，不越过结构化权限限制。结构化权限在动作准入处拒绝，本成员不替它判断。
- `co-work` 下的提问仍受权限限制。这一限制由授权域的询问处理需要表达，元能力宿主的两个布尔值不重复表达它。`DecisionMode` 是本成员给这项需要的暂名，不是授权域发布的类型，形状归授权域 [AU-09](../../identity/authorization/SPEC.md#au-09-阶段范围公开形状与维护) 的公开形状。

执行环境模式不经 Runtime Context 块：

| 变化 | 本成员给出 | 之后 |
| --- | --- | --- |
| 执行环境模式变化 | 证据桥为 `change(environment-mode)` 给出一条会话层目标环境设置声明（SE06 的一种）。它与 SE03 同批提交，设置声明修订加一 | 设置求值的拥有者按默认、组织、租户、工作区、会话的次序求出有效值。Tool 装载时取得有效值，固定在 `FixedToolRequest.settings`（[P15](../../tool/tool-contract/SPEC.md#p15-配置声明与合法装载)） |

- 本成员不在发起执行或工具调用时翻译设置，也不为 Agent 提供传递设置的端口。
- 设置缺项或求值不可用时，Tool 一侧不发出这次调用，不回退工具声明的缺省值（[会话块声明与设置值的固定时点](../session-contract/SPEC.md#会话块声明与设置值的固定时点)）。
- 之后的模式变化只影响之后装载的工具调用。已发出的请求保持发出时的设置。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 会话事实、游标、任务与回执 | Session 的会话日志 | 不随本成员结束 |
| 参加者登记、生产者登记、端口提供 | 登记它的插件 fiber | 插件卸载 |
| 执行句柄与同日志解释缓存 | AD-14 与 AD-02 的插件 fiber | 插件卸载、执行结束或句柄失效 |
| 上一份已过滤快照、前缀摘要缓存 | AD-03 与 AD-04 的插件 fiber | 插件卸载或进程结束，按派生物丢弃 |
| 恢复授权 | 应用装配层的维护拥有者 | 由签发者撤销 |
| 翻译函数的版本 | 本成员 | 随发布 |

失败的共同处置：

- 邻域不可用时，插件返回 `unavailable` 或保留任务，不回滚已提交的会话事实。
- 邻域结果未知时，插件按原身份查询，查询前不发出依赖它的后续效果（[PA-07](../session-contract/SPEC.md#pa-07)）。
- Session 提交返回 `commit-unknown` 时，插件不向邻域确认（例如不调用 `output.acknowledge`，不调用 `applyCommit`），先查询原操作。
- 翻译失败是本成员的缺陷。插件报告它，不把它映射为邻域或 Session 的业务拒绝。

生命周期：

- 插件依赖的服务换代时，插件体先卸载再重跑（Cordis 的必需依赖语义）。在途调用按原操作身份认回，不因重跑换身份。
- 卸载顺序：先停止新的入站调用与订阅，再取消在途等待，最后撤除登记与端口提供。撤除不撤回已交给邻域的确认、释放或已发生的外部效果。
- 第一版靠装配单实例兑现每个租户一个恢复扫描者（[IC-19](../../../docs/architecture/cordis-integration-conventions.md#ic-19)）。本成员的插件不扫描恢复，只在被调用或被唤醒时工作。AD-15 的重新释放子插件在换代后的重新释放是唯一由插件自己发起的批量工作。

### 具名前提与明确缺项

Session 契约的 [P-1 至 P-8](../session-contract/SPEC.md#具名前提与明确缺项) 照常适用。下表是本成员在适配时另外发现的缺口。闭合之前，相应插件按「之前」一列表现。

| 编号 | 缺什么 | 拥有者 | 之前 |
| --- | --- | --- | --- |
| <a id="np-02"></a>NP-02 | RQ 已有 ContextSourceRegistry；窄采用来源的材料已由会话日志 Journal 提供者的分区 `a` 交付（FIXED-FACTS F4、F5），会话的完整原历史、转换与 current 生产接线尚未交付，`sessionAdoptedRequests` 的发行接线归 F6 | Session 历史提供者、各来源拥有者与应用装配 | AD-04 仅在整组来源及资格可兑现时登记；缺必要材料返回 unavailable，不发布半套来源 |
| <a id="np-03"></a>NP-03 | 无句柄时 input.submit 的取得路径；长期 control 已由 J07 定义 | Agent 拥有者 | submit 缺句柄时 unavailable；control 走 agentExecutionControl，不受该缺口阻断 |
| <a id="np-04"></a>NP-04 | 合格保管方记录迟到结果的公开入口。`reconcile` 的输入只有操作身份，不带结果、交接与释放；`recordResult` 是执行记录端口，只在 Agent 已核验的操作内调用 | Agent 拥有者 | `recordResult` 返回 `unavailable`，任务保留。Agent 记录已删除时，Session 照契约单方保管 |
| <a id="np-05"></a>NP-05 | `load` 不区分记录不存在与读取失败 | Agent 拥有者 | 本成员不产生 `missing` |
| <a id="np-07"></a>NP-07 | 命令域与 hooks 的公开入口 | 命令域与 hooks 拥有者 | AD-08 不登记；受理按准入不可用返回 `unavailable`，装配声明没有命令域与 hooks 时不经槽 |
| <a id="np-10"></a>NP-10 | 换代或重启之后，恢复要把 `tasks.initialization` 重新驱动给初始化项的负责方，把 `tasks.routed-input` 重投给卡片或业务拥有者（[PM-14](../session-contract/SPEC.md#pm-14)）。这两类拥有者不在本成员的现有邻域适配内，已有插件 没有承接它们的插件。Runtime Context 注册的重放不在此列，它由 [AD-03](#ad-03-1a) 的 1a 承接 | 初始化项负责方、卡片与业务输入的拥有者，以及 Session 的集成包拥有者 | 恢复读到这两类任务时，对应拥有者按 `unavailable` 处理。任务保留，不删除，按恢复扫描的退避重试 |
| <a id="np-11"></a>NP-11 | AD-03 的 [1b](#ad-03-1b)（持有者保留上一份已过滤快照作为提醒前值）与 [1c](#ad-03-1c)（补拉时点与上界：下一次步边界提交之后；「下一次模型请求之前」是 1c 已知限制的恢复条件）由本成员推出。Runtime Context 契约把补拉上界交给持有者定，没有确认这两项 | Runtime Context 拥有者 | 本插件按 1b 与 1c 工作。拥有者给出不同的规则时，按该规则改 AD-03 |
| <a id="np-12"></a>NP-12 | Agent 一侧交回消息准入拒收证据的能力。agent-contract 的 `invalid(value)` 只带字段与原因，不带准入提供者的拒收记录。触发条件：agent-contract 的 `invalid(value)` 带上准入提供者的拒收记录 | Agent 拥有者 | [AD-14](#ad-14) 对没有拒收记录的 `invalid(value)` 答 `unavailable`，不产生 SE35。PM-02 的有界收束经本端口走不到 |

Session 契约的明确缺项也约束本成员，其中两项直接影响插件：

- 跨租户的系统作用域读取所需的事务域目录。目录缺席时 `references` 与 `releasedScopes` 返回 `unavailable`。应用装配的常驻引用桥接与 AD-15 的重新释放子插件原样报告不可用，不当作空页。
- 执行环境重启到重新释放之间的窗口。AD-15 的重新释放子插件缩短这个窗口，不消除它。

## 组合与验证

本成员消费的承诺：Session 契约的提交、认回与条款；各邻域契约的操作与失败语义；Cordis 的必需依赖换代语义。本成员不验证邻域的行为，只验证翻译与对应。

下表是持续验证义务，不是已经执行的测试。它们随实现进入 `tests/`。

| 编号 | 场景 | 必须观察的结果 | 条款 |
| --- | --- | --- | --- |
| VA-01 | 四种调用方交接与 `none` | 各翻译为对应命令；主回复的 Ja 在 `none` 时翻译为 `recordMessage`，与 Agent 记录同一次存储提交（`tests/session-log-journal-history.spec.ts`）；其余 `none` 不参加；第五种返回「不支持」 | [AD-01](#ad-01) |
| VA-02 | Session 结果的每一类 | 按表映射为参加、失败、冲突或不支持，冲突带依据 | [AD-01](#ad-01) |
| VA-03 | 同日志重读、缺口与答复丢失 | 重读认回；缺口隔离或快照对账；解释进度与后果同批发布 | [AD-02](#ad-02) |
| VA-04 | Runtime Context 重建与 `applyCommit` 顺序不符 | 开始恢复会话，用完整材料结束会话（注册提交顺序、步提交全值、作用域结束），再重签 | [AD-03](#ad-03-1a) |
| VA-05 | 上一份快照丢失 | 下一次读取取完整快照，不补造提醒 | [AD-03](#ad-03-1b) |
| VA-06 | 步边界提交与 `session.modes` 发布 | 两个时点都完成补拉；提醒落在上界之内；AD-04 给出历史依据时不等补拉 | [AD-03](#ad-03-1c) |
| VA-07 | 各类未结工作下界、未关联等待及权威读失败 | 各类都映射为原条目引用；Tool intent 包含原 SE18 与生效 SE22，关联前后去重；失败时报告不可用，不交空集合 | [AD-04](#ad-04) |
| VA-08 | Tool 原确认、重复、异版本、未知，以及 Model saved 未有 ACK | Tool 只由 AD-05 按 JC-Release 写 confirmed；异版本拒绝；Model 保持 pending | [AD-05](#ad-05)、[AD-06](#ad-06) |
| VA-09 | 消息准入与当前条件的来源缺失、撤权和重复 | 按 J06 公开类型返回；不默认允许、不补默认条件、不在准入中写消息。当前条件见 `tests/conditions.spec.ts` | [J06 提供者](#j06-会话路径的两个-agent-提供者) |
| VA-10 | `AgentDrivePort` 的每种 Agent 结果 | 按表映射；非准入的 `invalid` 不成为拒收 | [AD-14](#ad-14) |
| VA-11 | 释放读回的五类处置及其组合、超时与抛出 | 逐项交出；超时以异常结束；未获授权不改用用户身份 | [AD-15](#ad-15) |
| VA-12 | 无活体控制与交还挂接 | control 走长期入口且逐次核权；detach 带原 Authority；不要求推进资格 | [AD-14](#ad-14) |
| VA-13 | 模式翻译表的每一格 | 结果与表一致并带来源证据；执行环境模式变化同批写设置声明 | [模式翻译表](#模式翻译表) |
| VA-14 | 插件以错误的调用方类调用 | Session 拒绝；插件不改用另一调用方类重试 | [AD-00](#ad-00) |
| VA-15 | 插件依赖的服务换代 | 插件体重跑；在途调用按原身份认回；已提交事实不变 | [生命周期](#所有权失败与生命周期) |
| VA-16 | Tool 日志结果/账目不可读、未知、重复与迟到 | 保持未知或失败，重复认回原版本；不查询生产者，也不重写 release 写入者 | [AD-06](#ad-06) |
| VA-17 | RQ 固定 evidence/游标、CM-02 尾项与配对、sourceCall、来源撤除 | 错域拒绝；完整窗口与原来源保留；旧代不发布；全部在途及租约结清后结束 | [AD-04](#ad-04) |
| VA-18 | 目录第二页失败、end 已提交但无 SE25、空资源 pending acquisition | 不返回空成功；两路原释放任务继续；只有两路枚举完整且全部结清才 released | [AD-15](#ad-15) |
| VA-19 | 候选采用带回冻结判定；会话已冻结 | `frozen` 的 `verdict` 等于证据桥交出的判定；会话已冻结时为 null | [AD-10](#ad-10) |
| VA-20 | 拦截留痕：测试装配里 before-admit 槽拦截一次，再以同一受理标识重试 | `accept` 在原受理标识下只写 SE12，不保管被拦正文，不取得待处理资格；重试认回原拦截。M2 装配为 `admission: 'none'`，本项只在测试装配里核 | [AD-08](#ad-08) |
| VA-21 | 身份核验答 `verified`、`rejected`、`unavailable` | `rejected` 返回 `denied` 且没有材料；`unavailable` 的 `owner` 为身份来源 | [AD-09](#ad-09) |
| VA-22 | 证据桥的三个来源逐个缺席、答失败或抛错 | 来源失败原样交回并指明拥有者，缺一项不交其余。登录门不经证据桥（R2-D198），由 session-contract 与 session-storage-sql 的用例覆盖 | [AD-10](#ad-10) |

本成员不覆盖：邻域自身的行为、真实存储事务域下的共同提交、跨进程部署，以及上表各具名前提闭合之后的行为。

## Agent Journal 提供者与非耐久替身

本节的非耐久实现从 `./testing` 提供。session-adapters 提供 agentJournal，消费冻结 Agent 的完整 Journal 角色组，不修改 Agent 端口。

生产插件 `inject` 三个键（装配页 `agent-journal` 行）：`sessionAccessCheck`，派生的四种 Session 参加按对应 Session 操作各裁定一次（[访问检查](../session-contract/docs/access-check.md#已接入的执行边界)）；`storage` 与受信的 `tenantDomainLookup`，在受信存储子树内只对已登记租户查找事务域，没有登记时不写入、不触发登记。缺任一键时插件停在 `PENDING`，四种参加不会绕过 Session 的访问裁定。Journal 的这条检查路径不经 Session 服务实例，也不经委派入口。

AgentJournal、AgentJournalEntries 与 AgentMaterials 操作共用 Session 会话日志的提交状态，执行索引以租户与 execution 为键。每次提交、重复操作、查询与材料读都核验当前资格；跨租户拒绝，不能通过材料引用绕过绑定。

提供者先准备不可变的下一份已提交状态。第一个发布点共同发布 Agent 记录、适用的四类 CallerCommit 参加事实及 Agent 原操作答案；received、完整材料、消费绑定与 saved 同批。open/attach/submit/tryFinish 的 Session 参加只读核对。首次发布失败时该批全无，丢答复按 Agent 原操作认回。

首次 custody/processed 需要尚未登记的原调用时，先核当前资格、新请求合法性及原 Agent operation 的认回/冲突。已完成原操作不重做准备。新操作仅从此前已提交的 Pending/effect/Authority→grant 关系，以独立稳定 Session operation、sequence=null 解释登记或原关联。准备未知先认原答案，不继续新结果提交。准备后重核根、资格、gap 与完整 binding，再共同发布新结果、参加事实和原答案。旧登记可在后一个 joint 失败时保留；该批不得留下新结果的半边事实，也不得把派生 SE18 塞进新 joint。

第二个发布点是后续 Session 解释提交，共同保存派生后果、解释进度与该次认回答案。解释失败不撤销首次发布，也不推进解释进度。Agent ended 与后续 Session 终态之间允许 PA-08 的取消竞争，不能把二者合并成一个原子提交。各次读取捕获一份已提交状态：output.read / output.events 读事件正文，load 读 entries/results 等快照；事件序号与 entries 提交顺序分别保持，不互作 cursor。复原索引不能改变原 Run 归属。

`./testing` 提供上述角色组的内存会话日志替身，供 CS v2 组合测试。故障注入与提交前暂停只经 testing 句柄暴露，生产根入口不暴露它们。验证义务包括 Agent 自有 entries/received 套件、提交前失败全无、提交后丢答复认回、并发修订复核及跨租户读写拒绝。验证入口及受信夹具前提见 [testing 指南](docs/testing.md)。内存原子可见不证明耐久、进程重启或跨进程同提交。

### 生产提供者的实现现状

<a id="生产提供者的实现现状"></a>

`createSessionLogJournal(options).forSession({ tenant, session })` 给出一个会话的 `AgentJournal`、`AgentJournalEntries`、`AgentMaterials` 与 `AgentReceivedCommits`。`options` 是 `storage`、受信的 `tenantDomainLookup`、`sessionAccessCheck`、会话日志组合的 `combinationVersion` 与 `manifestDigest`，另可带取消政策安装与宿主读。

存储落点（P5）：Agent 记录由 session-storage-sql 的 `execution-record` 参加者保存，与 `session` 参加者在同一租户事务域、同一个组合。提供者只用 `@omne-harness/session-storage-sql/participants` 的词汇，不导入 `createSessionStorage`。Journal 提供者自己是首个发布点的提交方（切分 X）。

Agent 规则：判定次序、认回、修订号与条件终结协议是本成员 `src/testing/journal.ts` 的 Journal 核心，与 `./testing` 替身相同。每个会话在进程内有这个核心的一份副本。副本是可丢的派生物（AD-00 第 7 条）。每次调用先读 `session.history-root`，发布计数与副本不同时，经 `execution-record.parts` 分页读出该会话的全部分区，重建副本。

一次 Journal 写入按下列次序工作：

1. 经 `tenantDomainLookup` 取事务域。结果为 `unregistered` 或 `unavailable` 时答 `unavailable`，不读、不写，也不触发登记。
2. 读共同根，必要时重建副本。写入另读 `session.work`，供推进资格核对使用。
3. 在副本上执行 Journal 核心。核心的判定次序、认回与重放规则不变。四种 CallerCommit 与主回复的 Ja 的派生参加先经 `sessionAccessCheck` 裁定一次（P6）。核心在副本上准备下一份状态，同时得到派生的 Session 参加：一条 Session 命令，或 `open`、`attach`、`submit`、`tryFinish` 的一条只读核对。
4. 副本没有变化时直接答复（读、被核心拒绝的写、认回）。
5. 副本有变化时，一次存储 `commit` 带两条命令：`execution-record` 的写入（变了的分区、原操作答案与摘要、执行边界、事实边界、批次与原受理目录，见[分区存储](#分区存储)）与派生的 Session 参加。存储操作身份由 execution 与 Agent 操作确定地编码，代次为 `#<n>`。
6. 只有已提交回执成为答复。其余结果都丢弃副本，下次调用从存储重建：
   - `execution-record` 的修订号或发布计数冲突：重建副本后重做本次调用，最多 4 轮，之后答 `unavailable`。4 轮和下面的 8 个代次都是本提供者的固定策略（`agent-journal.ts` 的 `ROUNDS`、`journal-commit.ts` 的 `ATTEMPTS`），不是配置项：连输 4 次发布竞争的会话在争用，再多一轮没有帮助；8 个代次都回滚的操作，重试也没有帮助。`commitJournal` 的 `attemptLimit` 入参只供测试。
   - 原操作行冲突：摘要与本次相同时重建并重做，核心按原答案认回。摘要不同时答 `conflict`。
   - `identity_conflict` 的原回执为 `committed`：同上按摘要分两支。原回执为 `rolled_back`：进入下一代次。
   - Session 参加停止：按 [AD-01](#ad-01) 对应表译为 Agent 的失败。Session 参加者失败：`unavailable`。不支持：`unsupported`。
   - 存储 `unknown` 或 `writer_not_current`：`commit-unknown`。同一操作再次调用时，副本从存储重建，核心按原操作认回。提供者在进程内记住这次未定的写入（代次与核心给它的记录键），之后每次调用先向存储 `query` 它：已提交则从耐久记录认回；存储证明该代次没有执行（`not_committed`）或已回滚则该操作 `excluded`，证据是 `session-log-journal` 的记录；发送前的查询就答 `unknown` 的代次也按未定写入处理，之后存储答 `not_committed` 时同样判 `excluded`。仍未定则该操作在副本里是待决项，`query` 答 `unknown`，同一 execution 的终结清单带一个未知的操作项，`tryFinish` 答 `unavailable`。已排除的操作随下一次成功发布一起存入耐久记录。没有 Agent 操作身份的写入（材料保存）在这里答 `unavailable`，不编造身份；它按材料的 identity 幂等，重试是安全的。
   - 存储受理前拒绝（含清单摘要不符）与全部代次已回滚：`unavailable`，失败关闭。

`agentJournal` 插件（`src/cordis/agent-journal-provider.ts`，决策记录 [w1-c19-q1](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6563847140)）：

- 装载：`SessionLogAgentJournalProvider` 继承 agent-cordis-contract 的 `AgentJournalService`，`inject` 为 `storage`、`tenantDomainLookup` 与 `sessionAccessCheck`。缺任一键时停在 `PENDING`，不提供 `agentJournal`。配置是会话日志组合的 `combinationVersion` 与 `manifestDigest`（小写十六进制 SHA-256），另可给 `routeCacheEntries`（初值 4096）。配置不合法时插件加载失败（`FAILED`）。停止后，停止前取得的引用对每次调用答 `unavailable`。
- 路由：一次调用先经 `tenantDomainLookup` 取事务域，再读 session-storage-sql 的读 handler `session.execution`，按 `(tenant, execution)` 取会话，最后把调用原样交给 `createSessionLogJournal(...).forSession` 的这个会话。Session 写 SE13 时在同一事务里写这条索引（session-storage-sql 的[执行索引](../session-storage-sql/SPEC.md#执行索引)），所以合法的调用之前索引已经存在。
- 缓存：execution 到会话的对应提交后不变。插件按租户与 execution 在进程内缓存它，超过 `routeCacheEntries` 时先丢最早的一条。缓存是可丢的派生物（AD-00 第 7 条）：新实例与依赖换代后的实例从存储重建。只缓存查到的对应，查不到的结果不缓存。
- 查不到：没有 Run 开过的 execution 与另一租户的 execution 得到同一个答复 `denied`，`action` 是操作名（`output.read` 为 `read`，`output.events` 为 `events`），与核心对不持有的执行的答复相同（Agent SPEC「判定次序与失败映射」第 1 条）。两种情形都不写存储。
- 读不到：租户没有事务域或查找失败、索引读取失败、输出损坏，都答 `unavailable`，`owner` 为 `session-log-journal`。读取失败不当作不存在。
- 三个键：同一插件体在同一个会话日志 Journal 上再构造 `agentJournalEntries` 与 `agentMaterials` 两个服务实例，三者在同一权威排序域。
- 结果接收面的两个键（R2-D237）：同一插件体还构造 `agentReceivedCommits` 与 `agentModelReceptionTargets`。`received.commit` 与 Journal 写一样按 `(tenant, execution)` 路由，成功后同样发 `session-adapters/agent-published`；`received.query` 按同一路由读。同一 operation、同一输入的重复 commit 认回原提交，不再写。同一插件体还构造 `agentReceivedRecords`（R2-D257）：它只有 `query`，就是 `received.query`，按同一路由读、不写、不发事件；它是 Agent consumer owner 的证据适配器按耐久接收记录核验 Model ACK 的读口，受信名，只对持有该适配器的行可见。`targets.forExecution` 按 execution 路由，答该 execution 已提交 PendingCall 建立的全部原 Model 绑定。绑定是会话 Agent 记录的一部分，checkpoint 清掉调用、挂接结束或插件重建之后仍可读。`targets.resolve` 自己不带会话：存储里没有从调用引用到会话的索引，所以它只按接收方给的路由 `execution` 读那个会话。没有路由、路由的 execution 没有这个绑定，或绑定属于别的 execution 时，都答 `denied`（action `resolve`）。entries 与 Journal 一样按 `(tenant, execution)` 路由；`materials.read` 按材料来源所记的会话路由；`materials.preserve` 恒答 `unavailable`（见[已知限制](#已知限制)第 6 条）。
- 采用请求的读口：同一插件体还提供 session-cordis-contract 的 `sessionAdoptedRequests`（FIXED-FACTS F4）。`readAdoptedRequest({ access, session })` 按会话读，不经执行路由。租户不是 legal-identity 铸造的时答 `denied`。然后以 `history.readModelView` 与该会话为目标调用一次 `sessionAccessCheck`：`denied` 原样交出，`unavailable` 或检查抛错答 `unavailable`，都不读存储。允许时按[分区存储](#分区存储)的「读采用请求」读 `a`。存储按租户分开，另一个租户读不到本会话的 `a`。停止后，停止前取得的引用答 `unavailable`。
- 治理安装（R2-D35、R2-D16）：插件工厂 `createSessionAgentJournalPlugin({ cancellation })`（`./cordis`，同 `createSessionAgentDrivePlugin` 的先例）返回继承 `SessionLogAgentJournalProvider` 的插件类，`inject`、配置与提供的三个键不变。`cancellation` 是装配入口交入的不可变安装（记录加判断实现），不进配置，也不是插件树上的键；插件创建每个会话 Journal 时原样转交，judge 每次判断调用一次。不传 `cancellation`（或不用工厂、直接装载 `SessionLogAgentJournalProvider`）时，取消终结答 `unavailable`。该安装同时是可选读口 `readCancellationInstallation`（R2-D35）的来源：session-log Journal 与按执行路由的 Journal、`forSession` 视图都实现它，按 `(tenant, execution)` 路由并核对与 `load` 相同的读取资格，返回交入安装的 `record`（`DurableEvidence`），不改变执行状态；没有交入安装时答 `unavailable`。
- 不在插件里：`hostRecords` 运行时选项（见[已知限制](#已知限制)第 6 条）；`cancellation` 只经上一条的工厂交入。

两个发布点的区别：

| 项 | 首个发布点 | 第二个发布点 |
| --- | --- | --- |
| 提交方 | Journal 提供者 | Session（`sessionTransactions`） |
| 存储操作身份 | Agent 操作身份加代次 | Session 操作身份加代次 |
| 命令 | `execution-record`，适用时加一条 `session` 参加 | 只有 `session`（`commitEntries`） |
| 共同根 | `er_root.published` 加 1；有 Session 参加时 Session 一侧位置也前进 | Session 一侧位置前进 |
| 失败的后果 | 该批全无 | 只有本次解释批次不可见。首次发布不撤销，进度不推进 |
| 丢答复的认回 | Agent 原操作 | Session 原操作 `queryOperation` |

两次提交不能合并成一个原子提交。Agent `ended` 已提交而 Session 未解释时，`cancelRun` 仍可先写 cancelled（PA-08）。

装配给与协议给：

| 保证 | 来源 | 失效条件 |
| --- | --- | --- |
| `tenantDomainLookup` 给出已发布快照中的事务域，没有登记时不触发登记 | 装配给 | 跨进程后不成立 |
| Journal 提供者的组合版本与清单摘要和 `session-storage` 行取自同一个声明组合 | 装配给 | 两行不一致时首次提交得到 `manifest_mismatch`，失败关闭 |
| 材料目录含 `session` 与 `execution-record` 两个参加者 | 装配给（会话存储组合的目录） | 目录只写 `session` 时组合无效 |
| `sessionAccessCheck` 裁定派生的 Session 参加 | 装配给；本成员的用例用替身 | 替身不证明真实授权 |
| 一个事务域只有一个写事务，发布线性排序 | 协议给（sqlite-provider 单写者） | PostgreSQL 或跨进程写者 |
| 参加者执行顺序按名字固定 | 协议给（sql-contract §7.4） | 参加者改名，或任一方声明事实依赖 |
| execution 到会话的索引与 SE13 同一事务写入，提交后不变 | 协议给（session-storage-sql 执行索引） | 索引被改写或被回填错误；本成员不检测 |
| `synchronous=FULL` 读回 | 协议给（sqlite-provider） | 不覆盖断电 |
| 一次 `commit` 内任一命令失败则全无 | 协议给（sql-contract） | 无 |

验证（用例在 `tests/`，命令与日志见交付报告）：

- `session-log-journal.spec.ts`（node:sqlite 替身，运行材料里的真实模块）：首次共同发布是一次两参加者提交；Session 写入后与 Agent 写入后各注入一次失败，两侧都不保存，同一操作随后只提交一次；解释提交只有 `session` 一条命令，失败不改 Agent 记录与进度，成功只推进进度；只读核对冲突与 P6 拒绝不写入；丢答复后同一操作认回原答案；存储在受理前拒绝时答 `unavailable`、不交准备好的答案、不写存储，随后同一操作只提交一次；写者不是当前写者时答 `commit-unknown`；存储没有执行的写入查询为 `excluded`，下一次写入把它存入耐久记录，新提供者同样答 `excluded`，其重试只提交一次；存储未定的写入查询为 `unknown`，存储判定后变为 `excluded`；没有 Agent 操作身份的写入在存储未定时答 `unavailable`；两个提供者竞争同一操作得到一个修订与同一答复；两个保留副本的提供者轮流写入；另一租户的读写答 `denied`；未登记租户答 `unavailable`，存储没有提交。
- `session-log-journal-history.spec.ts`（node:sqlite 替身）：主回复的 Ja（`caller: none`，带 `replyAdmission`）写一行 `message.assistant`，Tool 结果的 Ja（`caller: message`）写一行 `message.tool`，两者都与 Agent 记录同一次存储提交；Session 写入或 Agent 写入失败时两侧都不在，同一操作随后只写一次；rejected 的主回复不写行，也不请求 Session 参加；重试认回原回执，不写第二行。变异：主回复不派生 `recordMessage` 时主回复三个用例变红；把 Session 参加拆成第二次存储提交时同事务与失败用例变红。
- `session-log-journal-custody.spec.ts`：根 recordHandoff 的存储结果未定时，同一 H 的另一根答 `invalid`（该 H 已有保管根）；接管栅栏使它排除并发布后，它的直接后继仍接上保管链。两者都靠副本重建时放回未定写入的保管尝试，待决与排除两条路一样。
- `create-depth.spec.ts`：带首条输入的 Session `create` 提交嵌套 69 层，不带的 48 层（K-14 的原因）。
- `session-log-journal-real.spec.ts`（真实 sqlite-provider）：首次共同发布、只读核对冲突回滚、清单摘要不符时失败关闭、解释提交与首次发布分开。
- `session-log-journal-replay.spec.ts`：AG-23 的轨迹回放（agent-contract `./testing` 的 `agentJournalReplayConformance`）对生产提供者逐步通过，分两种：保留副本，与每次调用都从存储重建副本。
- `agent-journal-provider.spec.ts`：真实 Cordis 4.0.4 上装载与停止、三个依赖逐个缺席时停在 `PENDING`、配置不合法时 `FAILED`；停止后旧引用答 `unavailable`；两个会话各有执行时互不串；索引每个 execution 读一次，新实例从存储重建，超过缓存上限仍路由正确；未开 Run 的 execution 与另一租户的 execution 同答 `denied` 且不提交；索引读不到与未登记租户答 `unavailable`。agent-contract `./testing` 的 `agentJournalCoreConformance` 对 node:sqlite 替身运行两遍：一遍经插件，一遍不经插件直接用 `forSession`（同一份夹具，只换取得 Journal 的方式，所以插件路由的错与提供者的错可以分开）。54 个可驱动的用例中 53 个通过，两遍都是；剩下 1 个是提供者缺口（K-16：结果的保管转移被 Session 拒绝），用例按断言本身固定它：失败信息以 `recordResult` 开头，实际值与期望值是推进计数 `[0,0]` 与 `[1,0]`，其他失败或通过都是红。其余用例需要取消政策安装、宿主记录、资格脚本、旧候选或回复准入控制，生产插件没有这些接缝，记为未覆盖。慢层用例在真实 sqlite-provider 上核对两个会话的路由与另一租户的 `denied`。
- `journal-adopted-part.spec.ts`（node:sqlite 替身）：在 `x:` 分区写入之后、`a` 写入时注入失败，`x:` 与 `a` 都不可见，同一 M0 随后两者都写；没有改动 `adoptedRequest` 的两次发布不写 `a`（按 `a` 行的发布计数断言）；两个 execution 各一次 M0，`order` 为 `1`、`2`，两次 M0 时的执行修订是 4 与 3；新建的提供者读到的 `a` 与写入方相同，它的下一次 M0 取 `order` 2；两实例竞争时输方的提交被回滚（K-20），重读后读到赢方的 `a`，它的下一次 M0 取 `order` 2，两方读到的相同；200 轮 M0 中 `a` 的字节数最多相差 2（`order` 从一位到三位），每轮写的分区行数相同。`journal-parts.spec.ts` 另核对：另一个 execution 再次发布、请求不变时不写 `a`，重建与合并带上 `a`，畸形的 `a` 不重建。`agent-journal-provider.spec.ts` 核对插件提供 `sessionAdoptedRequests`：M0 之前答 `null`，之后答已存请求，每次以 `history.readModelView` 核对访问；拒绝、未定与抛错的检查不读存储；停止后旧引用答 `unavailable`。变异（交付报告列出）：`a` 不进同一提交、不比已存 checkpoint、`order` 改用执行修订、重建丢掉 `a`、提交后副本不换 `a`、`a` 累积旧请求，各自让对应用例变红。
- `session-log-journal-complexity.spec.ts`：保留副本时，在进度标记之后读一页的存储读次数与返回事件数在 N = 10 与 N = 100 时相同；从头读全部的负控随 N 增长。

### 分区存储

生产提供者把一个会话的 Agent 记录按 execution 分区保存在 session-storage-sql 的 `er_state_part`（session-storage-sql SPEC 第 18 条），实现在 `src/cordis/journal-parts.ts`。

| 分区 | 内容 |
| --- | --- |
| `x:<execution>` | 该 execution 的记录：执行、授权尝试、事件回执与原片段、调用来源、人工材料、索引进度、解释注记，以及结果接收里指明该 execution 的记录 |
| `o:<execution>` | 该 execution 的操作记录 |
| `s` | 不指明 execution、也不是由某个 execution 的写入新建的记录 |
| `a` | 会话最后一次主用途 M0 记下的请求（FIXED-FACTS F4）：`order`、`execution`、`reference`、`fixed`、`coverage`、`schema` 与 `record`。它不是成员列表，见下面「采用请求」一条 |

- 归属：一条记录按它自己指明的 execution 归入分区（执行按 `id`，操作按键里的 execution，事件类按键的前缀，解释注记按键里的 execution，结果接收按值里的 `execution`）。不指明 execution 的新记录归入新建它的那次写入的 execution；写入不带 execution 时归入 `s`。记录归入一个分区后不再换分区。
- 写入：一次发布写出记录变了、新增或删除的分区，另外总是写出写入方 execution 的两个分区。是否变了按对象身份判断：Journal 核心改一条记录时换成新对象（草稿副本），不原地改已发布的记录。分区与原操作答案、索引行和派生的 Session 参加在同一次存储提交里，失败时一起不保存。
- 顺序：分区里每条记录带它在所属映射里的序号，重建副本时按序号还原映射的插入顺序；删除后重新写入的记录取新序号，与进程内映射的顺序一致。
- 读取：没有副本时分页读全部分区；副本的发布计数落后时（另一个提供者实例写过同一会话），只读这个计数之后写到或删除的分区（`since`），其余分区沿用副本里已解码的记录，合并后重建副本（`mergeParts`）。每页的发布计数必须相同，否则重读，最多 3 次，之后答 `unavailable`。副本里有排除的待决写入时整份重读。AD-02 的 `readExecutionInterpretation` 与 handoff 的执行分支只读所需 execution 的 `x:` 分区。遇到整份状态（`er_state`）时答 `unavailable`：0.0.x 不迁移旧的整份数据。
- 采用请求（分区 `a`）：一次发布里，某个 execution 的 checkpoint 带有新的 `adoptedRequest`（它的 `reference` 与 `fixed` 和已存 checkpoint 里的不同，即一次新的主用途 M0）时，提供者在同一次存储提交里写 `a`。`a` 的 `order` 是会话内的采用计数，从 `1` 起，每写一次加一，不是执行修订，也不是发布计数。`reference`、`fixed`、`schema` 与 `record` 原样取自 `adoptedRequest`，`coverage` 取自同一 checkpoint 的 `adoptedContext`。提供者不解码 `record`。没有改动任何 `adoptedRequest` 的发布不写 `a`，另一个 execution 再次发布、它的请求不变时也不写。进程内副本在提交成功后同步换成新的 `a`。重建副本与合并时 `a` 随其余分区读出。`a` 的字节数只随一次请求的大小变，不随会话的轮数增长。
- 读采用请求：`readAdopted({ tenant, session })` 先读共同根。副本的发布计数与共同根相同时从副本答复，否则只点读 `a` 一个分区，不重建副本。没有 `a` 时答 `null`，读不到或 `a` 不能解码时答 `unavailable`。本改动之前写入的会话没有 `a`，同样答 `null`（0.0.x 不承诺旧字节）。
- 语义键：操作记录保存的语义键是方法名加输入规范文本的 SHA-256（`src/testing/journal-values.ts` 的 `semanticKey`），不是规范文本本身。判定只比较语义键是否相等，含义不变；保存文本时，每条 commit 记录都带一份完整 checkpoint。
- 验证：`tests/journal-parts-read.spec.ts` 核对提供者的分页读取：夹具把每页改成最多一个分区，一个只开了一个 execution 的会话也要读多页，新提供者重建后 `load` 与写入方相同；各页发布计数不一致时从首页重读，第二次读到一致即为答案，每次都不一致则读满 3 次后答 `unavailable`，不重建副本；首页带整份状态时答 `unavailable`。夹具改写的是真实读 handler 的答案，所以页序与 `after` 语义不变；计数不一致用改写第二页的 `published` 模拟另一个实例在两页之间发布。`tests/journal-parts.spec.ts` 核对归属、只写变了的分区与写入方分区、删除与清空分区、删除后重写的顺序、100 个 execution 后的写入只含写入方分区，以及畸形分区不重建。`tests/journal-interpretation.spec.ts` 的「a session with earlier Runs」在同一会话里依次跑 4 个 Run：第 4 个 Run 的最大一次写入不超过第 2 个 Run 加 64 字节，Agent 记录的读取总量（AD-02 与副本补读）不超过第 2 个 Run 加 1 KiB。实测第 1 到第 4 个 Run 的最大写入是 29,229 到 29,280 字节，读取总量是 67,231 到 67,336 字节；改前（整份单行）最大写入从约 41 KB 涨到 156 KB，副本落后时整份重读的变异下第 2、第 4 个 Run 的读取总量是 94,916 与 147,244 字节。每个 Run 由两个提供者实例写入（像 Agent 的 Journal 与接收方各一个），所以副本每个 Run 都会落后一次；从分区重建的副本按 execution 读出的 `load` 与写入它们的副本相同。`tests/journal-parts.spec.ts` 另核对合并之后写入的分区与整份重建相同、顺序不变、合并出的布局继续只写变了的分区。

### 会话事务端口的契约面

`./testing` 的会话事务替身实现 session-contract 的 `SessionTransactionPort<P>` 的全部操作。除 `commit`、读与历史面之外，下列三个操作在 head 补齐，行为以 session-contract 为准，本节只写替身怎样兑现。

| 操作 | 替身的行为 |
| --- | --- |
| `readModelSelection` | 读同一会话日志：取最近一条 `session.model-selected` 条目里的模型声明；没有时取创建快照的 `initialModelSelection`。两者都没有返回 `not-ready`。结果的 `revision` 是当前快照修订，`source` 是保存该选择的那次提交的原回执证据；找不到那次提交的原回执时返回 `unavailable`。每次读取都经访问裁定 |
| `queryControlOperation` | 只认控制身份。命中「只保存答案」的控制操作（Run 已结束或调用不存在）与带业务批次的 `cancelRun`、`stopCall` 时返回已提交的控制回执，带批次的回执按原结果还原；身份属于普通批次返回 `conflict`；没有该身份返回 `unknown`。`queryOperation` 对控制身份同样返回 `conflict`（SL07） |
| `commitEntries` | 不经访问裁定。调用 session-contract 的 `projectSessionEntries`，`saved` 取快照的 `entriesProgress`。合法时在一个同步片段里写入后果行、进度行、快照（含已存进度）、模型视图与操作记录，`readWork` 随后读回已存进度。规则与失败类别见 [entries 通道的解释提交](../session-contract/docs/same-log-pure.md#entries-通道的解释提交) |

控制命令 `cancelRun` 与 `stopCall` 在替身里的提交按访问裁定之后、查会话之前的次序处理：`stopCall` 的生产者为 Tool 时返回 `unsupported`，答复不透露会话里有什么。只保存答案的控制操作在替身里只写一行答案，不产生批次，不改变修订；同一身份、同一命令摘要重放返回原答案，摘要不同返回 `conflict`。替身没有保存调用终态，所以已绑定的调用查找结果恒为没有终态，`stopCall` 总是得到 `requested`。

### 已知限制

K-n 编号是 Session 组各成员共用的一套序列：本页用 K-6 与 K-8 至 K-22，[session-storage-sql](../session-storage-sql/SPEC.md#已知限制) 用 K-1 至 K-5 与 K-7，缺号不表示遗漏。无 K 编号的条目按位置号引用。

1. 替身的 `commitEntries` 只在进程内满足同批原子性与同一通道的互斥：读会话、判定与写入在一个同步片段里完成。它不证明事务、耐久或跨进程互斥。session-storage-sql 的同事务写入另有验证。
2. 上述三个操作与两项控制命令是新行为，没有先红后绿记录。验证以负控用例代替：跨租户、未授权、身份种类错配和重放各有反例用例。
3. 替身是非耐久的内存实现，不证明耐久、进程重启或跨进程同提交；它不覆盖 sqlite-provider 或任何真实后端。
4. K-6 提交协议有两份：切分 X 下，Journal 提供者的存储提交协议（`src/journal-commit.ts`：身份构造、代次循环、存储结果映射）与 session-storage-sql 的 `commit.ts` 是同一套规则的两份。触发条件：Session 组出现第三个提交方，或两份规则出现差异。届时把切分 Y 或「sql-contract 提供通用代次助手」交负责人重开。
5. K-8 一次发布写写入方 execution 的全部分区：Agent 记录已按 execution 分区（[分区存储](#分区存储)），一次发布的字节数不再随会话里更早的 execution 增长，但写入方自己的两个分区（`x:` 与 `o:`）每次整份写出，所以一次写入随同一 execution 的记录增长。agent-host-local 的 line-through 测试世界的纯文本轮里一次写入最大约 163 KB；Agent 的 checkpoint 带着本轮 Model 请求的内容引用，请求随对话变长，每轮多约 0.3 KB。单个分区仍受 K-1 的 `maxCommandBytes` 约束。触发条件：一个 execution 的分区接近 `maxCommandBytes`，或写入延迟超过 `perf-baseline.md` 的阈值。届时把分区再按记录拆细，或只写变了的记录。
6. K-9 `materials.preserve` 的路由：`SessionLogAgentJournalProvider` 在同一插件体内提供 `agentJournal`、`agentJournalEntries` 与 `agentMaterials`（[生产提供者的实现现状](#生产提供者的实现现状)），装配页的 `agent-journal` 行已指向它。`agentJournal` 与 `agentJournalEntries` 经 session-storage-sql 的执行索引按 `(tenant, execution)` 找到会话，`materials.read` 按材料来源所记的会话路由；`materials.preserve` 带 execution 时按 Journal 调用相同的路由找到所属会话，在该会话的 Journal 上保存，输入原样交给会话 Journal（会话 Journal 不把 material 的 execution 当作对该执行记录的写）；租户不是该执行的所有者或没有 Run 开始过该 execution 时答 `denied`（action `preserve`），执行索引不可读答 `unavailable`。不带 execution 时，存储里没有从 consumer 到会话的索引，所以答 `unavailable` 且不写入（兼容期行为）。插件不传 `hostRecords`：它是运行时对象，装配怎样给出还没有决定。取消政策安装经插件工厂 `createSessionAgentJournalPlugin({ cancellation })` 交入；不经工厂装载的插件没有取消政策安装。触发条件：不带 execution 的调用方迁移完毕后删除兼容期的 `unavailable` 分支；或生产组合需要 `hostRecords`。
7. K-10 Journal 核心在 `src/testing/`：生产提供者导入 `src/testing/journal.ts` 与 `src/testing/root.ts` 的 Journal 核心，与内存替身共用一份 Agent 规则。核心的输入水位线在进程内索引缺项时，从水位线的记录文本还原范围，条件是起点为 0 或一个已知批次的终点、终点不超过已受理的输入数。触发条件：替身与生产提供者的规则需要分开时，把核心移出 `src/testing/`。
8. K-11 推进资格的快照读：`commit` 等写入的推进资格核对（`advances`）读写入前的 `session.work` 快照，不在存储事务里复核。只有 `open`、`attach`、`submit`、`tryFinish` 与四种 CallerCommit 的 Session 参加在同一次提交里核对。取消判断（judge-cancellation）的参加者事实同样读快照，待交输入的依据记为 `unknown`。触发条件：Session 在快照读与提交之间撤回推进资格的竞争进入用例。
9. K-12 生产侧的事件解释有四处缺口。AD-02 与 AD-05 的生产插件已交付（[AD-02 生产插件](#ad-02-生产插件)、[AD-05 生产插件](#ad-05-生产插件)）。控制事件已改为延后事实，由 Session 在解释提交时判定（[控制归一](#控制归一)）。
   - 生产证据缺调用收场片段：后台槽位、结果槽位与模型收场片段只由内存替身的提交钩子捕获，生产 Journal 的状态里没有，所以生产证据的 `settled` 为空。依赖这些片段确认的控制（后台 Tool 的直接后台控制、控制命令之前已经收场的调用）在生产侧保持 `propagating`，不会被提前 `reconciled`。触发条件：生产 stop-call 或 background-tool 控制进入验收。届时把这些片段随 Agent 记录状态保存（本成员内可加，不碰 Agent 包）。
   - 同一提交的多个事件共用来源：Journal 一次写入追加的事件共用同一 `cause`（`src/testing/journal.ts` 的 `appendEvents`）。纯层的游标核对（session-contract `frontier-state` 的 `validateReplayHistory`）按来源匹配行。一次提交里先有 `observed` 事件、后有同一来源的非 `observed` 事件时，后者的解释提交覆盖前者，`observed` 事件被算上后者的行，答 `quarantined`（"interpretation cursor omits or replaces original consequences"）。内存替身同样如此。生产 Agent 现在不写这种提交：协调器（`packages/agent/agent/src/loop/coordinator.ts`）每次 `commit` 只写一种事件，`message` 只在 Ja 与 T5 的提交里单独写，`waiting`、`input-taken` 各自单独写，T1 一次写几个 `producer`，全是非 `observed`；`CommitEvent` 排除 `ended` 与 `entry`。Journal 自己追加的事件也是每次写入一种：`control` 与 `recordControl` 写一个 `control`，`tryFinish` 写 `ended`，结果接收写 `entry`。AD-02 每次只提交一个事件，所以 T1 的几个 `producer` 各自在自己的批次里，不受影响。触发条件：Agent 在一次提交里先写 `observed` 事件、再写非 `observed` 事件。届时由 session-contract 在游标核对里以事件序号区分同一来源的行。
   - 启动不扫描：AD-02、AD-05 只由发布事件唤醒，插件启动或换代时不扫描存储；漏掉的事件由同一 execution 的下一个事件补上，没有下一个事件的尾部留在未结工作里。
   - 同一 Run 中途换 execution：控制来源（`SessionControlOrigin`，Session 控制请求时活动的 execution）由 session-storage-sql 读历史时按日志顺序推出：取最近一条 `run.started` 的 execution，`run.terminal` 之后为空（`src/worker/history-index.ts` 的 `controlOrigins`）。同一 Run 中途换了 execution 时，这个推法对换之后请求的控制落空：它被记在 Run 开始时的 execution 名下，换之后的 execution 上的取消事件不认它是原控制，控制保持 `propagating`，不会被提前 `reconciled`。触发条件：Session 出现同一 Run 中途换 execution 的条目（现在没有这种条目）。届时控制来源改按控制请求时的活动 execution 记录；这在 session-storage-sql，不在本成员。另一处限制：内存替身不走 `['deferred']` 形状，纯层的延后分支由生产路径与 session-contract 的直接用例（`deferred-facts.spec.ts`、`control-normalization.spec.ts`）覆盖。
10. K-13 真实组合与杀进程认回：生产提供者在真实 sqlite-provider 上运行了首次共同发布与解释提交；Journal 层的杀进程认回没有用例，存储层的杀进程认回由 session-storage-sql 的 `tests/real-joint.spec.ts` 覆盖。生产组合（应用的目录与登记）等 L-APP 的组合声明合入后复跑。
11. K-14 嵌套深度：本成员的真实 sqlite-provider 用例把 `maxJsonDepth` 设为 80，而 session-storage-sql 的真实夹具用 64。原因已查清：存储对每条命令的事实限制嵌套深度，`create` 的初始化守卫事实（`initializationFixtureFacts`）内嵌了命令输入的带类型形式，输入每多一层，其中约多 7 层 JSON（由下面两个测量值得出）。本成员的场景用 `creation({ initial: ordinaryInput(…) })` 创建会话，输入嵌套到 `input.creation.initial.message.blocks[].visibility` 共 8 层，提交的命令因此嵌套 69 层；不带首条输入的 `creation()` 只有 5 层输入，命令嵌套 48 层。`create-depth.spec.ts` 固定这两个数。限制为 68 时 `create` 得 `command_limit`，69 时通过（慢层用例 `agent-journal-provider.spec.ts` 的真实 provider 路由用例复现），所以降回 64 不可能，除非场景放弃首条输入——而 Run 的首条输入是 `open` 的核对依据。80 在 69 之上留了余量。含义：真实的带首条输入的 `create` 需要 `maxJsonDepth` 至少 69；装配给出的上限需要用真实组合核对，输入消息的嵌套更深时更高。AG-23 回放中 Journal 写入的最大嵌套是 23。
12. K-15 未定写入只在本进程内记得：存储受理后回复丢失的写入，提供者只在进程内保存它的代次，用来向存储查询（见[生产提供者的实现现状](#生产提供者的实现现状)第 6 步）。进程重启后，这个操作在新提供者看来从未发送过，`query` 答 `unknown`，而不是 `excluded`：存储对没有见过的身份和被丢弃的写入同样答 `not_committed`，只有发送者知道自己发送过。这是保守的答案，不会把没发生的事说成发生了；同一操作再次提交时存储按身份认回或接受。另外，Journal 核心在接管挂接（带 `takeover` 的 `attach`）时把此前待决的写入转为 `excluded`（栅栏）。这一步只改副本，不向存储查询；那个代次此后在存储里是否还会被执行，本提供者不另证明。触发条件：重启后的 `excluded` 查询成为产品需求。届时需要 `execution-record` 在发送之前登记意图，这是存储一侧的新意图，交负责人。
13. K-16 结果的保管转移被 Session 拒绝：经 `recordResult` 的 `custody` 或 `processed` 转移，派生的 Session 命令 `preserveResult` 或 `completeConsumption` 需要该消费的生产者绑定，Session 没有时以 `invalid(consumption, no matching producer binding)` 停止（session-contract `decide-results`），提供者译为 Agent 的失败，`recordResult` 不推进修订。生产者绑定由 AD-05、AD-06 的 Tool 与 Model 路径登记，两个生产插件都已交付。Agent 契约的核心 Journal 套件里仍有 1 个用例因此失败（见验证一节），已按断言固定：套件夹具在 Agent 写入的会话上直接转移保管，不装载 AD-02、AD-05、AD-06 的插件，所以 Session 没有该消费的生产者绑定。触发条件：套件夹具装载登记生产者绑定的插件，使该用例到达保管转移时 Session 已有绑定。
14. K-17 T5、X5 与 C3 的历史行要等 Agent 发出对应的 CallerCommit：本绑定声明了 `message` 与 `context-transition` 参加（[PA-04](../session-contract/SPEC.md#pa-04)），Agent SPEC 的[真实历史的提交点](../../agent/agent-contract/SPEC.md#真实历史的提交点)要求此时 T5 与 X5 的 Ja 带 `message`，C3 的 Ja 带 `context-transition`。本提供者按这两种交接写 `message.tool`、`message.system_reminder` 与压缩记录。Agent Loop 在工厂配置的 `jointCommits` 含 `message` 时，T5 的工具消息与拒绝消息以 `message` 交接（agent 包 `src/loop/coordinator.ts` 的 `historyCaller`），所以 `message.tool` 在生产组合里出现。X5 与 C3 在 Loop 里还没有处理器，不发出对应的 Ja，所以 `message.system_reminder` 与压缩记录仍不出现。本提供者不替声明了交接种类的 Agent 补写这些行。触发条件：Agent 实现 X5 与 C3 并按声明发出交接，或契约改为由历史组合从 `handoff.resolve` 派生这些行。
15. K-18 AD-04 续读用的签发游标只记在进程内：Session 的 `readModelView` 游标是存储签发的不透明值，Request Context 交来的是历史序号，二者的对应由源子插件在进程内记录（[AD-04](#ad-04) 的 `history.read`）。代价：每次读到上界的读取多一次 Session 调用，重读本次新增的行；源子插件换代、进程重启、另一个 epoch 或签发游标过期（session-storage-sql 默认 15 分钟）之后的第一次读取从 epoch 开头读，成本随 epoch 的行数增长，之后恢复为只读新增行。每个会话最多记 16 个游标与 65536 行的字节数，最多记 1024 个会话。超过上限时游标丢行号最低的、字节数丢最低的行，刚签发的游标不丢；一次读取内用本页 Session 返回的 `next` 继续，所以游标表满时从开头读仍逐页前进，Session 调用数约等于行数除以每页 200 行，而不是回到第一页重读。被淘汰的低位游标使下一次从低位开始的读取多读一遍这些页，不改变答案。触发条件：冷启动的全读在长会话里超过延迟阈值，或 Session 契约提供按依据内行号续读的入口。
16. K-19 主回复的 Session 条目带 `participation.joint: message`，而 Agent 那次提交的 caller 是 none：本提供者对 `none` 且应用 model-reply 来源 prepared 结果的 Ja，从 `handoff.resolve` 派生一条 `recordMessage`，Session 把参与声明（`participation.joint: message`）写进条目；Agent 契约要求主回复「不转换为外部 `CallerCommit.message`」（[agent-contract SPEC「真实历史的提交点」](../../agent/agent-contract/SPEC.md#真实历史的提交点)），这条派生写法算不算那里所说的「转换」，待设计拥有者裁定。现在 Agent 成对给出 `handoff.resolve` 与 `replyAdmission`，从 `replyAdmission` 或从 `handoff.resolve` 派生，写出的条目相同，两种写法目前结果相同。已登记为已知限制（R2-D74）。触发条件：设计拥有者裁定后，改为读 `replyAdmission` 字段，或改写 Agent 契约该句。
17. K-20 实例输掉一次并发写入后，下一次调用整会话重读：提供者在 `publish` 开头把进程内副本置空，写入被存储以 `revision-conflict` 拒绝（另一个实例先发布了）后，输掉的实例没有副本，下一次调用的 `sync` 按没有副本处理，分页读该会话的全部分区，而不是只补读另一个实例之后写到的分区。代价：每输一次竞争，输方多读一遍整个会话的分区，字节数与页数随会话里 execution 的数量增长（每页最多 64 个分区、256 KiB），与这一次写入的大小无关；读到的内容正确，只是读得多。触发条件：同一会话的多个提供者实例并发写入而且竞争频繁，使冲突后的整会话重读超过延迟阈值。处置方向：冲突路径改以最后一次已提交的状态为基础，按 `since` 合并；该处置需要设计拥有者裁决，因为它改变 `publish` 的副本所有权。目前验收只量了发布写入与 AD-02 读取，没有并发写入下的读数。
18. K-21 AD-02 读事实体之前写入的事实没有正文（R2-D90）：`readExecutionInterpretation` 改读 `execution-record.execution-facts`，只读进度之后的事实；任一事实没有正文行（`er_fact_body` 之前的发布写的）时，整次读回退到读该 execution 的分区（`readJournalState` 加 `recordsPart`）。代价：回退的那次读的字节随该 execution 的记录增长，与修前相同。触发条件：迁移 005 之前写入、尚未解释完的 execution。回退没有独立计数器，用 `execution-record.parts` 的读次数观察（`journal-kinds.spec.ts` 的 T-P6 即如此计）。处置方向：回填正文或删除回退分支。AD-07（`message-handoff.ts`）取交接记录仍读分区，每轮 1 到 3 次，处置见 K-22。
19. K-22 两处仍直接整读 Session log 存储。Session 当前状态的唯一内存拥有者是 session-storage-sql 的工作缓存，本成员的插件经核心面 `session.work.readWork` 读它，Journal 提供者经 `readCachedSessionWork` 读它；Journal 提供者每次发布提交后调用 `registerSessionWorkIndex`，共同提交带 Session 参加时把参加者回复里的 `work` 交给它折叠，否则只换索引（[RT-04](../session-storage-sql/SPEC.md#rt-04)），所以共同提交之后的下一次读不整读；保留直接读的五类见 session-storage-sql [当前状态的拥有者与直接读者](../session-storage-sql/SPEC.md#rt-04-owner)。不在五类之内、仍随大小线性读的有两处：AD-07（`message-handoff.ts`）取 `handoffs` 与 `authorities` 时整读该 execution 的分区，O(|x|)，每轮 1 到 3 次，处置方向是随分区拆细改为向 Journal 提供者查询（需要 session-cordis-contract 新增服务键）；AD-04（`history-source.ts`）为压缩窗口经 `begin`／`next` 翻完全部历史，O(n)，处置方向是改为窗口函数。
