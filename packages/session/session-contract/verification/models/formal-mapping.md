# 形式模型与规格、代码的对照

本页对照 `session-contract/verification/models` 下除 `frontier` 以外的八个有限模型：它们检查哪些性质，各配置预期什么，模型动作对应哪段代码。条款在包组规格 [`packages/session/SPEC.md`](../../../SPEC.md)。模型检查只说明有限范围内的设计性质，不证明实现符合模型。每个目录的 `expect.txt` 是配置预期的机器形式：`pass` 表示无反例，性质名表示必须命中这一条。`background-calls` 与 `search-coverage` 登记方式不同：它们的配置与预期在 [`../models.json`](../models.json)，由 [`../check.py`](../check.py) 判读，成员内 `pnpm run verify:formal` 运行，见本页最后两节。

## run-advance

`RunAdvance.tla` 检查一个会话的 Run 与 attempt 层：唯一推进者、Run 唯一、输入至多承接一次、取消与终态，以及有界收束在无关提交下是否会放弃。无界推广见 [proofs/run-advance.md](../proofs/run-advance.md)。

| 性质（模型名）                                                                                                                | 规格        | 违背后果                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------- |
| 唯一推进者，序号只增，失效者的写入被拒（`OneAdvance`、`NoRegain`、`AdvanceIsNewest`、`StaleWriterRejected`）                  | I-R2        | 两个实例同时推进同一 Run                 |
| 两个恢复者读同一 Run 层后各自接管，至多一个成立（`OneClaimPerRead`）                                                          | I-R2        | 两个恢复者先后接管，序号连跳两次         |
| Run 唯一，输入至多承接一次（`OneOpenRun`、`TakeOnce`）                                                                        | I-R1、I-R3  | 同一输入进两个 Run                       |
| 终态不可反转，终态后没有 attempt，对账要生产者确认（`TerminalStable`、`NoPostTerminalAttempt`、`ReconcileNeedsConfirmation`） | I-R4、SE-10 | 完成覆盖取消，「已请求停止」显示成已停止 |
| 有界收束不被无关提交饿死（`NoAbandonedClose`）                                                                                | I-R2        | 繁忙会话里收束永远提交不上               |

| 配置                                                                                                                                                               | 预期                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `positive-run`                                                                                                                                                     | 无反例：预期修订只比 Run 层修订                                                                                                                                                        |
| `positive-global-wide`                                                                                                                                             | 无反例：比整份快照修订，但重试上限不小于无关提交数                                                                                                                                     |
| `positive-claims`                                                                                                                                                  | 无反例：两个恢复者竞争接管                                                                                                                                                             |
| `negative-global-expected`                                                                                                                                         | 命中 `NoAbandonedClose`：与 `positive-run` 只差预期的范围                                                                                                                              |
| `bad-second-run`、`bad-two-advances`、`bad-accept-stale`、`bad-retake`、`bad-revive`、`bad-post-terminal-attempt`、`bad-silent-reconcile`、`bad-claim-no-expected` | 各去掉一条设计规则，依次命中 `OneOpenRun`、`OneAdvance`、`StaleWriterRejected`、`TakeOnce`、`TerminalStable`、`NoPostTerminalAttempt`、`ReconcileNeedsConfirmation`、`OneClaimPerRead` |

范围：一个会话；三个输入；两个恢复者；至多两个 Run、三个 attempt。

| 模型                                       | 代码                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `revision`、`runRevision`、`Compared`      | 快照修订与 Run 层修订；`judgments.ts` 的预期核对                                       |
| `StartRun`、`Accept`、`Take`               | `decideStartRun`、`judgeRunStart`；受理；承接事实                                      |
| `Invoke`、`InvokeRefused`                  | `session` 的 `advance.ts` 的发起；消息准入拒收进入有界收束                             |
| `Release`、`ClaimRead`、`ClaimCommit`      | 交还、接管与 `decideAttempt`；接管的预期必填                                           |
| `StaleWrite`、`AgentEnd`                   | `judgeAdvance` 的过期推进；Agent 结束事实的同日志解释                                  |
| `Cancel`、`ProducerConfirm`、`Reconcile`   | `decideControl`、`terminalEntries`、控制进度的对账                                     |
| `CloseRead`、`CloseCommit`、`CloseChanged` | `advance.ts` 的有界收束：读 Run 层修订，带预期提交，答已变时重读，超过上限写诊断后停止 |

## wake-up

