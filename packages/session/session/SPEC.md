# Session 通用实现的行为规格

本成员实现[会话契约](../session-contract/SPEC.md)的[运行契约](../session-contract/SPEC.md#运行契约候选)，不新增公开行为。契约已经写定的操作、失败、事件与状态机，本文只链接，不复述。本文写契约没有写的机制：命令处理器流水线、五个协调器、七个调度器、受理拓展点的编排、缓存、从 Agent 事件派生事实的读取，以及这些机制的持续验证义务。状态为候选技术设计。根入口目前为空，没有生产实现；本文存在不表示实现、提供者或验证已经完成。

本文的条款前缀：AP 应用层规矩，CP 命令处理器流水线，EX 受理拓展点，C1 至 C5 协调器，S1 至 S7 调度器，SR 调度器共同规则，RD 事件派生读取，CA 缓存，CR 崩溃矩阵，VM 持续验证义务。契约条款沿契约的前缀（OP、JC、PA、PM、EC、RS、I-R、I-F、P、VC），事件编号沿[事件目录](../session-contract/docs/object-model/session-log-events.md#原生事实类别)，守卫编号沿[状态转移页](../session-contract/docs/object-model/session-state-transitions.md#命令守卫与完整结果)。

## 兑现责任

本成员兑现四个面的全部变更操作与读操作，经[构造依赖端口与出站端口](../session-contract/SPEC.md#构造依赖端口与出站端口)取得外部能力。成员落位沿组根的[落位判据](../docs/architecture.md#落位判据)：用替身就能跑完整个状态机的逻辑放本成员；真实时钟、通知总线与装配端口归 `session-cordis`；导入邻域契约的翻译归 `session-adapters`；介质归 `session-storage-sql`。系统层的协调器与调度器表见[协调器与调度器](../../../docs/architecture/runtime/session-and-run.md#协调器与调度器)，本文给出精确机制。

### AP 应用层六条规矩

| 编号 | 规矩 | 本成员怎样兑现 | 违反时怎样被拒 |
| --- | --- | --- | --- |
| AP-1 | 业务规则不进应用层 | 允许与拒绝只由[领域服务](../session-contract/SPEC.md#领域服务与归约)的纯裁定给出。命令处理器、协调器与调度器只编排读取、裁定、提交与通知 | 协调器里出现允许或拒绝的分支，是实现缺陷 |
| AP-2 | 一个用例只做一次提交 | 每个命令恰一次 `SessionTransactionPort.commit`。跨用例的事只能由后一个用例读取前一个用例已经提交的事实 | 两次普通写入不构成共同提交（[共同提交与共享事务域](../session-contract/SPEC.md#共同提交与共享事务域)） |
| AP-3 | 幂等只依靠操作身份 | 协调器与调度器重放同一命令时按 [OP-00](../session-contract/SPEC.md#op-00) 派生同一身份；每个命令的第一步是 `resolveOperation` | 不按身份派生的重放得到 `conflict` 或重复效果，是实现缺陷 |
| AP-4 | 协调器与调度器不持有状态 | 它们从权威读重建要做的事。内存里只有调度计时、重放计数与缓存，丢失后由恢复扫描重建 | 依赖内存状态裁定资格的读数不算权威读 |
| AP-5 | 外部效果与日志分开 | Session 对 Agent、执行环境与子会话的调用在提交之后发出，回执作为新事实提交。Tool 围栏与生产者交付解除沿各原拥有者的协议处理。提交成功而调用未发出时，由调度器按同一操作身份重放 | 日志事务里不包含出站调用；提交未知期间不发出依赖它的效果（[PA-07](../session-contract/SPEC.md#pa-07)） |
| AP-6 | 请求到了不算，算在请求之前 | 派生物在变化时维护：快照物化、待办索引、模型视图代、已校验装配候选。请求到达时只读取与采用 | 热路径上出现随历史长度增长的读取，是实现缺陷 |

### CP 命令处理器流水线

每个变更命令按同一条流水线处理。流水线由本成员实现，参加者材料由桥与端口提供。契约规定的四步见[四个面与公开操作](../session-contract/SPEC.md#四个面与公开操作)，本节给出每步的输入、输出与失败分支。

命令到条目批次的编码只有一份：契约导出的纯函数 `decide`（[领域服务与归约](../session-contract/SPEC.md#领域服务与归约)）。存储参加者在提交事务里调用 `decide`，得到条目批次或拒绝结局。本成员不另写命令到条目的编码，也不把条目批次交给存储参加者。流水线在事务外也调用同一个 `decide`，只为得到拒绝原因并决定要收哪些材料。事务外的结果不进入提交。

<a id="cp-01"></a>

#### CP-01 Session 为提交方的命令

| 步 | 动作 | 输入 | 输出 | 失败分支 |
| --- | --- | --- | --- | --- |
| 1 认回原操作 | 核对 `Access`；按 OP-00 派生 `SessionOperationId` 与规范化参数摘要，摘要只覆盖语义参数；点查操作记录；调用 `resolveOperation` | 命令参数；操作记录 | `new`、`recovered`（原回执）或 `conflict` | 缺租户 `invalid`；跨租户 `denied`；`recovered` 时按当前读取资格返回原回执，`recovered` 为真，流水线结束；`conflict` 返回，不提交 |
| 2 权威读 | 在同一事务边界读 `WorkSnapshot`。命令带 `expected` 时，记下 `revision` 作为本次提交的 `expected` | `Access` | 一个完整提交位置上的快照 | 读不到返回 `unavailable`；归约隔离返回 `quarantined`。都不提交 |
| 3 事务外裁定 | 以第 2 步的快照调用 `decide`。`decide` 按[命令表](../session-contract/SPEC.md#命令表)组合领域服务与守卫 | 快照与命令参数 | 拒绝结局，或「允许」与本命令需要的材料种类 | 拒绝结局原样返回，不提交。允许时丢弃这一次产出的批次，不交给第 5 步 |
| 4 收材料 | 按命令向身份桥、证据桥、Context 输入或空闲输入要 `GuardCommand`。`GuardCommand.participant` 标识材料的拥有者，不是存储参加者的名字（[身份桥、证据桥与 Context 输入](../session-contract/SPEC.md#身份桥证据桥与-context-输入)） | `SessionCommand` | 完整的材料集合 | 桥返回失败时按端口表返回 `unavailable`，`owner` 为该桥；缺一项材料不提交 |
| 5 提交 | 调用 `SessionTransactionPort.commit`，交 `SessionCommand` 与材料。材料随命令交给存储参加者，不各自成为存储参加者。存储参加者在同一事务里调用 `decide` 取得条目批次，再写条目、操作回执、治理变更、派生索引与消费游标。带 `expected` 的命令由 `decide` 在事务内核对 `expected`；其余命令由 `decide` 按事务内的当前状态重新裁定。批次内容（例如冻结的会话里 Run 终态同批的 SE38，见 [I-F4](../session-contract/SPEC.md#i-f4)）全部来自 `decide` | 命令与材料 | `CommitReceipt` | `changed`（只有带 `expected` 的七种命令会得到，尾部已变）：回到第 1 步，重读快照，用同一操作身份重做，存储参加者为重做开新的尝试代次（[尝试代次](../session-storage-sql/SPEC.md#w1-attempts)）。第 3 步在新快照上重算拒绝原因。重做上限为策略 `command.retriesOnChanged`，超过后把 `changed` 交给调用方。材料缺席、版本不符或来源无权：提交被拒绝，按[SessionTransactionPort](../session-contract/SPEC.md#sessiontransactionport)返回，不重做。`commit-unknown`：原样返回，不改写，不换身份。`attempt-rejected` 只出现在原操作查询里，说明该次尝试未生效，原操作可用同一身份重试（[SL09](../session-contract/SPEC.md#日志提交与查询结果)） |
| 6 通知 | 提交确认耐久之后，现取 `SessionNotifier` 并调用 `committed`，载荷为租户、会话、回执的 `revision`、`source` 与本次事件种类集合 | 回执 | 无 | 通知缺席或失败只记诊断，不回滚，不改回执（[EC-11](../session-contract/SPEC.md#ec-11)） |

只有七种命令带 `expected`，做乐观并发核对：`reload`、`release`、`finishRun`、`recordIdle`、`bindExternalCall`、`completeExternalConsumption` 与 `commitDerived(context-reminder)`。对它们，第 2 步与第 5 步的一致性由存储提供者保证：事务内的 `decide` 发现 `expected` 不等于尾部时得到 `changed`。尾部与 `expected` 一致时，事务内的 `decide` 与第 3 步读同一快照与同一参数。`decide` 是纯函数，所以两次结局相同。

其余命令不带 `expected`。事务内的 `decide` 以存储参加者读到的当前状态重新裁定，结局可能与第 3 步不同，以事务内的结局为准，不产生 `changed`。第 3 步只用来提前得到拒绝原因与决定收哪些材料，材料集合按命令种类固定，所以状态变化不会让收到的材料失配。

因此第 2 步可以从[快照缓存](#ca-3)读取。错误的快照对带 `expected` 的命令只导致一次 `changed` 重做，对其余命令只影响事务外的预判，都不导致错误提交。第 1 步的点查不走快照缓存。重做沿用同一 `SessionOperationId`。Session 操作的输入摘要不含认证封套与 `expected`，材料只计拥有者与身份（[尝试代次](../session-storage-sql/SPEC.md#w1-attempts)），所以重做与同一意图的重试认回原回执或继续提交，不得到 `conflict`。

<a id="cp-02"></a>

#### CP-02 Session 为参加者的命令

`recordMessage`、`commitDerived(compaction)`、`preserveResult` 与 `completeConsumption` 的参加分支由执行记录提供者发起提交（[JC-06、JC-09、JC-11、JC-12](../session-contract/SPEC.md#共同提交与共享事务域)）。Session 的参加者在提交方的事务里运行 CP-01 的第 1 至第 4 步，第 5 步改为在同一事务里执行自己的事实语句，不调用 `commit`。

| CP-01 的步 | 参加时的差别 |
| --- | --- |
| 1 | 身份要素为 execution、提交方的操作身份与提交种类（[OP-00](../session-contract/SPEC.md#op-00)）。`recovered` 时参加者响应「参加」并返回原回执，不写第二份 |
| 2 | 在提交方的事务里读快照。`expected` 由事务本身保证，不另核对 |
| 3 | 存储参加者在提交方的事务里调用 `decide`。拒绝结局映射为「冲突」，依据为结局本身；`archived` 映射为「冲突」，依据为 SE27。存储契约还没有参加者业务响应通道，所以「冲突」对提交方只表现为提交回滚，依据由提交方按原操作查询取得（[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)） |
| 4 | 材料是提交方交来的 `Participation` 与版本化载荷（[P-2](../session-contract/SPEC.md#具名前提与明确缺项)）。缺项或参加种类不符响应「不支持」；桥不可用响应「失败」 |
| 5 | 写 `decide` 产出的条目批次，更新 `ExecutionRef.revision` 与 `evidence`，不提交。提交方提交失败时两侧都不保存 |
| 6 | 提交方提交成功并回传确认后，本成员发出通知。提交方不回传确认时，本成员不发通知。通知的可靠性不是任何条款的前提（[EC-11](../session-contract/SPEC.md#ec-11)），工作由 S3 扫描补查 |

两个只读参加（[PA-01](../session-contract/SPEC.md#pa-01) 来源核对、[PA-02](../session-contract/SPEC.md#pa-02) 待交输入核对）只运行第 1 至第 3 步，不写条目，不更新 `ExecutionRef`。参加提交的结果未知由提交方按 [PA-05](../session-contract/SPEC.md#pa-05) 认回，本成员不把它们列入 `unresolved`。

<a id="cp-03"></a>

#### CP-03 读操作

`readWork`、`loadRecovery`、`readInput`、`queryOperation`、`inspectIdle`、`pending`、`references`、`releasedScopes` 与四个历史读操作（`begin`、`next`、`since`、`readModelView`）只做核权与读取。历史页的 `annotations` 由存储提供者的读路径随页给出（[SessionHistory](../session-contract/SPEC.md#sessionhistory)），本成员不另行拼接。它们不派生操作身份，不写条目，不发通知。`readWork` 可以经快照缓存回答，但必须先按 [CA-3](#ca-3) 核对有效性。`loadRecovery` 与 `queryOperation` 不走缓存。

### EX 受理流水线的拓展点编排

受理流水线（C1）把业务流程拓展点分成两组。拓展的语义归命令域与 hooks 的拥有者，本成员只定顺序与提交边界。这是具名前提，见系统页的[受理流水线与业务流程拓展点](../../../docs/architecture/runtime/session-and-run.md#受理流水线与业务流程拓展点)与[联合前提与具名待决](../../../docs/architecture/runtime/session-and-run.md#联合前提与具名待决)。拓展点的实现由这两方以插件接入 `session-adapters`，本成员只见一个有序的槽列表。

<a id="ex-1"></a>

| 编号 | 组 | 顺序 | 输入 | 输出 | 提交边界 |
| --- | --- | --- | --- | --- | --- |
| EX-1 | before-admit | 用途提醒 → 内容型斜杠命令展开 → 用户提示提交的 hook。每个槽依次运行，前一个槽的输出是后一个槽的输入 | 原提交、来源、会话当前值（三轴模式、用途、工作区选择）。当前值从快照读取 | 放行：可能已展开的内容、展开依据与各槽结论；拦截：原因与留痕材料 | 全组在 `accept` 提交之前运行，不在事务里。放行结论作为参加者材料进入 `accept`（[JC-03](../session-contract/SPEC.md#共同提交与共享事务域)）。拦截时 `accept` 以拦截结论为准入拒绝，只写 SE12，不保管正文；原因交回调用方。展开后的内容与原命令在同一批提交 |
| EX-2 | after-admit | 分流回执 → 推进条件触发 | `accept` 的回执与快照 | 回执交回调用方；提交通知唤醒 S1 | 全组在 `accept` 提交之后运行，不改已提交的内容。它不是第二次提交 |

- 失效命令由展开槽明确拒绝，`accept` 写 SE12。本成员不把失效命令降为普通消息。
- hooks 不可用时，按 hooks 拥有者的规则放行或拒绝。本成员只把该规则的结论作为材料记录，不自己决定。
- 槽列表本身取不到时，受理准入按不可用处理：需要经 before-admit 组的输入不受理，`accept` 返回 `unavailable`，`owner` 为受理槽，不写条目（[准入服务不可用走全拒承接](../../../docs/architecture/runtime/control-and-recovery.md#存储与关键服务降级)）。只有装配声明本部署没有命令域与 hooks 时，槽列表才是空列表，输入不经槽受理（[session-cordis 性质 8](../session-cordis/SPEC.md#唤醒调用方与扫描者)）。
- 同一原提交重复进入时，before-admit 组会再次运行，`accept` 按受理标识认回原回执。因此各槽必须没有外部副作用，或按原提交身份幂等。这一要求归槽的拥有者，本成员只在接入点说明。
- 卡片答复与业务输入不经 before-admit 组。它们的来源由证据桥核对（[JC-04](../session-contract/SPEC.md#共同提交与共享事务域)）。

### 协调器

协调器读到事实后决定发出哪些命令或出站调用。它们没有自己的状态；输入只有权威读、出站回执与调度器交来的会话身份。每个协调器写触发源、顺序、输入、产出、单写与失败分支。单写指同一会话同一时刻只有一个协调实例在动作（[SR-2](#sr-2)）。

<a id="c1"></a>

#### C1 受理流水线

| 项 | 内容 |
| --- | --- |
| 触发源 | 入站调用方以 `intake` 调用方类调用 `accept` |
| 顺序 | EX-1 → `accept`（CP-01）→ EX-2 |
| 输入 | `RoutedInput`、来源、受理标识与 `InputId`、快照里的会话当前值 |
| 产出 | 一次 `accept` 提交：普通输入写 SE10、SE11；卡片答复写 SE11、SE23，授权类另有 SE34；业务输入写 SE11；拒绝只写 SE12。回执交回调用方。提交通知唤醒 S1 |
| 单写 | 每会话串行。重复进入按受理标识认回 |
| 失败分支 | 拦截：返回原因，不保管正文。`routeInput` 为 `rejected`：返回 `archived`、`frozen` 或 `invalid`，冻结的拒绝只发生在没有未终结 Run 时（[I-F4](../session-contract/SPEC.md#i-f4)）。`commit-unknown`：原样交给调用方，调用方以同一受理标识重试或 `queryOperation`。存储或保管不可用：`unavailable` |

<a id="c2"></a>

#### C2 Agent 推进协调器

| 项 | 内容 |
| --- | --- |
| 触发源 | S1 的开 Run 决定；提交通知的事件种类含受理（SE11）且 Run 为 active；事件消费读到新的 Agent 事件页；C5 转来的恢复项；`startRun` 或 `reload` 返回 `frozen` 失败，且 `verdict` 非 null |
| 顺序：开 Run | `judgeRunStart` 为 `eligible` → `startRun`（JC-05）→ 以 OP-00 的出站身份 `invoke`（首条输入身份、SE13 回执、本 attempt 的 SE15 证据、SE13 所记的执行身份）→ 受理后 `receive(input-handover)` 写 SE35 → 对其余去处为本 Run、没有 SE35 的待处理输入按到达顺序逐个 `submit`，每个受理后 `receive` 写 SE35（[PM-02](../session-contract/SPEC.md#pm-02)） |
| 顺序：续入 | Run 为 active，`pending` 中出现去处为本 Run、没有 SE35 的输入 → 按到达顺序 `submit` → `receive` 写 SE35。待处理资格在读到 Agent 的承接事件（SE14）时解除，不在交入时解除 |
| 顺序：事件消费 | 按 [RD](#rd-事件派生读取) 读 Agent 事件并 `receive`，游标随条目保存后确认 |
| 顺序：恢复与接管 | 按 [PM-14](../session-contract/SPEC.md#pm-14) claim → resume，必要时接管；Tool 围栏由 Agent J03 的同日志 start-fence 条目在 Tool 排序域生效，不生成本域失效任务 |
| 顺序：换代 | 候选准备 → 可配合时 detach 后 release → reload → resume。旧 attempt 在本域失效，Tool 围栏仍归 Agent J03 |
| 顺序：冻结判定到达 | `startRun` 或 `reload` 返回 `frozen` 失败，按失败的 `verdict` 区分两种情形（[SessionWork](../session-contract/SPEC.md#sessionwork) 的 `startRun` 行）。`verdict` 非 null：候选采用带回了冻结判定，协调器以 session 与判定证据派生身份，带这个 `verdict` 调用 `freeze`（JC-28）。`verdict` 为 null：会话已冻结，不调用 `freeze`，不开 Run。判定在 `freeze` 提交之前只存在于这次失败结果里。两步之间崩溃时，下一次触发重新取候选材料，Tool 在采用点按耐久证据再次给出同一判定，`freeze` 认回或首次提交 |
| 输入 | 快照；`readInput` 取得的输入内容（在 `session-adapters` 侧）；出站回执；Agent 事件页 |
| 产出 | `startRun`、`claim`、`reload`、`release`、`finishRun`（PM-02 的准入拒绝）、`freeze`、`receive` 命令；`invoke`、`submit`、`resume`、`detach`、`query`、`inspect` 出站调用 |
| 单写 | 每 Run 一个协调实例。跨进程由 attempt 序号、`expected` 与执行记录提供者的条件提交围栏保护，不用锁 |
| 失败分支 | `startRun`：`run-active` 表示另一方已开，无害结束；`changed` 重新裁定；`frozen` 按上面的冻结行；`no-input`、`not-ready`、`login-required`、`archived`、`denied`、`invalid` 停止并记诊断，待处理输入保留。`invoke`：`denied` 表示本 attempt 已被取代，停止并交 C5；`busy` 等该 runtime 的终态事件后重试，退避按 `advance.retryDelaysMs`；`unavailable` 退避；`invalid` 按 [PM-02](../session-contract/SPEC.md#pm-02) 提交有界收束的 `finishRun`，同批写首条输入的 SE35 为拒收；`commit-unknown` 以同一出站身份 `query`。`submit`：`terminal` 按 [PA-03](../session-contract/SPEC.md#pa-03) 不重试、不改去处；`invalid` 按 [PA-09](../session-contract/SPEC.md#pa-09) 写 SE35 为拒收；`commit-unknown` 先 `query`。`claim`、`reload`、`resume`、`detach` 的失败按 [PM-05](../session-contract/SPEC.md#pm-05)、[PM-06](../session-contract/SPEC.md#pm-06)、[PM-09](../session-contract/SPEC.md#pm-09) 至 [PM-12](../session-contract/SPEC.md#pm-12)。`freeze`：`commit-unknown` 以同一身份 `queryOperation`，认回前不再触发开 Run。Agent 端口缺席：出站调用不发出，任务保留，由 S1 或 S3 重放 |

<a id="c3"></a>

#### C3 控制传播协调器

| 项 | 内容 |
| --- | --- |
| 触发源 | 控制提交后进度为 propagating；S5 重放；receive(control/execution) |
| 顺序 | 按 [PM-13](../session-contract/SPEC.md#pm-13) 经 AgentDrivePort.control 的长期入口送达原执行，不先取得挂接。接续收束与 J07 映射沿 [AD-14](../session-adapters/SPEC.md#ad-14)。原生产者确认或未知经 receive 保存。reconciled 只表示原控制的传播、生产者核对与原责任交接已对账，不以 Tool 围栏生效为条件 |
| 输入与产出 | 原控制操作、固定选择与待核对责任；control 出站及 receive 命令。没有本域 startFence 字段或失效调用 |
| 单写 | 同一控制 operation 重放认回；受理不等于实际停止 |
| 失败分支 | 不可用与未知保留责任，按原身份接续。超过上限仍 propagating 并报告。suspend 的恢复次序未决保持，不以本域提交证明 Tool 已阻止新发起 |

<a id="c4"></a>

#### C4 归档与级联协调器

| 项 | 内容 |
| --- | --- |
| 触发源 | `control(archive)` 或到期的 `considerAutoArchive` 提交成功；S6 重放；`receive(cascade)`、`receive(scope-release)` 的回执 |
| 顺序 | 归档提交（SE27，未终结 Run 同批 SE26 cancelled 与 SE16，`tasks.cascade` 与 `tasks.scope-release`）→ 交 C3 传播控制 → 对每个 `tasks.cascade` 以固定的 `childOperation`、`maintainer` 调用方类调用子会话的 `control(archive)` → 以 `tasks.scope-release` 的操作身份经 `ScopeReleasePort.release` 请执行环境释放作用域 → 子方回执与释放读回经 `receive` 写 SE25，按处置解除或保留任务 |
| 冻结 | 冻结独立于归档（[I-F5](../session-contract/SPEC.md#i-f5)）。冻结的会话照常手动归档与级联，也照常参加自动归档裁定：`judgeIdle` 不读 `frozen`，到期的冻结会话由 S2 交来的 `considerAutoArchive` 归档。归档提交同批取消未终结 Run，所以已归档的会话没有未终结 Run（[JC-16](../session-contract/SPEC.md#共同提交与共享事务域)）。`control(unarchive)` 后的生命周期按快照归约：未冻结回 `dormant`，已冻结回 `frozen`。撤销归档不撤销级联任务，不重新交入任何输入 |
| 输入 | `tasks.cascade`、`tasks.scope-release`、子方回执、释放读回 |
| 产出 | 子会话的 `control(archive)` 命令；`release` 出站调用；`receive` 命令 |
| 单写 | 每个子方一个固定 `childOperation`；每个作用域沿原任务的操作身份。重放幂等 |
| 失败分支 | 子方 `denied`：任务与原因保留，不伪装级联完成。子方 `commit-unknown`：任务为 `unknown`，以同一 `childOperation` 再次驱动，子方认回。释放读回按五类处置（[ScopeReleasePort](../session-contract/SPEC.md#scopereleaseport)）：只有 `released` 解除任务；`pending`、`unavailable`、`not-authorized` 保留；`unsupported` 记录并交人；`release` 未知或抛出时任务为 `unknown`，以同一操作身份重试。逻辑归档在提交时已经成立，不等物理全停。超过 `cascade.maxDrives`：任务保持未结并报告维护拥有者 |

<a id="c5"></a>

#### C5 恢复协调器

| 项 | 内容 |
| --- | --- |
| 触发源 | S3 扫描到的会话；进程启动；C2 或 C3 上报的失败；本协调器发起的保管提交成功；命令处理器交来的 `completeExternalConsumption` 回执；提交通知的事件种类含 SE20 或 SE21 |
| 顺序 | `loadRecovery` → 按 [PM-14](../session-contract/SPEC.md#pm-14) 的表逐类处理，每类先查后做：`unresolved` 交 S4；`tasks.initialization` 重新驱动负责方后 `completeInitialization`；`tasks.routed-input` 重投卡片或业务拥有者后 `receive`；`tasks.cascade`、`tasks.scope-release` 交 C4 或 C3；`controls` 为 `propagating` 交 C3；Run 的各行交 C2（重放 `invoke`、补交 `submit`、`release`、`claim` 后 `resume`、读结束事实写终态）；`consumptions` 中结果已报告而保管与完成都为空的，经 `recordResult(custody)` 参加保管，Agent 记录已删除时由 Session 提交 `preserveResult`；`release` 为 `pending` 且保管或完成非空的结果版本，按下一行恢复原确认 |
| <a id="c5-release"></a>原确认恢复 | 按 [JC-Release](../session-contract/SPEC.md#jc-release) 与 EC-04/05 读同一日志。Tool 原确认已存在时，由 AD-05 核对当前资格、租户、原 execution/Run、consumption 及完整结果版本后 receive(release)。确认未到保留 pending；Session 不代发解除。Model ACK 未决时扫描只报告、不执行动作 |
| 有界收束 | 读执行记录或接续持续返回原记录不可读或精确采用不可读，重试次数达到 `boundedRecovery.maxInspectAttempts` 后，按 [P-5](../session-contract/SPEC.md#具名前提与明确缺项) 提交 `finishRun`，终态为 failed。Agent 尚无该执行的记录、或执行已结束，都不是有界收束 |
| 冻结 | 冻结的会话里 `claim` 与 `resume` 照常（[I-F2](../session-contract/SPEC.md#i-f2)）。恢复不对冻结的会话触发 `startRun`，也不走 `reload`。快照为 `frozen`、没有 Run 而 `pending` 非空，不可能由日志归约得出：协调器报告存储缺陷，不清理，不开 Run |
| 输入 | 恢复快照；各拥有者的查询结果 |
| 产出 | 交给其他协调器的会话与项；本协调器直接发出的 `completeInitialization`、`receive`（含 `receive(release)`）、`finishRun`、`preserveResult` 命令与 `recordResult`、`inspect`、`query` 出站调用 |
| 单写 | 每会话一个恢复实例，由 S3 的每租户单扫描者与每会话串行队列保证 |
| 失败分支 | 任一拥有者 `unavailable`：保留该项，不把未知当失败，退避归 S3。`queryOperation` 为 `unknown`：保留在 `unresolved`。`inspect` 为 `missing` 且 `ExecutionRef.revision` 为空：按「已授予、尚未受理」重放 `invoke`；`revision` 非空：视为记录已按保留政策删除，保管改由 Session 单方提交（[AgentDrivePort](../session-contract/SPEC.md#agentdriveport)）。现行 Agent 适配不产生 `missing`，因为 Agent 的 `load` 不区分记录不存在与读取失败（[NP-05](../session-adapters/SPEC.md#np-05)）；这两个分支在该缺项闭合之前不会触发，「尚未受理」改由 `query` 的 `excluded` 判断。Tool 原确认不可读则 release 保持 pending；Model ACK 未决时只报告，不执行动作 |

### 调度器

调度器只决定什么时候再检查、检查哪个会话，检查结果交给协调器。每个调度器写触发源、看什么、交给谁、幂等、并发、停机与接续、可配置策略。策略字段见 [SchedulingPolicy](#schedulingpolicy)。

时钟被拒：`clock.waitUntil` 被拒绝（时钟端口缺席）时，调度器记录诊断，不把等待当作已到期，也不改用系统时间。S2 按 `idle.checkIntervalMs` 在下一条提交通知到达时重新尝试计时；S5、S6 保留重放项，在下一条提交通知或下一次成功的时钟等待时重新驱动；S3 的周期扫描在时钟恢复前不运行，启动扫描与失败上报照常触发。时钟缺席只延迟工作，不丢失工作：待办都在 `pending` 索引里，时钟恢复后的第一次周期扫描找回它们。

<a id="s1"></a>

#### S1 推进触发调度器

| 项 | 内容 |
| --- | --- |
| 触发源 | 提交通知，事件种类含 SE11、SE26、SE28、SE02 之一；S3 交来带 `inputs` 原因（待处理输入非空）的会话 |
| 看什么 | 通知的 `kinds` 含 `session.frozen`，或快照 `lifecycle` 为 `frozen` 且 Run 为 none：跳过，不调用 `judgeRunStart`，因为冻结的会话不开始新 Run（[I-F2](../session-contract/SPEC.md#i-f2)）。否则读快照，调用 `judgeRunStart`；Run 为 active 且有去处为本 Run、没有 SE35 的输入时，交 C2 续入 |
| 交给谁 | C2 |
| 幂等 | 同会话串行。`eligible` 但 `startRun` 返回 `run-active` 表示他人已开，无害。两个触发者按 OP-00 派生同一身份，一方提交，另一方认回 |
| 并发 | 每会话一个在途触发；新通知在在途触发完成后合并为一次重查，不排队多次 |
| 停机与接续 | 无状态。进程停止时丢弃待触发集合；重启后 S3 按 `inputs` 原因找回待处理输入非空的会话并交来。丢失的通知不丢失已受理的工作 |
| 可配置策略 | `advance.retryDelaysMs`：Agent 返回 `busy` 或 `unavailable` 时的退避序列 |

<a id="s2"></a>

#### S2 空闲与自动归档调度器

| 项 | 内容 |
| --- | --- |
| 触发源 | 时钟：`waitUntil(起点 + idleMs)`；提交通知：新工作、关系、调用或冻结使等待失效并重算；S3 交来带 `idle-armed` 原因的会话（自动归档已启用、未豁免、没有未终结 Run），本调度器为它重新计时 |
| 看什么 | `inspectIdle` → 观察非 `unknown` 时 `recordIdle` → `judgeIdle` → `due` 时 `considerAutoArchive`。Run 未终结时 `judgeIdle` 不得出 `due`（[I-R10](../session-contract/SPEC.md#i-r10)）。冻结不改变空闲计算：`judgeIdle` 不读 `frozen`，冻结的会话照常参加自动归档裁定（[I-F5](../session-contract/SPEC.md#i-f5)） |
| 交给谁 | `considerAutoArchive` 返回 `archived` 时交 C4 |
| 幂等 | `not-due`、`exempt`、`disabled` 不写条目。`recordIdle` 按观察摘要认回。`considerAutoArchive` 按 `idleEvidence` 认回 |
| 并发 | 每会话一个计时。`recordIdle` 返回 `changed` 时重算起点，不保留旧计时 |
| 停机与接续 | 计时随进程丢失。重启后 S3 按 `idle-armed` 原因找回会话，本调度器从快照里已确认的 SE31 起点续算，不重置起点。还没有 SE31 的会话照常 `inspectIdle` 取得观察并建立起点。是否到期仍由 `judgeIdle` 裁定，`idle-armed` 本身不表示到期。撤销归档建立新的起点 |
| 可配置策略 | `idle.checkIntervalMs`：没有时钟等待能力时的轮询间隔；`idle.clockToleranceMs`：时钟采样允许的偏差，超出视为观察 `unknown` |

<a id="s3"></a>

#### S3 恢复扫描调度器

| 项 | 内容 |
| --- | --- |
| 触发源 | 进程启动；周期到点；C2 或 C3 上报失败 |
| 看什么 | 按租户分页读 `pending(reason)`，游标稳定。启动扫描与周期扫描都读七个原因：`unresolved`、`controls`、`tasks`、`inputs`、`run`、`idle-armed`、`release`。启动扫描不带 `reason` 读并集，再按每个会话的原因分派；周期扫描按七个原因各读一遍。七个原因都只由快照决定，所以只有待处理输入、只有未终结 Run、或只启用了自动归档的会话也能被找回。租户来源是事务域目录，与 `references`、`releasedScopes` 用同一个目录（[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)）。目录缺席时，本调度器只扫描装配交入的租户集合，并向维护者报告目录缺口；其余租户要等它的下一次提交通知才被处理 |
| 交给谁 | `unresolved` 交 S4；`controls` 与 `tasks` 交 C5；`inputs` 交 S1，即 C1 受理之后的推进触发：S1 调用 `judgeRunStart` 开 Run，Run 为 active 时交 C2 续入；`run` 交 C5 恢复与 C2 的事件消费；`idle-armed` 交 S2 计时；`release` 交 C5 的[交付责任解除](#c5-release) |
| 幂等 | 读取不删除待办。待办只在相应命令成功后由归约解除。同一会话在一轮里只交一次 |
| 并发 | 每个租户同一时刻一个扫描者。第一版靠装配单实例兑现（[靠装配兑现的保证](../session-cordis-contract/docs/cordis.md#靠装配兑现的保证)）；多实例之前须先定义租约协议（[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)）。每会话退避独立计算 |
| 停机与接续 | 游标不持久。重启后从零开始扫描，重复交付由各命令的操作身份认回 |
| 可配置策略 | `recoveryScan.periodMs`；`recoveryScan.pageSize`；`recoveryScan.sessionBackoff`（初值、倍数、上限） |

<a id="s4"></a>

#### S4 待决认回调度器

| 项 | 内容 |
| --- | --- |
| 触发源 | 命令返回 `commit-unknown`；S3 交来 `unresolved` 非空的会话 |
| 看什么 | 对每个未知操作调用 `queryOperation` |
| 交给谁 | `committed`：把回执交原协调器继续后续效果；`not-committed`（原操作明确未提交）与 `attempt-rejected`（最近一次尝试被回滚，没有未知的尝试）：交原发起者决定是否以同一身份重试，重试由存储参加者开新的尝试代次（[尝试代次](../session-storage-sql/SPEC.md#w1-attempts)）；`unknown`：按间隔再查 |
| 幂等 | 同一操作身份重复查询无害。认回期间不以新身份重做，也不发出依赖该提交的外部动作（[PA-07](../session-contract/SPEC.md#pa-07)） |
| 并发 | 每个未知操作一个在途查询 |
| 停机与接续 | 重试计数在内存。重启后 S3 按 `unresolved` 原因找回会话，各次尝试的结局由存储提供者按代次保存的回执给出，计数从零开始 |
| 可配置策略 | `pendingResolution.retryIntervalMs`；`pendingResolution.maxAttempts`：超过后保持 `unresolved` 并报告维护者，不清理任何提交 |

<a id="s5"></a>

#### S5 控制重放调度器

| 项 | 内容 |
| --- | --- |
| 触发源 | 时钟间隔；`receive(control)` 之后进度仍为 `propagating` |
| 看什么 | 快照 `controls` 中 `state` 为 `propagating` 的项及其 `pending` |
| 交给谁 | C3 |
| 幂等 | 同一控制操作身份重放幂等。生产者按原控制操作认回 |
| 并发 | 每个控制操作一个在途重放 |
| 停机与接续 | 重放计数在内存。重启后由 S3 以 `controls` 原因找回，计数从零开始；上限因此是每个进程寿命内的上限 |
| 可配置策略 | `controlReplay.intervalMs`；`controlReplay.maxReplays`：超过后停在 `propagating` 并报告 |

<a id="s6"></a>

#### S6 级联推进调度器

| 项 | 内容 |
| --- | --- |
| 触发源 | 时钟间隔；`receive(cascade)`、`receive(scope-release)` 之后任务仍保留 |
| 看什么 | 快照 `tasks` 中 `pending` 或 `unknown` 的级联与作用域释放任务 |
| 交给谁 | 级联与作用域释放交 C4 |
| 幂等 | 固定 `childOperation`；作用域释放沿原任务的操作身份 |
| 并发 | 每个任务一个在途驱动 |
| 停机与接续 | 驱动计数在内存。重启后由 S3 以 `tasks` 原因找回 |
| 可配置策略 | `cascade.intervalMs`；`cascade.maxDrives`：超过后任务保持未结并报告维护拥有者 |

<a id="s7"></a>

#### S7 预求值与预热调度器

| 项 | 内容 |
| --- | --- |
| 触发源 | 资产、工作区或设置拥有者发出的变化通知，携带作用域变更计数 |
| 看什么 | 本会话当前采用依据（最近一条 SE08 的输入快照）记录的各类计数与通知的计数比对。任一计数变化：对尚未提交的 `startRun` 命令调用证据桥 `prepare` 预求值，结果由装配协调者按计数缓存，本调度器不持有候选缓存（[比对代替求值](../../../docs/architecture/runtime/assembly-and-change.md#比对代替求值)）。采用会变且 [P-7](../session-contract/SPEC.md#具名前提与明确缺项) 已闭合：经 `AgentDrivePort.prewarm` 请 Agent 宿主按新采用预建空闲实例 |
| 交给谁 | 装配协调者；P-7 闭合后交 Agent 宿主。入口（`startRun`、`reload`）直接采用已校验候选，本调度器不写任何条目 |
| 幂等 | 已校验候选的缓存键是全部计数，同键幂等；计数再变即失效。缓存归装配协调者 |
| 并发 | `preEvaluation.concurrency` 限制同时预求值的会话数。同会话新的变化通知取消在途预求值并重新开始 |
| 停机与接续 | 候选缓存可丢。重启后下一次变化通知或入口重新求值 |
| 可配置策略 | `preEvaluation.concurrency`；`preEvaluation.prewarm`：是否调用 `prewarm`，P-7 闭合前恒为假 |

<a id="sr-1"></a>

#### SR 三条共同规则

| 编号 | 规则 | 本成员怎样兑现 |
| --- | --- | --- |
| SR-1 | 调度器不写日志 | 调度器只调用读操作与协调器。写日志的只有命令处理器 |
| <a id="sr-2"></a>SR-2 | 每个会话同一时刻只有一个协调实例在动作 | 进程内：每会话一个串行队列，协调器的动作按会话排队。跨进程：第一道是 S3 的每租户单扫描者，第二道是操作幂等、`expected` 核对与执行记录提供者的条件提交围栏，不是锁 |
| SR-3 | 所有间隔、上限和退避都是策略对象的配置初值 | 全部字段在 `SchedulingPolicy`，由工厂配置传入；实现可以替换策略对象。默认值不散在代码里 |

<a id="schedulingpolicy"></a>

#### SchedulingPolicy

`SchedulingPolicy` 是本成员工厂配置的一部分，形状归本成员的[构造入口](docs/public-api.md)。下表的初值是配置初值，不是契约承诺；实际值由装配决定，验证计划实测后可以改。

| 字段 | 覆盖 | 含义 | 配置初值 |
| --- | --- | --- | --- |
| `command.retriesOnChanged` | CP-01 | 存储层返回 `changed` 时流水线重做的次数上限 | 3 |
| `advance.retryDelaysMs` | S1、C2 | Agent 返回 `busy` 或 `unavailable` 时的退避序列，用尽后交 S3 | `[1000, 5000, 30000]` |
| `idle.checkIntervalMs` | S2 | 没有时钟等待能力时的轮询间隔 | 60000 |
| `idle.clockToleranceMs` | S2 | 时钟采样允许的偏差 | 5000 |
| `recoveryScan.periodMs` | S3 | 周期扫描间隔 | 30000 |
| `recoveryScan.pageSize` | S3 | 每页会话数 | 100 |
| `recoveryScan.sessionBackoff` | S3、C5 | 每会话退避：`initialMs`、`multiplier`、`maxMs` | 5000、2、300000 |
| `pendingResolution.retryIntervalMs` | S4 | 未知操作的查询间隔 | 5000 |
| `pendingResolution.maxAttempts` | S4 | 查询次数上限，超过后保持未结并报告 | 60 |
| `controlReplay.intervalMs` | S5 | 控制重放间隔 | 10000 |
| `controlReplay.maxReplays` | S5、C3 | 重放次数上限 | 30 |
| `cascade.intervalMs` | S6 | 级联与作用域释放任务的驱动间隔 | 10000 |
| `cascade.maxDrives` | S6、C4 | 驱动次数上限 | 30 |
| `preEvaluation.concurrency` | S7 | 同时预求值的会话数 | 2 |
| `preEvaluation.prewarm` | S7 | 是否调用 `prewarm`；P-7 闭合前恒为假 | `false` |
| `boundedRecovery.maxInspectAttempts` | C5 | 有界恢复者读执行记录或接续的重试上限（[P-5](../session-contract/SPEC.md#具名前提与明确缺项)） | 10 |
| `boundedRecovery.retryIntervalMs` | C5 | 有界恢复者两次重试的间隔 | 30000 |
| `cache.entryBudgetBytes` | CA-1 | 条目缓存的字节预算 | 67108864 |
| `cache.snapshotSessions` | CA-3 | 快照缓存保留的会话数 | 1024 |

### RD 事件派生读取

承接（SE14）、调用登记（SE18）、等待与出卡（SE22）、控制阶段（SE25）与执行结束（SE26、SE16）从 Agent 的事件流派生（[Session 与 Agent 的两条通道](../session-contract/SPEC.md#session-与-agent-的两条通道)、[EC-01](../session-contract/SPEC.md#ec-01)）。读取 Agent 输出与向 Agent 确认的调用在 `session-adapters`；本节规定游标、去重、写什么与何时确认，由本成员提供的事件消费处理器执行。

<a id="rd-01"></a>

| 编号 | 机制 | 规则 |
| --- | --- | --- |
| RD-01 | 游标 | 每个执行一个消费游标 `ExecutionRef.readThrough`。持久规则归 [EC-02](../session-contract/SPEC.md#ec-02)：游标与它所产生的条目在同一次提交中保存；不产生条目的事件不单独提交，持久游标随下一次产生条目的 `receive` 前进。本成员这样执行：读取从 `readWork` 得到的 `readThrough` 之后开始；每次 `receive` 把 `readThrough` 设为本事件的序号；`message` 与 `entry` 事件只推进内存游标。一页以不产生条目的事件结束时，持久游标停在最后一个产生条目的事件。`ended` 总产生条目，所以 Run 结束时游标总能追上 |
| RD-02 | 去重 | 每个产生条目的事件按 OP-00 从 execution 与序号派生 `receive` 的身份。重放时 `resolveOperation` 认回，不重复写入。同一事件内容在边界上重复到达时按身份认回；不同内容同身份返回 `conflict`，消费者停止该执行的读取并报告 |
| RD-03 | 确认 | 按 [EC-02](../session-contract/SPEC.md#ec-02)，向 Agent 确认的前缀不超过持久的 `readThrough`。本成员确认的前缀等于已持久的 `readThrough`，不是内存游标。确认在 `receive` 提交成功后发出；确认结果未知时以同一前缀重试，确认单调。Agent 为未确认事件保留多少，上界由 Agent 的保留政策决定，Session 只在提交后才确认（[Agent 的确认](../../agent/agent-contract/SPEC.md#确认)、[读取、游标与缺口](../../agent/agent-contract/SPEC.md#读取游标与缺口)）。未确认的 `message` 与 `entry` 事件因此要在 Agent 一侧多留一段，这是本规则的代价。落后超出 Agent 的保留窗口时，读取返回缺口，按 RD-05 处理 |
| RD-04 | 未读计入未结工作 | `openWork.unreadEvents` 列出每个未终结 Run 的执行与持久 `readThrough`。该序号之后的事件，不论是否已经读到内存，都计入未结工作（[EC-03](../session-contract/SPEC.md#ec-03)）。因此空闲与完成的裁定只信持久游标 |
| RD-05 | 缺口 | 读取返回缺口时，消费者经 `inspect` 读完整快照，按 [PM-14](../session-contract/SPEC.md#pm-14) 对账：结束状态按 `ended` 处理，结果与控制按 `producer` 与 `control` 处理，再从缺口之后继续，不跳过。权威日志自身缺批时按 [SL14](../session-contract/SPEC.md#日志读取投影及恢复) 隔离该会话 |
| RD-06 | 顺序与并发 | 每个执行一个消费者实例，事件按序号顺序处理。另一个进程的消费者并发读同一执行时，两者对同一事件派生同一个 `receive` 身份，输入摘要也相同。先到者提交，后到者认回原回执，得到 `recovered`，不是 `conflict`。先到者仍在途时，后到者得到 `commit-unknown`，由 S4 认回。后到者随后重读 `readThrough` 继续。`receive` 不带 `expected`，不产生 `changed`。游标不回退：序号不大于快照当前 `readThrough` 的事件按身份认回（[W5](../session-storage-sql/SPEC.md#w5)） |
| RD-07 | 修订与证据 | 事件带来的修订与回执写入 `ExecutionRef.revision` 与 `evidence`；参加提交也更新它们。两条通道到达的先后不固定，本成员不以 `revision` 拒绝任何一方（[PA-04](../session-contract/SPEC.md#pa-04)） |

### CA 缓存

三层缓存只淘汰，不失效。前两层的键即内容；第三层靠一次廉价核对。多进程下不需要缓存一致性协议，也不依赖失效通知保证正确。

| 编号 | 层 | 键 | 值 | 有效性 | 淘汰 | 多进程下的核对 | 持有者 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a id="ca-1"></a>CA-1 | 条目缓存 | `(tenant, session, position)` | 解码后的条目，含内联载荷 | 永远有效。已提交条目不可变。只缓存从已确认提交前缀读到的条目；未提交候选没有对外位置，不进缓存 | 按字节 LRU，预算 `cache.entryBudgetBytes` | 不需要。键即内容，命中不可能过期 | 本成员 |
| <a id="ca-2"></a>CA-2 | 视图前缀摘要缓存 | `(tenant, session, epoch, seq)` | 模型视图在该位置的前缀摘要 | 永远有效。一代模型视图物化后不改；压缩开新一代，旧键自然不再被读 | 按条数 LRU | 不需要。读者以「代已变」的读取结果发现新代，不靠失效 | `session-adapters` 的历史源插件，按本规则实现 |
| <a id="ca-3"></a>CA-3 | 快照缓存 | `(tenant, session)` | `WorkSnapshot` 与它的 `revision` | 仅当 `revision` 等于权威尾部的修订。每次权威使用前经事务端口做一次尾部点查比对；提交通知带来的 `revision` 大于缓存值时直接丢弃缓存，通知不能使缓存变为有效。修订是十进制文本，按数值比较：先比长度，长度相同再比字典序 | 每会话单槽替换；会话数上限 `cache.snapshotSessions`，按 LRU 淘汰会话 | 每个进程各自点查比对。带 `expected` 的命令由事务内的 `expected` 核对兜底：过期快照只导致一次 `changed` 重做。其余命令由事务内的 `decide` 按当前状态重新裁定。两类都不导致错误提交 | 本成员 |

`SessionId` 只在租户内唯一，一个服务实例服务全部租户，所以三层缓存的键都带租户。缓存不是核权点：

- CA-3 命中之前的尾部点查经事务端口，按调用身份核权。这一步就是 CA-3 的核权点，核权失败时返回 `denied` 或 `invalid`，不使用缓存。
- CA-1 命中只省去载荷读取。分页、逐条披露核对与条目位置仍由事务端口的历史读取完成，缓存只按条目身份为已核权页提供载荷。
- CA-2 命中同样不代替 `readModelView` 的核权（[session-adapters](../session-adapters/SPEC.md)）。

- 治理读取要追到裁定位置，所以 `loadRecovery`、`queryOperation` 与流水线第 1 步的点查不走缓存。展示类读取可以返回有进度的旧视图，但要带上它的 `revision`。
- 已校验装配候选的缓存归装配协调者，不在本表（[S7](#s7)）。
- 缓存淘汰与进程重启不影响任何保证。全部缓存可丢，丢失后下一次读取从存储重建。

条目缓存、快照缓存与预求值名额（`preEvaluation.concurrency`）不按租户分额。这是已知的性能偏离：一个租户的负载可以挤占其他租户的缓存命中与提前求值，使它们的读取回到存储、新 Run 失去提前求值。它只影响时延，不影响正确性。租户间的公平归本成员的调度，按租户分开串行区与名额。已知限制：本成员没有这项规则与配置字段，不声称租户间公平。

## 资源与替换

- 本成员经工厂参数取得全部外部能力，不导入 Cordis。按[契约端口表](../session-contract/SPEC.md#构造依赖端口与出站端口)，当前访问检查、事务端口与内部主体为必需依赖，任一缺席不构造实例；Cordis 下 PENDING。其他端口按需要返回 unavailable 或保留任务。访问检查及工厂仍未实现，本文不证明已运行。
- 业务身份是操作输入。租户与会话不从装配树推导，不以 Context 或插件配置替代。
- 调度器可以整体替换为外部工作流引擎，只要它仍只产生带同一操作身份的命令，并遵守 SR-1 至 SR-3。协调器与命令处理器不可替换，它们是本成员的机制本体。
- 策略对象可以替换。替换只改变间隔、上限与退避，不改变任何命令的结局集合。
- 停止顺序：先停止调度器接受新的触发；在途命令跑完或返回未知；协调器在当前命令结束后停止；最后释放时钟等待与缓存。停止不回滚已提交的事实，不补发未发出的出站调用，不发通知。未发出的出站调用由重启后的 S3 找回并重放。
- 替换提供者或重启进程不重置条目身份、提交位置或 `readThrough`。恢复出的分支无法证明原前缀连续时，原检查点与游标不可继续采用，沿[投影与恢复算法](docs/architecture/mechanisms.md#投影与恢复算法)。
- 释放本成员持有的资源不取消任何 Model、Tool、Agent 执行或子会话。外部效果不因 disposer 运行而变得可撤回。依赖丢失不能报告为业务成功。

## 验证

当前入口测试只检查根入口为空。下列义务是后继实现必须通过的可观察结果，不是已经执行的测试。契约的 [VC 表](../session-contract/SPEC.md#候选的持续验证义务)继续适用；本节只列机制自有的义务与崩溃矩阵。故障场景的前置、注入与期望观察在 [docs/fault-scenarios.md](docs/fault-scenarios.md)。

### VM 机制的持续验证义务

| 编号 | 场景 | 必须观察的结果 | 条款 |
| --- | --- | --- | --- |
| VM-01 | 每个变更命令走完流水线六步；带 `expected` 的七种命令在第 5 步返回 `changed`；不带 `expected` 的命令在第 3 步之后状态被并发改变 | `changed` 时重做从第 1 步开始，沿用同一操作身份，不得到 `conflict`；重做次数不超过 `command.retriesOnChanged`；超过后调用方收到 `changed`，没有提交。不带 `expected` 的命令从不得到 `changed`，结局按事务内的当前状态裁定 | [CP-01](#cp-01) |
| VM-02 | 参加命令在提交方事务里运行；提交方回滚 | Session 一侧没有条目，`ExecutionRef` 不变；参加者四种响应与结局一一对应 | [CP-02](#cp-02) |
| VM-03 | before-admit 槽拦截、放行与展开；同一原提交重复进入 | 拦截只写 SE12，不保管正文；展开内容与原命令同批；重复进入认回原回执 | [EX-1](#ex-1)、[C1](#c1) |
| VM-04 | 每个协调器在每个失败分支上的动作 | 与各协调器表的「失败分支」一致；没有一个分支把未知改写为成功或失败 | [C1](#c1) 至 [C5](#c5) |
| VM-05 | 每个调度器的触发、幂等、并发与停机接续 | 重复触发无重复效果；每会话一个在途实例；重启后由 S3 按七个原因找回全部待办，包括只有待处理输入、只有未终结 Run、只启用了自动归档的会话；事务域目录缺席时只扫描装配交入的租户并报告缺口；调度器从不写日志 | [S1](#s1) 至 [S7](#s7)、[SR](#sr-1) |
| VM-06 | `SchedulingPolicy` 每个字段替换为另一个值 | 只有间隔、上限与退避变化；结局集合不变 | [SchedulingPolicy](#schedulingpolicy) |
| VM-07 | 事件页以不产生条目的事件结束；游标丢失；两个消费者并发 | 持久游标停在最后一个产生条目的事件；确认不超过持久游标；重读认回；落后者认回原回执，得到 `recovered` 或 `commit-unknown`，从不得到 `changed` 或 `conflict` | [RD-01](#rd-01) 至 RD-07 |
| VM-08 | 三层缓存：命中、淘汰、过期快照、提交通知晚到；两个租户有同名会话与同值修订 | 条目与前缀摘要命中永不过期；过期快照对带 `expected` 的命令只导致一次 `changed`，对其余命令不改变事务内结局；通知不能使缓存变为有效；一个租户读不到另一个租户的缓存项；命中不跳过核权；全部缓存清空后结果不变 | [CA-1](#ca-1) 至 [CA-3](#ca-3) |
| VM-09 | `startRun` 或 `reload` 返回 `frozen`：一次 `verdict` 非 null，两步之间崩溃；另一次 `verdict` 为 null | `verdict` 非 null 时 `freeze` 恰提交一次；`verdict` 为 null 时不调用 `freeze`；崩溃后下一次触发再次取得判定并认回；S1 跳过冻结且没有 Run 的会话；冻结的会话里 Run 终态同批写 SE38 | [C2](#c2)、[S1](#s1)、[I-F1](../session-contract/SPEC.md#i-f1) 至 [I-F5](../session-contract/SPEC.md#i-f5) |
| VM-10 | 崩溃矩阵的每个提交点，崩溃在提交前与提交后各一次 | 与 [CR](#cr-崩溃矩阵) 表一致；没有第二个执行、第二份输入、第二个 attempt 或第二个终态 | [CR](#cr-崩溃矩阵) |
| VM-11 | 停止顺序与重启 | 在途命令跑完或返回未知；没有出站调用在停止期间发出；重启后未发出的调用被重放，回执认回 | [资源与替换](#资源与替换) |
| VM-12 | 已保管或处理而原确认未投影；重启与答复丢失 | Tool 原确认从日志认回，核版本后 receive(release)；无确认保持 pending。Model ACK 未决时只报告，不直接调用生产者 | [C5](#c5-release)、[JC-Release](../session-contract/SPEC.md#jc-release) |

### CR 崩溃矩阵

每行是一个提交点。「提交后」指提交已确认耐久、后续动作尚未发生。每行写崩溃后谁发现、怎样恢复、不得发生什么。全部提交点的原则相同：提交前崩溃等于没有发生，重试用同一身份；提交后崩溃由权威读发现，重放用同一身份认回。Model 与 Tool 的流内容由生产者保管，Session 不重放流片段（[崩溃后的恢复](../../../docs/architecture/runtime/streaming-and-consumption.md#崩溃后的恢复)）。

| 编号 | 提交点 | 提交前崩溃 | 提交后、后续动作前崩溃 | 谁发现 | 恢复动作 | 不得发生 |
| --- | --- | --- | --- | --- | --- | --- |
| CR-01 | `create`、`completeInitialization` | 没有会话或没有该项结果 | 通知丢失 | 调用方以同一提交身份重试；S3 以 `tasks` 找回未完成的初始化项 | 认回原回执；C5 重新驱动负责方 | 第二个会话身份；用空值冒充初始化完成 |
| CR-02 | `accept` | 没有受理 | SE10、SE11 已在，S1 未被唤醒 | 调用方 `queryOperation`；S3 以 `inputs` 原因找回，交 S1 | 认回原回执；S1 调用 `judgeRunStart` | 第二份输入；未知期间报告未受理 |
| CR-03 | `startRun` | 没有 Run | SE13、SE15 已在，`invoke` 未发出 | S3 以 `run` 原因找回，交 C5；C5 读到 `run.active`、`advance` 非空、首条输入没有 SE35 | 查 `invoke` 的出站身份；未提交则以同一身份重放（[PA-06](../session-contract/SPEC.md#pa-06) 第 2 项） | 第二个执行身份；重选首条输入 |
| CR-04 | `invoke`（Agent 提交，Session 只读参加） | Agent 没有执行 | Agent 已受理，SE35 未写 | 同 CR-03 | `query` 为 `committed` 时 `receive` 写 SE35，再交入其余输入 | 第二次 `invoke` 用新身份 |
| CR-05 | `submit` 与它的 `receive(input-handover)` | 该输入未交入 | Agent 已受理，SE35 未写 | C5 读到待交输入 | 查 `submit` 的出站身份；按结果写 SE35 或重放（[PA-06](../session-contract/SPEC.md#pa-06) 第 3 项） | 重选批界；重复受理同一 `InputId` |
| CR-06 | `receive(agent-event)` 与游标 | 条目与游标都不在 | 条目与游标已在，确认未发 | S3 以 `run` 原因找回；事件消费从持久 `readThrough` 重读 | 重放认回；重新确认同一前缀 | 重复写入；确认超过持久游标 |
| CR-07 | 参加的 `recordMessage`、`commitDerived(compaction)`、`preserveResult`、`completeConsumption` | 两侧都没有 | 两侧都有，回执丢失 | 提交方按 [PA-05](../session-contract/SPEC.md#pa-05) 查询 | 双方读同一回执 | Session 单独保存一半；Session 把它列入 `unresolved` |
| CR-08 | 保管或处理提交后，原确认未投影 | 参加提交按 CR-07 | Tool 确认已在日志或尚未到达，release 为 pending | S3 按 release 原因找回 | AD-05 核原日志确认后 receive(release)；Model ACK 未决时只报告 | 代发解除、重复执行、凭 saved 写 confirmed |
| CR-09 | receive(release) | Tool 原确认已在日志，Session SE19 未写 | SE19 confirmed 已写 | 同 CR-08 | AD-05 重读同日志原确认，核原版本后以原 operation 提交或认回；Model ACK 未决时 pending | 直接重发生产者解除，或把 saved 当确认 |
| CR-10 | `claim` | 没有新 attempt | SE15 已在，`resume` 未发 | S3 以 `run` 原因找回，交 C5；C5 读到 `advance` 非空而执行记录显示没有 active 挂接 | 能出示该 attempt SE15 证据者继续 `resume`（[PM-07](../session-contract/SPEC.md#pm-07)）；回执丢失时 `queryOperation`，`unknown` 时不第二次 `claim`（[PM-10](../session-contract/SPEC.md#pm-10)） | 序号跳号或回填；第二个 attempt |
| CR-11 | `resume`（Agent 提交，Session 只读参加） | 没有挂接 | 挂接已授予，Session 没有要写的事实 | C5 读执行记录 | 挂接 active 时等 Agent，读事件；Tool 围栏由 Agent J03 原日志在 Tool 排序域生效 | 再次 `claim` |
| CR-12 | `detach` 后 `release` | 挂接仍 active 或已交还，SE16 未写 | SE16 已在，授予阶段未开始 | C5 读到挂接已交还或已被取代 | 认回或提交 `release`，进入授予阶段（[PM-14](../session-contract/SPEC.md#pm-14)） | 重发原调用 |
| CR-13 | `reload` | 原采用与原 attempt 保持 | SE08、SE15、SE16 已在，`resume` 未发 | 同 CR-10 | 以同一 attempt 的推进资格依据接续；`changed` 时重取交接证明，不第二次 `reload`（[PM-06](../session-contract/SPEC.md#pm-06)） | 序号无界增长 |
| CR-14 | `control`、`interrupt` | 没有控制 | SE24、SE25 已在，传播未发 | S3 以 `controls` 找回 `propagating` | C3 经长期控制入口传播；生产者按原控制操作认回 | 终态改变；冒充已停 |
| CR-15 | Tool 失效已生效而 Agent 尚未保存 start-fence | 本域撤销已成立 | Agent 尚无原失效证据的日志记录 | 沿 Agent J03 的原操作和原守卫认回；record 的特定失败仍属 #502 未决项 | 不创建 Session 围栏任务，不阻塞本域已满足条件的控制对账 | 由本域撤销或控制受理声称围栏已生效 |
| CR-16 | `finishRun`（有界收束，含 PM-02 的准入拒绝） | Run 仍 active | SE26、SE16 已在 | 调用方 `queryOperation` | 认回 | 第二个终态；把 Agent 的结论改写为失败 |
| CR-17 | `control(archive)`、到期的 `considerAutoArchive` | 没有归档 | SE27 与任务已在，级联与释放未发 | S3 以 `tasks` 找回 | C4 按固定 `childOperation` 与任务身份驱动 | 等物理全停才承认归档；撤销归档撤销级联 |
| CR-18 | 子会话的 `control(archive)` 与 `receive(cascade)` | 子方未归档 | 子方已归档，SE25 未写 | S6 读到任务 `pending` 或 `unknown` | 以同一 `childOperation` 再次驱动；子方认回；写 SE25 | 子方第二个归档操作 |
| CR-19 | `ScopeReleasePort.release` 与 `receive(scope-release)` | 任务 `pending` | 执行环境已释放，SE25 未写 | S6 读到任务 | 以同一操作身份重试；执行环境重复释放认回；按处置写 SE25 | 用会话用户身份重试；冒充已释放 |
| CR-20 | `recordIdle`、`considerAutoArchive`（未到期） | 没有 SE31 | SE31 已在，计时丢失 | S3 以 `idle-armed` 原因找回，交 S2；S2 从 SE31 起点续算 | 续算，不重置 | 重置起点；一次快照冒充连续空闲 |
| CR-21 | `freeze` | 没有冻结。第一条路径：`startRun` 已返回 `frozen`，判定只在该失败的 `verdict` 里 | SE37（与 SE38）已在，通知丢失 | 第一条路径：下一次 S1 触发重新取候选材料，Tool 再次给出同一判定；第二条路径：Tool 宿主协调者重试 | `freeze` 首次提交或认回原回执；S1 读到 `frozen` 后跳过 | 第二条 SE37；冻结取消未终结 Run；待处理输入既无去处又无 SE38 |
| CR-22 | `change`、`setRelation`、`configureAutoArchive`、`commitDerived(context-reminder)` | 没有变更 | 条目已在，通知或消费者未更新 | 调用方以同一提交身份或变化材料身份重试 | 认回原回执；作用域持有者在下一次拉取补齐 | 未知期间作用域持有者先使注册生效 |
| CR-23 | `bindExternalCall`、`completeExternalConsumption` | 没有登记或完成 | 条目已在 | 调用方 `queryOperation` | 认回 | 把 Run 内调用改登记为 Run 外调用 |
| CR-24 | 提交通知 | 不适用 | 通知未发或丢失 | S3 周期扫描，按七个原因读 `pending` | 按权威读补查；每个原因只由快照决定，所以通知要唤醒的工作都在某个原因之下。前提是 S3 能枚举该租户：事务域目录缺席时，租户要等它的下一条通知 | 通知丢失导致工作丢失 |

### 明确缺项

下列内容尚需实测，本文不以伪代码复杂度替代证据：

- 规模：超长会话的恢复快照读取、事件消费吞吐与分页读取的实际尺度，按验证计划实测后写进存储提供者的声明边界。
- 断电耐久：已确认提交在操作系统崩溃与断电下的耐久依赖存储提供者声明的部署与介质条件（[已确认保存的耐久边界](../../../docs/architecture/data-and-state.md#已确认保存的耐久边界)）。
- 并发：两个进程对同一会话的协调器并发、每租户多扫描者，都要在租约协议定义之后实测。第一版靠装配单实例。
