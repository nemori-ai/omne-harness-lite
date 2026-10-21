# @omne-harness/session-adapters 行为规格

状态：适配成员，`draft`，候选技术设计，没有运行实现。本成员是 Session 组里唯一导入邻域契约的成员。它把 Session 的命令、端口与事实翻译成六个邻域公开契约里的操作，也把邻域交来的调用翻译成 Session 的命令。治理规则不在本页。

## 范围与依据

本成员拥有三类东西：

1. 入站适配插件。邻域按自己的契约调用它们，或它们读取邻域的输出，再以 Session 的命令写入会话事实。
2. 构造依赖端口与出站端口的实现。端口接口归 [session-contract](../session-contract/SPEC.md#构造依赖端口与出站端口)，服务键归 [session-cordis-contract](../session-cordis-contract/docs/cordis.md#端口服务键)，本成员只提供实现。
3. 翻译。名称与形状的翻译只在本成员发生，见 Session 契约的[五个锚点](../session-contract/SPEC.md#五个锚点)第 2 条。`session.modes` 的翻译表在本页的[模式翻译表](#模式翻译表)。

本页依据下列已冻结或现行的正文。本页只细化适配，不削弱它们。

| 依据 | 位置 |
| --- | --- |
| 会话的命令、端口、共同提交与条款 | [session-contract SPEC](../session-contract/SPEC.md)，含[常驻工具与会话冻结](../session-contract/SPEC.md#常驻工具与会话冻结)的增补 |
| 服务键、调用方类与依赖分类 | [session-cordis-contract 的 Cordis 定义](../session-cordis-contract/docs/cordis.md) |
| Agent | [提交参加者协议](../../agent/agent-contract/SPEC.md#提交参加者协议)、[托管协调与运行实例](../../agent/agent-contract/SPEC.md#托管协调与运行实例)、[事件流与读取](../../agent/agent-contract/SPEC.md#事件流与读取)、[模型选择](../../agent/agent-contract/SPEC.md#模型选择)、[Agent 的 Cordis 定义](../../agent/agent-cordis-contract/docs/cordis.md) |
| Model | [资格、共同提交与实际发送](../../model/model-contract/SPEC.md#资格共同提交与实际发送)、[消费者 owner 的装配声明](../../model/model-contract/docs/public-api.md#消费者-owner-的装配声明)、[ACK 的前提与效果](../../model/model-contract/SPEC.md#ack-的前提与效果) |
| Tool | [P04 实际发起围栏](../../tool/tool-contract/SPEC.md#p04-实际发起围栏)、[可靠交接与处理的两条路径](../../tool/tool-contract/SPEC.md#可靠交接与处理的两条路径)、[Tool 的 Cordis 定义](../../tool/tool-cordis-contract/docs/cordis.md) |
| Runtime Context | [RC-02](../../context/runtime-context-contract/SPEC.md#rc-02-块声明注册与参数)、[RC-04](../../context/runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料)、[RC-06](../../context/runtime-context-contract/SPEC.md#rc-06-需要绑定与读者形状)、[RC-07](../../context/runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复) |
| Request Context | [历史源读口与 epoch 视图](../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图)、[RQ-06](../../context/request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界) |
| 执行环境 | [拒绝原因](../../execution/execution-environment-contract/SPEC.md#拒绝原因)、[恢复](../../execution/execution-environment-contract/SPEC.md#恢复) |
| 集成规则 | [IC 约定](../../../docs/architecture/cordis-integration-conventions.md) |

<a id="ad-00"></a>

### AD-00 全部插件的共同规则

1. 每个插件只以一个调用方类调用 `session` 服务。一项适配需要两个调用方类时，拆成两个插件。调用方类按操作授权，核对见 [Cordis 定义](../session-cordis-contract/docs/cordis.md#intercept-配置与调用方类)。
2. 插件只经邻域的公开契约与服务定义工作，不导入邻域的提供者实现（[IC-5](../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。本页只用邻域契约已有的操作名。邻域缺少的能力写成[具名前提](#具名前提与明确缺项)，不由本成员发明。
3. 邻域正文不因本成员而点名 Session。邻域只看到通用角色：外部协调者、提交参加者、消费者拥有者、作用域持有者、历史持有者、维护者。
4. 每次出站调用与每次 Session 命令都带 [OP-00](../session-contract/SPEC.md#op-00) 派生的身份。本成员把 Session 的身份确定地编码为邻域的操作身份，不另存映射，不用时间、随机数或连接参与编码。
5. 租户是每次调用的参数（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。插件不从 Cordis 上下文、isolate 或安装者推断租户。
6. 未知保持未知。邻域返回结果未知时，插件按原身份查询或把未知原样交给 Session，不改写为成功或失败。邻域的拒绝只在下文写明的对应里成为 Session 的拒绝。其他拒绝按依赖不可用处理并报告，不变成业务拒绝。
7. 插件不保存业务事实。插件只持有可丢的派生物：活体句柄、订阅、上一份已过滤快照与缓存。派生物丢失时，插件从 Session 的权威读或邻域的公开读重建，不补造事实。
8. 外部效果不因插件卸载而撤回。卸载只结束订阅、登记与在途等待。

## 结果与不变量

### 插件清单

「方向」中的入站指邻域调用本成员或本成员读取邻域输出，出站指 Session 经出站端口调用邻域。「调用方类」是插件调用 `session` 服务时的 intercept 配置。

| 编号 | 插件 | 方向 | 提供的键 | 调用 `session` 的调用方类 | 邻域操作 | 本版状态 |
| --- | --- | --- | --- | --- | --- | --- |
| [AD-01](#ad-01) | Agent 提交参加者 | 入站 | 无；参加者登记见 AD-01 | `coordinator` | `CallerCommit` 四种；`open`、`submit`、`tryFinish` 的参加 | 登记形状待 [P-1](../session-contract/SPEC.md#具名前提与明确缺项) |
| [AD-02](#ad-02) | Agent 事件消费 | 入站 | 无 | `coordinator` | `output.events`、`output.read`、`output.acknowledge`、`agentExecutionRecovery.load` | 无活体时的读取待 [NP-03](#np-03) |
| [AD-03](#ad-03) | Runtime Context 持有者与 `session.modes` 生产者 | 入站 | 无 | `coordinator`；回放子插件为 `reader` | `prepareRegistration`、`issueEligibility`、`revokeEligibility`、`applyCommit`、`registerProducer`、`bind`、`changes`、`diffForReminder` | 可登记 |
| [AD-04](#ad-04) | Request Context 历史源与未结工作下界 | 入站 | 无 | `reader`；下界读取为 `coordinator` | `HistorySource.read`；压缩计划的下界输入 | 待 [NP-01](#np-01)、[NP-02](#np-02) |
| [AD-05](#ad-05) | Model 消费适配 | 入站 | 无 | `coordinator` | `consumption.acknowledge`、`calls.inspect`、`calls.dispatches`、`consumption.beginRead`、`readNext`、`closeRead`；消费者工作守卫 | 守卫参加待 [P-4](../session-contract/SPEC.md#具名前提与明确缺项) |
| [AD-06](#ad-06) | Tool 消费适配 | 入站 | 无 | `coordinator` | `commands.releaseDelivery`、`queries.lookup`、`queries.queryOperation`、`queries.readResult`、`queries.account`、`content.read` | 可登记 |
| [AD-07](#ad-07) | 模型选择端口提供者 | 入站 | `agentModelSelection` | `coordinator` | `ModelSelection.select`；`modelProfiles.resolve` | 可登记 |
| [AD-08](#ad-08) | 受理拓展点接入 | 入站 | 无 | `intake` | 命令域与 hooks 的公开入口 | 待 [NP-07](#np-07) |
| [AD-09](#ad-09) | 身份桥 | 构造依赖 | `sessionIdentity` | 不调用 | 身份来源与授权域的公开读取 | 可登记 |
| [AD-10](#ad-10) | 证据桥 | 构造依赖 | `sessionEvidence` | 不调用 | 装配采用、生产来源、保管与 Tool 的采用点材料 | 常驻工具部分待 [P-8](../session-contract/SPEC.md#具名前提与明确缺项) |
| [AD-11](#ad-11) | 空闲输入 | 构造依赖 | `sessionIdleInput` | `maintainer` | 子会话读取；`calls.inspect`、`queries.lookup` | 可登记 |
| [AD-12](#ad-12) | Context 输入 | 构造依赖 | `sessionContextInput` | 不调用 | `prepareRegistration`、`NeedBinding` | 可登记 |
| [AD-13](#ad-13) | Tool 驻留端口提供者 | 入站 | Tool 契约定义的键 | `maintainer` 与 `coordinator` 各一个插件 | `ToolResidencyReader`、`ToolResidencyActions` | 待 [P-8](../session-contract/SPEC.md#具名前提与明确缺项)，不登记 |
| [AD-14](#ad-14) | `AgentDrivePort` | 出站 | `sessionAgentDrive` | 不调用；读输入为 `coordinator` | `invoke`、`resume`、`input.submit`、`control`、`agentExecutionRecovery.query`、`load`、`detach`、`reconcile` | `recordResult` 待 [NP-04](#np-04)；`prewarm` 不调用 |
| [AD-15](#ad-15) | `ScopeReleasePort` | 出站 | `sessionScopeRelease` | 不调用 | `executionEnvironment.releaseScope` | 换代重新释放待 [NP-06](#np-06) |
| [AD-16](#ad-16) | `ToolStartFencePort` | 出站 | `sessionToolStartFence` | 不调用 | `toolStartAuthority.invalidate` | 可登记 |

「可登记」只说明邻域一侧的入口已经存在。它不表示已经实现或验证。

### 入站插件

<a id="ad-01"></a>

#### AD-01 Agent 提交参加者

- 注入：`session`，调用方类 `coordinator`。
- 提供：Session 参加者在执行记录提供者里的登记。执行记录提供者是 Agent 的 `agentJournal` 提供者。登记的形状与组合版本归存储与 Agent 的拥有者联合（[P-1](../session-contract/SPEC.md#具名前提与明确缺项)）。登记的生命周期随本插件的 fiber（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。
- 参加种类：本插件只声明 `message`、`context-transition`、`custody`、`processed` 四种（[PA-04](../session-contract/SPEC.md#pa-04)）。装配用它比对执行记录提供者的 `capabilities.participants`。

调用方交接到 Session 命令的翻译：

| Agent 的 `CallerCommit` | Session 命令 | 翻译的材料 |
| --- | --- | --- |
| `message` | `recordMessage` | 执行身份、提交种类、消息、来源与准入证据，以及本次写入的修订与回执（[P-2](../session-contract/SPEC.md#具名前提与明确缺项)） |
| `context-transition` | `commitDerived(compaction)` | 压缩记录（`covers`、`retained`、`derivation`）与转换证据。`judgeCompaction` 在 Session 的命令处理里执行 |
| `custody` | `preserveResult` | consumption、`ProducedResult` 与保管证据 `retained` |
| `processed` | `completeConsumption` | consumption、`ProducedResult` 与完成依据 `completion` |
| `none` | 不参加 | 无 |

只读核对：

| Agent 的提交 | 核对 | 条款 |
| --- | --- | --- |
| `open`（经 `invoke` 发起） | 来源依据是 SE13 回执 | [PA-01](../session-contract/SPEC.md#pa-01) 第 1 条 |
| `submit` | 来源依据是该输入的 SE11 回执 | [PA-01](../session-contract/SPEC.md#pa-01) 第 2 条 |
| `tryFinish` | 以 `judgeCompletion` 核对待交输入与取消 | [PA-02](../session-contract/SPEC.md#pa-02) |

Session 结果到四种参加者响应的对应：

| Session 一侧的结果 | 参加者响应 | 依据 |
| --- | --- | --- |
| 命令或核对成立 | 参加 | 无 |
| 当前事实与提交前提不一致：`judgeAdvance` 不为 `ok`、`judgeCompletion` 为 `blocked` 或 `cancelled`、执行不是本 Run 的执行、会话已归档 | 冲突 | 当前事实：当前 `advance`、待交输入的 `InputId`、SE26 cancelled、SE27 |
| 同一操作身份配不同材料 | 冲突 | 原提交 |
| 读权威状态失败、存储不可用 | 失败 | 无 |
| 提交种类不在四种之内，或材料缺项 | 不支持 | 无 |

- 参加提交成功后，本插件把回执与修订交给 Session 记入 `ExecutionRef`（[PA-04](../session-contract/SPEC.md#pa-04) 第 2 项）。
- 参加提交的结果未知时，由执行记录提供者认回（[PA-05](../session-contract/SPEC.md#pa-05)）。本插件不把它列入 Session 的 `unresolved`。
- 事务内的流水线（认回、权威读、领域服务、写事实）由 [session](../session/README.md) 与 [session-storage-sql](../session-storage-sql/README.md) 执行。本插件只做翻译与登记。

<a id="ad-02"></a>

#### AD-02 Agent 事件消费

- 注入：`session`，调用方类 `coordinator`。
- 读取起点：本插件以 `readWork` 读 `ExecutionRef.readThrough`，从该序号之后读取。
- 读取：执行有活体句柄时，本插件订阅 `output.events`。句柄不在或订阅以不可用结束时，本插件以 `output.read` 按页读取，页限是配置项，不超过提供者声明的上限。

事件到 Session 命令的翻译沿 [EC-01](../session-contract/SPEC.md#ec-01)：

| Agent 事件 | 本插件提交 | 条目 |
| --- | --- | --- |
| `input-taken` | `receive(agent-event)` | SE14 |
| `message`、`stream` | 不写条目，只推进游标 | 无 |
| `producer` | `receive(agent-event)` | SE19，必要时 SE18 |
| `waiting` | `receive(agent-event)` | SE18、SE22 |
| `control` | `receive(agent-event)` | SE25 |
| `ended` | `receive(agent-event)` | SE26、SE16 |

1. 本插件按执行与序号派生 `receive` 的身份，重放时认回（[EC-02](../session-contract/SPEC.md#ec-02)）。
2. 游标与它产生的条目在同一次提交里保存。只推进游标的事件也经同一条提交路径保存游标。
3. 提交成功之后，本插件调用 `output.acknowledge`。`through` 是已持久的连续前缀，`receipt` 是该次提交的 `CommitReceipt.source`。确认结果未知时，本插件以同一前缀重试。
4. 读取返回缺口时，本插件以 `agentExecutionRecovery.load` 读完整快照，把快照的结束状态按 `ended` 处理，再从缺口之后继续。快照派生的提交 `sequence` 为 null，`source` 为快照证据。
5. 提交返回 `commit-unknown` 时，本插件不确认，按身份查询后再继续。

无活体 runtime 时按 execution 取得输出视图的入口，Agent 尚未定义（[NP-03](#np-03)）。入口定义之前，句柄不在时本插件只能经 `load` 的快照对账。它不声称已读到快照之后的事件。

<a id="ad-03"></a>

#### AD-03 Runtime Context 持有者与 `session.modes` 生产者

本插件以作用域持有者身份使用 Runtime Context 的持有者面，以生产者身份供给 `session.modes`。作用域引用由 Session 铸造，按 Runtime Context 根入口的解码函数解码。

- 注入：数组形式 `runtimeContext`（作用域持有者的适配器），`session` 调用方类 `coordinator`。回放子插件以 `reader` 调用 `session` 的历史读取。变化提醒子插件以对象形式 `runtimeContext: { consumer: 'model' }` 绑定模型类读者。
- 块声明：本插件把 `session-contract` 导出的 `sessionModesBlock` 翻译为 Runtime Context 的块声明，并在本成员的 `./cordis` 增补 `ContextBlocks`。Session 契约不导入 Runtime Context，所以增补落在本成员。
- 生产者：本插件以 `registerProducer` 登记 `session.modes`，给出按作用域供值的回调。回调以 `readWork` 读本会话三轴的当前值。SE03 提交后，本插件经生产者句柄发布新值。恢复方式为 `persisted`：Runtime Context 重建后，本插件按回调重新发布日志里的原值，不用默认值补。

持有者的三项义务：

1. <a id="ad-03-1a"></a>按耐久顺序重放（1a）。本插件在下列时点重放一个作用域：本插件体在 Runtime Context 提供者换代后重新运行，之后第一次为该作用域签发资格之前；`applyCommit` 返回「顺序不符」时。重放顺序：
   1. 按会话日志的提交顺序，经历史读取取出本会话全部 SE07，逐条 `applyCommit`。
   2. 对每个 `checkpointed` 状态块，从 `change(context-step-commit)` 的条目归约出最近一次步提交的全值，带原提交身份 `applyCommit`。
   3. 重签读取资格。
2. <a id="ad-03-1b"></a>保留上一份快照（1b）。本插件为每个读者保留上一份已按资格过滤的快照：值与摘要。它是 `diffForReminder` 的前值来源。它是可丢派生物，只在进程内保存。丢失时，下一次读取按完整快照处理，第一份变化材料不带前值，本插件不补造提醒。
3. <a id="ad-03-1c"></a>补拉的上界（1c）。唤醒只加速补拉。本插件在两个时点必须补拉：
   1. 每次步边界提交（`change(context-step-commit)`）成功之后。
   2. 为一次新的模型请求给出历史依据之前（见 [AD-04](#ad-04)）。

   上界是「下一次模型请求之前」，与时间无关。Runtime Context 契约把这个上界交给持有者定（[明确缺项](../../context/runtime-context-contract/SPEC.md#明确缺项)）。1b 与 1c 是本成员推出的技术决定，待 Runtime Context 拥有者复核。

变化提醒的写法与时点：

1. 本插件用模型类读者的游标调 `changes`，再以上一份快照调 `diffForReminder`，得到变化材料。
2. 本插件以 `commitDerived(context-reminder)` 把变化材料写成 SE10 的系统提醒。来源标记取 message 包的封闭取值。操作身份从会话与变化材料身份派生，同一变化材料认回。
3. 会话已归档时，提交返回 `archived`，本插件不再追加提醒。
4. 游标作废时，本插件丢弃上一份快照，下一次读取取完整快照。

资格的签发与撤销：

- 执行开始或建立新的执行挂接时，本插件按读者的消费者类签发资格。资格带块键集合与需要绑定集合。需要绑定来自注册材料（[AD-12](#ad-12)）。
- 压缩提交之后，本插件对模型类读者重签资格（[RC-04](../../context/runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料)）。在提交与重签之间崩溃时，恢复先重签，再接续。
- 会话归档后，本插件撤销该作用域的全部读取资格。

`change` 的注册决定由 Session 提交。Session 返回 `commit-unknown` 时，本插件不调用 `applyCommit`，先按操作身份查询（[身份桥、证据桥与 Context 输入](../session-contract/SPEC.md#身份桥证据桥与-context-输入)）。

<a id="ad-04"></a>

#### AD-04 Request Context 历史源与未结工作下界

本插件以历史持有者身份实现 `HistorySource`，并给出未结工作下界。

- 注入：`session`。读历史的子插件以 `reader` 调用；读 `readWork` 求下界的子插件以 `coordinator` 调用。
- 历史依据：一次组装开始时，本插件给出历史依据：epoch、上界、作用域引用与访问身份。给出新的历史依据之前，本插件先完成 [AD-03](#ad-03-1c) 的补拉，使变化提醒落在上界之内。
- 读取：`read(evidence, after, budgetBytes)` 按历史依据读当前 epoch 视图的一页。每行带序号、条目位置、字节数与前缀摘要。epoch 已变时返回 `epoch-changed`，不拼接两个 epoch 的页。访问身份不合格时返回无资格。读路径不可用时返回不可用，不返回空页。
- 前缀摘要缓存：本插件可以缓存已读行的前缀摘要。缓存按 epoch 键入，只淘汰，不失效。缓存不是事实源。
- 未结工作下界：本插件以 `readWork` 取快照，调 `openWork`，把六类未结工作映射为条目引用集合（跨边界编码为 `RecordEntryRef`），交给压缩计划作为保留名单的下界。未读的 Agent 事件计入下界（[EC-03](../session-contract/SPEC.md#ec-03)）。权威读失败时，本插件报告不可用，不交空集合。
- 压缩参加：压缩转换的共同提交经 [AD-01](#ad-01) 的 `context-transition` 到达 Session。本插件不另写压缩事实。提交之后的重签归 [AD-03](#ad-03)。
- 人侧投影：读取者需要对人的历史视图时，调用 Request Context 的纯操作 `projectForHuman`。它不分页，不写回。

本插件有两个缺口。Session 的事务端口没有读取 epoch 视图的操作（[NP-01](#np-01)）。Request Context 没有为历史源读口定义取得方式（[NP-02](#np-02)）。两项闭合之前，本插件不登记。

<a id="ad-05"></a>

#### AD-05 Model 消费适配

本插件是 Session 作为 Model 消费者拥有者的一侧。Model 的调用、重试与中断由 Agent 发起。本插件只做三件事：守卫参加、交付责任解除、账目与收场读取。

- 注入：`modelRuntime`，`session` 调用方类 `coordinator`。
- 受信证据适配器：本插件为会话的消费者 owner 提供受信证据适配器。ACK 的 `DurableEvidence.owner` 填调用的 `ConsumerRef.owner`，证据其余部分取自 SE20 或 SE21 的 `CommitReceipt.source`。owner 的装配声明由承载受理提交的 `ModelCommands` 实现持有，由应用装配给出。
- 受理点守卫参加：守卫参加以资格参加者协议闭合为前提（[P-4](../session-contract/SPEC.md#具名前提与明确缺项)）。协议闭合之前，会话的消费者 owner 不能声明为受守卫的 owner，只能声明为免守卫。免守卫不提供单调失格。控制传播对 Model 只有路径 1 与路径 2（[EC-12](../session-contract/SPEC.md#ec-12)）。
- 交付责任解除：SE20 或 SE21 提交成功之后，本插件调用 `consumption.acknowledge`，输入是原 operation、call、result 与耐久证据。成功后本插件以 `receive(release)` 写回确认（[EC-04](../session-contract/SPEC.md#ec-04)）。
  - Model 答复尚不具备确认条件时，`release` 保持 pending，本插件不写确认。
  - 结果未知时，本插件以同一操作身份重发。Model 对重复确认返回原 ACK 与当前清理状态（[P-6](../session-contract/SPEC.md#具名前提与明确缺项)）。
  - Model 以伪造或不属于 owner 的证据拒绝时，本插件不写确认，报告证据适配缺陷。
- 账目与收场：Agent 不在场时，本插件按原调用以 `calls.inspect` 读收场，以 `calls.dispatches` 读账目，再以 `receive(execution)` 与 `receive(account)` 提交（[EC-09](../session-contract/SPEC.md#ec-09)）。`receive` 的身份从生产者记录身份与修订派生。读不到时保持未知，不当作未发生。
- 内容读取：本插件只在 Session 单方保管结果时（Agent 记录已删除，[EC-07](../session-contract/SPEC.md#ec-07)）以 `consumption.beginRead`、`readNext`、`closeRead` 读原结果。读取断开时不重做 Model 调用。

<a id="ad-06"></a>

#### AD-06 Tool 消费适配

- 注入：`toolRuntime`，`session` 调用方类 `coordinator`。
- 交付责任解除：SE20 或 SE21 提交成功之后，本插件调用 `commands.releaseDelivery`，输入是原调用引用、结果版本、交付身份、原消费位置与交接证据。结果为 `released` 时，本插件以 `receive(release)` 写回原生产者的耐久回执。
  - 结果为 `commit-unknown` 时，本插件以 `queries.queryOperation` 查询原操作，查到之前不写确认。
  - 同一调用身份配另一个消费位置时，Tool 拒绝。本插件不改位置重试，报告翻译缺陷。
- 查询与内容读取：本插件以 `queries.lookup` 读调用的当前状态，以 `queries.readResult` 按固定结果版本分页读结果，以 `content.read` 读附件，以 `queries.account` 读账目。读到的收场、转后台确认与账目以 `receive(execution)`、`receive(account)` 提交。
- 迟到版本：Tool 的迟到版本登记在原消费绑定下，不创建新 Run 或新调用（[值与结果项的约束](../session-contract/SPEC.md#值与结果项的约束)）。
- Run 终态后到达、仍有投递资格的后台结果，由本插件先登记结果，再以 `accept(business)` 交给受理（[EC-08](../session-contract/SPEC.md#ec-08)）。`accept` 的业务分支允许 `coordinator`。

<a id="ad-07"></a>

#### AD-07 模型选择端口提供者

- 提供：`agentModelSelection`，实现 Agent 的 `ModelSelection.select`（[模型选择](../../agent/agent-contract/SPEC.md#模型选择)）。插件 `extends` Agent 的 `ModelSelectionService`，不另写键。
- 注入：`modelProfiles`，`session` 调用方类 `coordinator`。
- 动作：
  1. 本插件取 `conditions.model` 作为当前选择的采用依据。会话路径上，这个依据来自本会话保存的选择（SE04）。
  2. 本插件从历史依据取模态要求，与请求准备所用的历史范围一致。
  3. 本插件以 `modelProfiles.resolve` 按路由与模态要求解析档案，返回 `SelectedModel`。
- 失败：解析出的档案 `selectable` 为 false、路由已下架、被配置排除、模态不相容或档案来源不可读时，本插件返回失败，不改用其他路由。
- 选择不写 Session 事实，不授予发送资格。选择变化只影响下一次请求。

<a id="ad-08"></a>

#### AD-08 受理拓展点接入

- 注入：`session`，调用方类 `intake`。
- 顺序：受理前一组依次是用途提醒、内容型斜杠命令展开、用户提示提交的 hook。之后是 `accept` 受理提交。受理后一组是分流与推进条件检查。顺序与提交边界见系统页的[受理流水线与业务流程拓展点](../../../docs/architecture/runtime/session-and-run.md#受理流水线与业务流程拓展点)。
- 拦截时，本插件返回原因，不保管正文。拓展点的留痕随 `accept` 同批提交。
- 拓展的语义归命令域与 hooks 的拥有者。它们的公开入口尚未定义（[NP-07](#np-07)）。入口定义之前，本插件不登记，受理入口直接调用 `accept`。

#### 构造依赖端口的实现

<a id="ad-09"></a>

##### AD-09 身份桥

- 提供：`sessionIdentity`，实现 `SessionIdentityBridge`。插件 `extends` 对应的端口抽象类。
- 动作：本插件核实主体的可信来源，生成绑定租户、会话、操作与命令的 `GuardCommand`。材料不能用于另一命令，不序列化主体的秘密。
- 失败：身份来源不可用时返回 `unavailable`，`owner` 为身份来源。Session 一侧只有变更操作因此返回 `unavailable`。

<a id="ad-10"></a>

##### AD-10 证据桥

- 提供：`sessionEvidence`，实现 `SessionEvidenceBridge`。
- 按命令种类取材料：

| 命令 | 材料 |
| --- | --- |
| `startRun`、`reload`、`create` | 当前定义采用、候选采用与登录确认。候选采用材料另带 Tool 在采用点给出的三项：新纳入的常驻工具（写 SE36）、为常驻工具固定的登记键（随 SE08）、冻结判定（`FreezeVerdict`） |
| `preserveResult` | 生产来源与耐久保管 |
| `completeConsumption`、`completeExternalConsumption` | 原消费位置与投递资格 |
| `receive` | 原生产记录或 Agent 事件的来源 |
| `change` | 入口、资产与声明条件。执行环境模式变化时，另带会话层目标环境设置声明（见[模式翻译表](#模式翻译表)） |
| `freeze` | Tool 的冻结判定与耐久证据 |

- 常驻工具的三项材料由 Tool 契约规定（[P-8](../session-contract/SPEC.md#具名前提与明确缺项)）。Tool 一侧定义之前，候选采用材料不带它们，Session 不写 SE36、SE37。
- 候选采用材料带回冻结判定时，Session 的 `startRun` 或 `reload` 返回 `frozen`。之后由推进协调以该判定调用 `freeze`（[常驻工具与会话冻结](../session-contract/SPEC.md#常驻工具与会话冻结)）。
- 失败：材料准备失败时，本插件返回失败并指明拥有者。它不缺一项材料仍交出其余材料。

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
- 材料是已可靠准备、尚未生效的增加、更新或移除。注册决定的唯一提交点是 Session 的 `change`。拒绝时材料仍只是候选。
- 失败：`prepareRegistration` 拒绝时，本插件交回逐项原因，Session 的命令返回 `invalid`。Runtime Context 不可用时返回不可用。

<a id="ad-13"></a>

#### AD-13 Tool 驻留端口提供者

`ToolResidencyReader` 与 `ToolResidencyActions` 由 Tool 声明，由本成员实现（[由本组实现的 Tool 端口](../session-contract/SPEC.md#由本组实现的-tool-端口)）。端口形状与服务键归 Tool 契约。

| Tool 端口 | 插件与调用方类 | 翻译 |
| --- | --- | --- |
| `ToolResidencyReader.referencing({ scope: 'system', key })` | 读取插件，`maintainer` | 把 Tool 的登记键编码为 `ResidentKey`，以 `references` 逐页读取，返回会话身份与 shape。`references` 返回 `unavailable` 时原样交回，不返回空页 |
| `ToolResidencyActions.freeze({ session, cause: 'tool-shape-lost', evidence })` | 动作插件，`coordinator` | 从引用查询或会话目录取得租户，以 `freeze` 提交。重复调用认回原回执 |

Tool 契约定义这两个端口的形状与服务键之前，本成员不登记它们的提供者（[P-8](../session-contract/SPEC.md#具名前提与明确缺项)）。

### 出站端口的实现

出站端口由 [session](../session/README.md) 的协调器经 `ctx.get` 现取。端口缺席时，Session 一侧的任务保留并重放，见 [Cordis 定义](../session-cordis-contract/docs/cordis.md#端口服务键)。

<a id="ad-14"></a>

#### AD-14 `AgentDrivePort`

- 提供：`sessionAgentDrive`。插件 `extends` 对应的端口抽象类。
- 注入：`agentInstances`、`agentExecutionRecovery`；`session` 调用方类 `coordinator`，只用于 `readInput`。
- 主体：出站调用的主体是应用装配为会话协调者签发的主体。Agent 在实际执行处以 `AgentAccessCheck` 核验它。

| 端口操作 | Agent 操作 | 翻译 |
| --- | --- | --- |
| `invoke` | `agentInstances.resolve` 取 `AgentRuntime`，再 `invoke` | 首条输入经 `readInput` 取内容，组成 `AcceptedInput`；来源依据为 SE13 回执；`grant` 为本 attempt 的 SE15 证据；执行身份为 SE13 所记。本插件保留返回的执行句柄 |
| `submit` | 执行句柄的 `input.submit` | 输入经 `readInput` 取内容；来源依据为该输入的 SE11 回执 |
| `resume` | `AgentRuntime.resume` | `recovery` 为恢复依据或交接证明；`grant` 为新 attempt 的 SE15 证据。接管资格由 Agent 按主体核验，本插件不判断 |
| `control` | 执行句柄的 `control` | `Control` 翻译为 `ExecutionControl` |
| `detach` | `agentExecutionRecovery.detach` | 本插件先以 `load` 取目标挂接的 `Authority`，再带原因依据交还 |
| `recordResult` | 合格保管方经 `reconcile` 内的 `recordResult` | 见 [NP-04](#np-04) |
| `query` | `agentExecutionRecovery.query` | `excluded` 原样交回，等于 Session 的 `not-committed` |
| `inspect` | `agentExecutionRecovery.load` | 快照映射为 `ExecutionStatus`：执行状态、挂接状态、修订、结束结论与依据 |
| `prewarm` | 无 | 不调用 Agent，返回 `unsupported`（[P-7](../session-contract/SPEC.md#具名前提与明确缺项)） |

结果的对应：

| Agent 的结果 | 端口结果 |
| --- | --- |
| 受理回执、挂接回执、交接依据、命令回执 | 成功，带修订与证据 |
| `busy`、`denied`、`terminal`、`changed`、`stale-advance`、`unsupported`、`conflict` | 同名的 `DriveFailure` |
| `invalid`，且是消息准入拒收（字段为 `value`） | `invalid`，带拒收原因与拒收证据 |
| 其他 `invalid` | `unavailable`，诊断标为翻译缺陷，并报告。它不成为拒收，不产生 SE35 rejected |
| `unavailable` | `unavailable` |
| `commit-unknown` | `commit-unknown`，带原操作身份 |

- 结果未知时，Session 先 `query`，不换身份重发。本插件不自行重试未知的调用。
- `submit` 与 `control` 需要执行句柄。句柄只在本进程从 `invoke` 或 `resume` 取得后存在。句柄不在时，本插件返回 `unavailable`，任务由 Session 保留（[NP-03](#np-03)）。PM-13 的路径 2 以 `resume` 取得新句柄后再送控制。
- `inspect` 不能区分「记录不存在」与其他读取失败：`load` 只有 `denied` 与 `unavailable`（[NP-05](#np-05)）。本插件不产生 `missing`。PM-14 的「尚未受理」以 `query` 的 `excluded` 判断。
- 本插件不调用 `prewarm` 对应的任何 Agent 入口。

<a id="ad-15"></a>

#### AD-15 `ScopeReleasePort`

本插件担任执行环境契约里的维护者。本版应用装配层把这个角色交给本插件。

- 提供：`sessionScopeRelease`。
- 注入：对象形式 `executionEnvironment: { caller: 'maintainer' }`。
- 恢复授权：应用装配层的维护拥有者签发恢复授权。装配入口构造本插件的端口实现时交入它，它不进插件树，也不是插件配置（[IC-16](../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。它不是会话用户的访问身份。用户撤权或退出不阻断回收。
- 动作：本插件把 Session 铸造的作用域引用解码为执行环境的作用域引用，调用 `releaseScope(scope, recoveryAccess)`。释放不发起新的获取。

读回的对应：

| 执行环境的读回 | 处置 |
| --- | --- |
| 全部已停，没有待处置、不支持项或枚举失败 | `released` |
| 有待处置的资源 | `pending` |
| 有不支持恢复的提供者或资源 | `unsupported` |
| 有提供者枚举失败，或以 `unavailable` 拒绝 | `unavailable` |
| 以 `notAuthorized` 拒绝 | `not-authorized` |

- 一次读回可以同时落入几类，本插件逐项交出全部处置与读回证据。
- 调用超时或执行环境抛出时，本插件让 `release` 以异常结束，不编造读回。Session 一侧把任务状态记为 `unknown`，以同一操作身份重试。
- 枚举失败表示资源未知，不表示没有资源。
- 执行环境提供者换代时，本插件体重新运行，对已归档会话的作用域按页重新调用 `releaseScope`，每个作用域沿原任务的操作身份。会话契约没有列出这些会话的读操作（[NP-06](#np-06)）。

<a id="ad-16"></a>

#### AD-16 `ToolStartFencePort`

Session 是 Tool 启动排序域里工作资格的版本拥有者（[ToolStartFencePort](../session-contract/SPEC.md#toolstartfenceport)）。

- 提供：`sessionToolStartFence`。
- 注入：`toolStartAuthority`。
- 动作：本插件把参数翻译为 `invalidate` 的输入：
  - `operation`：从 Session 的控制或换代操作身份与资格范围确定地编码。
  - `guard`：`owner` 为会话的消费者 owner，`resource` 为资格范围（Run、attempt 或整个会话）的编码，`revision` 为撤销后的资格版本，`evidence` 为撤销资格的提交回执，`scope` 为 `resource`。

结果的对应：

| Tool 的结果 | 端口结果 |
| --- | --- |
| 成功，带耐久证据 | `effective` |
| 不可用 | `unavailable` |
| 结果未知 | `commit-unknown` |

- Tool 的 `invalidate` 没有「已受理、尚未生效」的答复，所以本插件不产生 `pending`。
- 只有 `effective` 经 `receive(start-fence)` 计入对账进度。其他结果使任务保留，由 Session 按同一操作身份重放。
- 失效生效之前，本插件与 Session 都不声称新的 Tool 发起已被阻止。

### 模式翻译表

翻译是本成员里带来源证据的纯函数。它们在模式变化时算好，不在请求或工具调用时翻译。授权域与元能力宿主只读自己的值，不认识模式词。Tool 与扩展不是 `session.modes` 的消费者。

`session.modes` 经 Runtime Context 的需要绑定（`NeedBinding`）交给消费者：

| 轴 | 会话值 | 消费者与它的需要 | 翻译后的值 |
| --- | --- | --- | --- |
| 权限处理 | `never` | 授权域 `DecisionMode.onAsk` | `deny` |
| 权限处理 | `auto_permission` | 授权域 `DecisionMode.onAsk` | `ask-human` |
| 权限处理 | `bypass-permissions` | 授权域 `DecisionMode.onAsk` | `skip-ask` |
| 协作 | `co-work` | 元能力宿主：人机交互可用；可请求批准 | `true`；`true` |
| 协作 | `auto-drive` | 元能力宿主：人机交互可用；可请求批准 | `false`；`false` |

- 翻译结果带来源证据：SE03 的回执与翻译函数的版本。
- `skip-ask` 只跳过询问，不越过结构化权限限制。结构化权限在动作准入处拒绝，本成员不替它判断。
- `co-work` 下的提问仍受权限限制。这一限制由授权域的 `DecisionMode` 表达，元能力宿主的两个布尔值不重复表达它。

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
| 执行句柄与事件订阅 | AD-14 与 AD-02 的插件 fiber | 插件卸载、执行结束或句柄失效 |
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
- 第一版靠装配单实例兑现每个租户一个恢复扫描者（[IC-19](../../../docs/architecture/cordis-integration-conventions.md#ic-19)）。本成员的插件不扫描恢复，只在被调用或被唤醒时工作。AD-15 换代后的重新释放是唯一由插件自己发起的批量工作。

### 具名前提与明确缺项

Session 契约的 [P-1 至 P-8](../session-contract/SPEC.md#具名前提与明确缺项) 照常适用。下表是本成员在适配时另外发现的缺口。闭合之前，相应插件按「之前」一列表现。

| 编号 | 缺什么 | 拥有者 | 之前 |
| --- | --- | --- | --- |
| <a id="np-01"></a>NP-01 | Session 的事务端口没有读取 epoch 视图（模型可见历史、序号与前缀摘要）的操作 | Session 契约 | AD-04 不登记。Request Context 读不到会话历史 |
| <a id="np-02"></a>NP-02 | Request Context 没有为 `HistorySource` 与历史依据定义取得方式。调用方在 `assembly(scope, ports)` 时逐次交入读口 | Request Context 与协调者一侧的集成包拥有者 | 同上 |
| <a id="np-03"></a>NP-03 | 无活体 runtime 时按 execution 取得输入、控制与输出视图的入口，见 Agent 开放问题[无活体 runtime 时怎样按 execution 取得执行视图](../../agent/agent/docs/architecture/open-questions.md#无活体-runtime-时怎样按-execution-取得执行视图) | Agent 拥有者 | 句柄不在时，`submit` 与 `control` 返回 `unavailable`，事件只经 `load` 的快照对账 |
| <a id="np-04"></a>NP-04 | 合格保管方记录迟到结果的公开入口。`reconcile` 的输入只有操作身份，不带结果、交接与释放；`recordResult` 是执行记录端口，只在 Agent 已核验的操作内调用 | Agent 拥有者 | `recordResult` 返回 `unavailable`，任务保留。Agent 记录已删除时，Session 照契约单方保管 |
| <a id="np-05"></a>NP-05 | `load` 不区分记录不存在与读取失败 | Agent 拥有者 | 本成员不产生 `missing` |
| <a id="np-06"></a>NP-06 | 会话契约没有按页列出已释放作用域或已归档会话的读操作 | Session 契约 | 换代后只重新释放仍有 `tasks.scope-release` 的会话，其余作用域落入执行环境重启窗口 |
| <a id="np-07"></a>NP-07 | 命令域与 hooks 的公开入口 | 命令域与 hooks 拥有者 | AD-08 不登记 |
| <a id="np-08"></a>NP-08 | 交付责任解除没有出站端口，`pending` 的原因也不含待解除的结果 | Session 契约 | AD-05 与 AD-06 只在提交通知或恢复协调交来的读取后发现待解除项。通知丢失而进程重启时，发现依赖下一次读到该会话 |

## 组合与验证

本成员消费的承诺：Session 契约的提交、认回与条款；各邻域契约的操作与失败语义；Cordis 的必需依赖换代语义。本成员不验证邻域的行为，只验证翻译与对应。

下表是持续验证义务，不是本次已执行的测试。它们随实现进入 `tests/`。

| 编号 | 场景 | 必须观察的结果 | 条款 |
| --- | --- | --- | --- |
| VA-01 | 四种调用方交接与 `none` | 各翻译为对应命令；`none` 不参加；第五种返回「不支持」 | [AD-01](#ad-01) |
| VA-02 | Session 结果的每一类 | 按表映射为参加、失败、冲突或不支持，冲突带依据 | [AD-01](#ad-01) |
| VA-03 | 事件重放、缺口与确认未知 | 重放认回；缺口经快照对账；确认只在游标持久后发出 | [AD-02](#ad-02) |
| VA-04 | Runtime Context 重建与 `applyCommit` 顺序不符 | 按日志顺序重放，再交回步提交全值，再重签 | [AD-03](#ad-03-1a) |
| VA-05 | 上一份快照丢失 | 下一次读取取完整快照，不补造提醒 | [AD-03](#ad-03-1b) |
| VA-06 | 步边界提交与新的历史依据 | 两个时点都完成补拉；提醒落在上界之内 | [AD-03](#ad-03-1c) |
| VA-07 | 未结工作下界的六类与权威读失败 | 六类都映射为条目引用；失败时报告不可用，不交空集合 | [AD-04](#ad-04) |
| VA-08 | Model 与 Tool 的交付责任解除：成功、未就绪、未知、重复 | 只在确认后写 confirmed；未知按原身份查询 | [AD-05](#ad-05)、[AD-06](#ad-06) |
| VA-09 | 模型选择的五种失败 | 返回失败，不改用其他路由 | [AD-07](#ad-07) |
| VA-10 | `AgentDrivePort` 的每种 Agent 结果 | 按表映射；非准入的 `invalid` 不成为拒收 | [AD-14](#ad-14) |
| VA-11 | 释放读回的五类处置及其组合、超时与抛出 | 逐项交出；超时以异常结束；未获授权不改用用户身份 | [AD-15](#ad-15) |
| VA-12 | `invalidate` 成功、不可用、未知 | 只有成功为 `effective` | [AD-16](#ad-16) |
| VA-13 | 模式翻译表的每一格 | 结果与表一致并带来源证据；执行环境模式变化同批写设置声明 | [模式翻译表](#模式翻译表) |
| VA-14 | 插件以错误的调用方类调用 | Session 拒绝；插件不改用另一调用方类重试 | [AD-00](#ad-00) |
| VA-15 | 插件依赖的服务换代 | 插件体重跑；在途调用按原身份认回；已提交事实不变 | [生命周期](#所有权失败与生命周期) |

本成员不覆盖：邻域自身的行为、真实存储事务域下的共同提交、跨进程部署，以及上表各具名前提闭合之后的行为。