`WakeUp.tla` 检查唤醒不丢失与推进失败不静默。

| 性质（模型名）                                                                              | 规格 | 违背后果       |
| ------------------------------------------------------------------------------------------- | ---- | -------------- |
| 待处理的输入最终到达已发起的 Run，已授予的 Run 最终发起（`InputsServed`、`GrantedInvoked`） | SE-6 | 会话静默卡死   |
| 每次放弃都留下具名诊断（`NoSilentGiveUp`）                                                  | SE-8 | 卡死而无法诊断 |

| 配置                           | 预期                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `positive`                     | 无反例：现行实现的形态                                     |
| `positive-no-scan`             | 无反例：关闭扫描、没有丢失时只靠通知与再触发               |
| `negative-no-again`            | 命中 `InputsServed`：在途触发被丢，输入一直等待            |
| `negative-lost-notice-no-scan` | 命中 `InputsServed`：通知可能丢失时必须有扫描              |
| `negative-scan-start-only`     | 命中 `GrantedInvoked`：已授予的 Run 在放弃或崩溃后不再发起 |
| `negative-swallow`             | 命中 `NoSilentGiveUp`：放弃时不写诊断                      |

| 模型                         | 代码（`session`）                                                             |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `Notify`、`Trigger`、`again` | `advance.ts` 的触发与合并                                                     |
| `Read`、`Judge`              | `advance.ts` 的 `check`：已授予而初始批没有交出记录时重放，否则判定并开 Run |
| `Scan`                       | `scan.ts` 按待办原因找会话                                                    |
| `Invoke`                     | `advance.ts` 的发起与退避序列                                                 |
| `silent`                     | 诊断出口：放弃时写具名诊断                                                    |

## run-closure

`RunClosure.tla` 检查 Run 结束时关上未答的调用。

| 性质（模型名）                                                         | 规格 | 违背后果                                       |
| ---------------------------------------------------------------------- | ---- | ---------------------------------------------- |
| 终态的 Run 没有未答的调用（`TerminalClosed`）                          | SE-5 | 历史里有没有工具消息的调用，后继的每个请求被拒 |
| 每个调用至多一条工具消息（`OneAnswer`）                                | SE-5 | 同一个调用有两条互相矛盾的结果                 |
| 模型请求读到的历史里每个调用都有工具消息（`RequestReadsWholeHistory`） | SE-5 | 后继 Run 不能请求模型                          |

| 配置                          | 预期                                             |
| ----------------------------- | ------------------------------------------------ |
| `positive`                    | 无反例                                           |
| `negative-no-closure`         | 命中 `TerminalClosed`：终态提交不补写            |
| `negative-no-closure-request` | 命中 `RequestReadsWholeHistory`                  |
| `negative-late-accept`        | 命中 `OneAnswer`：终态之后仍收循环交来的工具消息 |
| `negative-close-all`          | 命中 `OneAnswer`：终态提交给已答的调用也补写一条 |

| 模型                        | 代码                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `Open(c)`                   | `WorkSnapshot.unansweredCalls`，由 `reduce` 的消息分支经 `run-closure.ts` 维护                  |
| `Assistant(c)`、`Answer(c)` | `decideRecordMessage`；`reduce` 的消息分支。「c 还未答」的前提由 Agent 的循环守，Session 不核对 |
| `Answer(c)` 在终态后被拒    | `judgeAdvance` 的参加分支答终态                                                                 |
| `Terminal`                  | `terminalEntries` 与有界收束都先放 `closingEntries`；归约拒绝还有未答调用的终态                 |
| `StartNext`                 | `judgeRunStart`                                                                                 |

## call-items

`CallItems.tla` 检查工作快照只留开着的调用：调用离开快照之后按键读回，迟到的事实记在它名下而不重开它。参考对象是「调用永远留在快照里」的旧做法（模型里的 `ref`）。

| 性质（模型名）                                                                   | 规格  | 违背后果                                                   |
| -------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------- |
| 按键问到的调用记录与全留着时相同（`Agree`）                                      | SE-35 | 重复确认不认回原确认，迟到的结果被当成没有原绑定而拒掉     |
| 一次调用只开一次（`OpenOnce`）                                                   | SE-35 | 已结清的调用被迟到的事实重新放回快照，快照重新随调用数增长 |
| 快照里恰是开放规则成立的调用，离开的没有一个会因后来的事实重新成立（`OnlyOpen`） | SE-35 | 未结工作的判定与快照不一致                                 |
| 等待、后台、控制三张表只点名开着的调用（`ListsNameOpen`）                        | SE-35 | 控制或等待引用一次读不到的调用，停在不可用                 |

| 配置                      | 预期                                                      |
| ------------------------- | --------------------------------------------------------- |
| `positive`                | 无反例：两次调用、两个结果版本，215 万个不同状态          |
| `negative-forget`         | 命中 `Agree`：快照里查不到就当成新调用                    |
| `negative-forget-reopens` | 命中 `OpenOnce`：同上，已离开的调用被重复登记重新放回快照 |
| `negative-drop-late`      | 命中 `Agree`：迟到的事实不记到已离开的调用名下            |

| 模型                                  | 代码                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Open(c, …)`                          | `call-settlement.ts` 的 `callOpen`。模型的 `runAlive` 在代码里是「会话有活着的 Run」，不分是哪一个 Run；这比模型宽，只让调用晚一点离开      |
| `Settle`                              | `settleCalls`，在 `reduce` 每批的末尾                                                                                                       |
| `View(c)` 在 `c` 不在快照里时         | 读回：`callWithLate` 把离开时的一行叠上之后写的各格。内存参考实现在 `testing-calls-left.ts`，SQL 在 `session-storage-sql` 的 `call-left.ts` |
| `Write` 对已离开的调用只写 `idx`      | `lendCalls` 借回，原归约函数照跑，`settleCalls` 把借回的调用再送出去并给出这一批写的格                                                      |
| `Rebind`                              | 重复的 `call.bound`：`registerCall` 对着借回的原登记比对                                                                                    |
| `Result`、`Process`、`Release` 的迟到 | `applyResult`、`applyProducerFact` 对着借回的消费执行，结果成为 `late` 里的格                                                               |
| `Control` 只点名开着的调用            | 停一个已离开的调用：查的是没有借回的快照，答没有这次在途调用                                                                                |
| `Terminal`                            | `run.terminal` 清掉等待；批末的 `settleCalls` 让没有处理过的结果与没关联上的意图离开                                                        |

模型不覆盖：意图在 Run 终态离开之后才解释到它的关联。代码把这次关联记成迟到的一格，不重开调用；这次调用因此不计入未结工作。缓存折叠时按键取回离开的调用是读路径上的并发，由 `session-storage-sql` 的 `call-left.spec.ts` 守。

## input-handover-finish

检查交入与收场：`EndedClean`（Run 不带着去处是它、既没取走也没拒收的输入收场；规格 SE-2）、`OneOutcome`（每条输入至多一个结局：取走、拒收、改去下一个 Run；规格 I-R3）。

| 配置                      | 预期                                                                        |
| ------------------------- | --------------------------------------------------------------------------- |
| `positive`                | 无反例                                                                      |
| `negative-no-participant` | 命中 `EndedClean`：条件终结不问会话参加者，已受理还没交入的输入被留下       |
| `negative-no-agent-check` | 命中 `EndedClean`：Agent 不核对水位线以内的输入，已交入还没取走的输入被留下 |

| 模型                               | 代码                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `Accept`、`Receipt`、`Reject`      | 受理；交入回执（输入不在待处理或已有回执时拒收）；消息准入拒收写拒收回执       |
| `Submit`                           | Agent 的交入；提交里会话参加者只读核对来源                                     |
| `Take`、`Interpret`                | Agent 协调器取走输入；会话的同日志解释写承接事实                               |
| `AgentAllows`、`ParticipantAllows` | Agent 条件终结核对水位线以内的输入；`judgeCompletion` 在有未交入的输入时答阻塞 |
| `SeeEnd`                           | 解释结束事实后 `routeInput` 重定去处                                           |

## input-handover-quiesce

检查交入与停服交接：`DrainedHonest`（已排空的答复是真的：没有驱动在跑，槽空闲）、`Delivered`（到达的每条输入跨停服都被取走）、`Drains`（开始的静默终究答已排空）。规格 SE-6。

| 配置                       | 预期                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| `positive`                 | 无反例（含活性）                                                         |
| `negative-hint-only`       | 命中 `Delivered`：驱动只靠唤醒提示得知新输入，脱挂期间交入的输入没人读到 |
| `negative-submit-reserves` | 命中 `DrainedHonest`：没有活驱动时交入预占执行槽                         |

| 模型                        | 代码                                                   |
| --------------------------- | ------------------------------------------------------ |
| `Submit`                    | Agent 的交入：不碰执行槽，受理后给在跑的驱动一个提示   |
| `Read`、`Take`              | 驱动每次进入等待时重读执行；协调器取水位线以内的输入   |
| `Detach`、`Drain`、`Resume` | Agent 提供者的交还、排空与接续；新协调器从执行记录读起 |
| `Stop`、`Start`             | 进程退出与重启；会话的恢复扫描接回执行                 |

## input-submit-once

检查重复触发：`AcceptOnce`（同一输入至多受理一次）、`TakeOnce`（至多取走一次）、`OneReceipt`（至多一条交入回执）。规格 I-R3。

| 配置                      | 预期                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `positive`                | 无反例                                                      |
| `negative-fresh-identity` | 命中 `AcceptOnce`：每个触发用自己的身份交入，执行记录认不出 |
| `negative-blind-receipt`  | 命中 `OneReceipt`：交入回执的写入不看快照                   |

| 模型      | 代码                                             |
| --------- | ------------------------------------------------ |
| `Read`    | 续入在会话的串行队列里重读快照                   |
| `Submit`  | Agent 的交入：同一输入身份已受理时按认回提交     |
| `Receipt` | 交入回执的决定：输入不在待处理或已有回执时答非法 |
| `Take`    | Agent 协调器取走输入；会话的承接事实             |

## permission-current

检查会话权限配值与当前读取：一个会话的一个权限关口有持久修订与配值，合法写入和清除都改变修订，读取保留修订和值，捕获在同一提交边界比较原修订，重启保留已提交值。规格 SE-23。

| 性质                    | 含义                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `CapturedMatchesCommit` | 每个成功的当前读取与捕获时点一致；已交回的结果不因之后的写入而违反，它不是永久许可 |
| `DurableValue`          | 重启不重置已提交的配值，不把缺席与来源不可用合并                                   |
| `TypeOK`                | 有限域与记录形状                                                                   |

| 配置                 | 预期                                       |
| -------------------- | ------------------------------------------ |
| `positive`           | 所有不变量保持                             |
| `bad-stale-capture`  | 命中 `CapturedMatchesCommit`：捕获不核修订 |
| `bad-clear-revision` | 命中 `CapturedMatchesCommit`：清除不改修订 |
| `bad-restart`        | 命中 `DurableValue`：重启把持久值改成缺席  |

范围：`MaxRevision` 为 2，读取、捕获任意交错，至多一次重启；归档、授权、组织来源与原动作围栏不在模型内，写入假定调用方已有写资格。

## background-calls

`BackgroundCalls.tla` 检查一个会话里转了后台的工具调用：用户的停止、agent 的停止、结局到达、归档与它们的重放任意先后时，会话里留下什么提醒，哪些提醒能开一轮。模型的每个动作是一次会话提交。

| 性质（模型名）                                                                     | 规格   | 违背后果                         |
| ---------------------------------------------------------------------------------- | ------ | -------------------------------- |
| 一次停止至多一条停止提醒（`AtMostOneStopReminder`）                                | SW-I17 | 同一次停止提醒两遍               |
| 一个结果至多一条结局提醒（`AtMostOneOutcomeReminder`）                             | SW-I13 | 同一结果处理两遍                 |
| 停止提醒与被停调用的结局不开 Run（`NoPassiveStart`）                               | SW-I16 | 人刚停掉一项，agent 自己又动起来 |
| 已结算的调用要么成了提醒，要么会话已归档（`SettledHasDestination`）                | SW-I14 | 模型等一个不会来的结果           |
| 归档之后不受理提醒，待处理为空（`NoReminderAfterArchive`、`ArchivedHasNoPending`） | SW-I18 | 已收起的会话又多出待办           |
| agent 提的停止不留提醒（`AgentStopSilent`）                                        | SW-I17 | agent 被自己的动作提醒           |
| 停一项不改变另一项的结局怎样回来（`UnstoppedOutcomeWakes`）                        | SW-I14 | 该叫醒的没叫醒                   |
| 会话没归档时，受理的提醒在待处理或已交入里（`NoLostReminder`）                     | SW-I16 | 停止提醒永远到不了模型           |

| 配置        | 预期                                   |
| ----------- | -------------------------------------- |
| `one-call`  | 无反例：一项后台调用                   |
| `two-calls` | 无反例：两项后台调用，各自的停止与结局 |

负控是对模型的改动，每个只改一条设计规则，只查它应当命中的那一条性质。清单里的名字与命中的性质：

| 改动                       | 改掉的规则                  | 命中                       |
| -------------------------- | --------------------------- | -------------------------- |
| `stop-twice`               | 同一项的第二次停止不认回    | `AtMostOneStopReminder`    |
| `outcome-twice`            | 同一结果的重投不认回        | `AtMostOneOutcomeReminder` |
| `stop-reminder-wakes`      | 停止提醒能叫醒              | `NoPassiveStart`           |
| `stopped-outcome-wakes`    | 被停调用的结局能叫醒        | `NoPassiveStart`           |
| `start-on-any-input`       | 开 Run 不看输入叫不叫醒     | `NoPassiveStart`           |
| `stop-swallows-outcome`    | 被停调用的结局只留存        | `SettledHasDestination`    |
| `outcome-after-archive`    | 归档之后的结局照样受理      | `NoReminderAfterArchive`   |
| `stop-after-archive`       | 归档之后还受理停止          | `NoReminderAfterArchive`   |
| `agent-stop-reminds`       | agent 的停止也留提醒        | `AgentStopSilent`          |
| `archive-keeps-pending`    | 归档不清待处理              | `ArchivedHasNoPending`     |
| `stop-leaks-to-other-call` | 一项被停，别的项也算被停    | `UnstoppedOutcomeWakes`    |
| `passive-input-dropped`    | 开 Run 时不交入不叫醒的输入 | `NoLostReminder`           |

范围：一个会话；一项或两项后台调用；每项至多两次用户停止、两次结局投递；一条人的输入；一次归档。agent 的停止只在有未终结的 Run 时发生。待处理输入的先后、取消 Run、自动归档与未结工作的计算、冻结、撤销归档、Tool 一侧的停止与执行的物理收场不在模型里。只查安全性质。

| 模型                                | 代码                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| `Backgrounded`                      | `background-outcome.ts` 的 `decideBackgrounded`                      |
| `StopUser`、`StopAgent`             | 单调用控制的受理；发起主体取自调用方类别                             |
| `Outcome`、`OutcomeKept`、`Stopped` | `background-outcome.ts` 的 `decideOutcome`、`judgeBackgroundOutcome` |
| `Admit`                             | 系统来源输入的受理：有未终结的 Run 就交入，否则进待处理              |
| `StartRun`、`MayStart`              | `judgments.ts` 的 `judgeRunStart`                                    |
| `Archive`                           | 归档的控制意图：同批取消 Run 与待处理资格                            |

## search-coverage

`SearchCoverage.tla` 检查搜历史在索引落后时会不会漏。会话日志是权威。索引的一代有行（每个已索引的日志位置一行）和每个会话的覆盖位置。追日志的任务把日志位置抄进每一代。重建造出新的一代，并在任意时刻换上。一次查询分三步读：覆盖位置、行、日志的尾巴；然后把覆盖位置到尾巴之间的日志直接扫。三步之间别的动作任意穿插。每个日志位置都当成一条匹配的消息，这是对「不漏」最坏的情形。

| 性质（模型名）                                                              | 规格 | 违背后果                                   |
| --------------------------------------------------------------------------- | ---- | ------------------------------------------ |
| 在查询看到的日志范围内，每个位置被返回，或者答复写明不全（`S1_Complete`）   | SH-1 | 说过的话搜不到，调用方当成没说过           |
| 不返回日志里没有的（`S2_NoExtras`）                                         | SH-1 | 命中指到一条不存在的消息                   |
| 查询开始时已在日志里的，都在它看到的范围内（`S3_ReadYourWrites`）           | SH-2 | 刚说完的话搜不到，答复却说是全的           |
| 索引不声称覆盖到日志之外，它的行恰好是它覆盖的那些（`S4_CoverMatchesRows`） | SH-2 | 覆盖位置走到了行的前面，之间的位置永远漏掉 |

| 配置            | 预期                             |
| --------------- | -------------------------------- |
| `design`        | 无反例：每个会话至多两个日志位置 |
| `design-deeper` | 无反例：每个会话至多三个日志位置 |

负控是模型的开关，每个只改一条设计规则，都只查 `S1_Complete`：

| 配置                      | 改掉的规则                           | 命中          |
| ------------------------- | ------------------------------------ | ------------- |
| `bad-non-atomic-cover`    | 覆盖位置和行分两次提交               | `S1_Complete` |
| `bad-rows-before-covered` | 查询先读行，后读覆盖位置             | `S1_Complete` |
| `bad-mix-generations`     | 查询读一代的覆盖位置、另一代的行     | `S1_Complete` |
| `bad-silent-budget`       | 尾巴的扫描超过预算，答复却不写明不全 | `S1_Complete` |

范围：两个会话；每个会话至多三个日志位置；至多两代索引；一次只有一个查询；一次进程被杀。只查安全性质：追日志的任务最终追得上、索引文件损坏、候选回日志核对的那一步不在模型里。

| 模型                       | 规格里的                                                           |
| -------------------------- | ------------------------------------------------------------------ |
| `Append`                   | 会话日志的一次提交                                                 |
| `Tail`                     | 追日志的任务写一批：行与覆盖位置在索引的同一次提交里               |
| `StartRebuild`、`Swap`     | 重建：建一份新的，建好再换上；换上的时刻不影响正确                 |
| `QBind`、`QIndex`、`QScan` | 一次搜索：绑定一代并读覆盖位置；读候选；读日志的尾巴并扫没覆盖到的 |
| `Crash`                    | 进程被杀：日志与已提交的索引都在，在途的查询与写了一半的批丢掉     |

## session-fork

`SessionFork.tla` 检查一个会话从另一个会话分叉之后，前缀会不会被复制、被改变或读不到。每个会话有自己的一段位置轴和每个代际的行；分叉出的会话的第一个代际在自己的行前面有至多两段，每段指着另一个会话某个代际的一段行。分叉分两步：先定分叉点，后建会话；来源在两步之间与之后照常追加和压缩。

| 性质（模型名） | 规格 | 违背后果 |
| --- | --- | --- |
| 分叉出的会话第一个代际的前缀等于定分叉点时看到的那些行（`PrefixStable`） | SF-1 | 子 agent 的前情在它不知道的时候变了 |
| 段指着的行都在（`SegmentsLive`） | SF-1 | 子会话读不出自己的前缀 |
| 分叉出的会话在第一个代际里写的行都是它自己的条目（`InheritedByReference`） | SF-2 | 前缀被复制了一份 |
| 一次动作只改它自己那个会话的行、位置与段（`OneWriter`） | SF-2 | 建分叉或压缩改了别的会话 |
| 一个视图里位置两两不同；位置不大于分叉点位置当且仅当条目是来源链上的（`RefsNameOneEntry`） | SF-3 | 压缩把别人的条目当成自己的 |
| 段数不超过会话的层数（`ChainBounded`） | SF-5 | 读视图要沿来源链递归 |

| 配置 | 预期 |
| --- | --- |
| `two-sessions` | 无反例：两个会话，位置至多 5，每个会话至多压缩两次 |
| `three-sessions` | 无反例：三个会话（可以接着分叉），位置至多 3，每个会话至多压缩一次 |

变异各改模型里的一条设计规则，各自只查点名的那一条：

| 变异 | 改掉的规则 | 命中 |
| --- | --- | --- |
| `fork-positions-restart` | 分叉出的会话的位置从头编，不接在分叉点之后 | `RefsNameOneEntry` |
| `fork-position-of-last-row` | 分叉点的位置取前缀最后一行的位置，不取来源日志的最大位置 | `RefsNameOneEntry` |
| `fork-compaction-drops-old-epoch` | 压缩时丢掉旧代际的行 | `SegmentsLive` |
| `fork-deep-copy` | 建分叉时把前缀的行抄进子会话 | `InheritedByReference` |
| `fork-writes-into-source` | 建分叉时往来源的日志写一条 | `OneWriter` |
| `fork-forgets-inherited-segments` | 来源自己有段时不抄过来 | `PrefixStable` |

范围：两到三个会话；只查安全性质。消息的内容、前缀作为一次模型请求是否合法（SF-4）、工作状态、租户与访问（SF-6）、归档不在模型里。

| 模型 | 规格里的 |
| --- | --- |
| `Say`、`Note` | 会话日志的一次提交：一条消息（进视图），或一条不进视图的条目 |
| `Compact` | 压缩采用：新代际整份写在自己名下，旧代际的行留着 |
| `Mark` | 读分叉点：视图的代际、序号上界、来源日志的最大位置 |
| `Create` | 带来源的创建：位置轴从分叉点之后起，不写前缀的行 |
| `segs` | 段表 |
