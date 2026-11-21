# 形式模型与规格、代码的对照

本页对照 `session-adapters/verification` 下五个有限模型：进程代次与准入记录（`generation-handoff`）、Agent 事实族（`journal-facts`）、执行日志的开放集（`journal-open-set`）、会话工作目录（`working-directory`）、执行记录的确认与回收（`execution-settlement`）。条款在包组规格 [`packages/session/SPEC.md`](../../SPEC.md)；Agent 一侧的承诺在 [Agent 规格](../../../agent/SPEC.md)。模型检查只说明有限范围内的设计性质。配置预期见下表；运行器按预期判读，正控要求无反例，负控要求命中指定性质。手写的无界证明见 [proofs/](proofs/)。

## generation-handoff

`Generation.tla` 检查读取方代次：已退役读取方捕获的引用不能再当作当前，答复晚于退役时也一样。`Handoff.tla` 检查消息准入的记录：同一输入身份认回原结果，固定后崩溃重启仍读到原结果。采用的承诺：会话适配器的消息准入提供者（固定原身份、完整请求、来源、原主体与结果后才返回）、Agent 的消息准入与受理恢复切点、Runtime Context 的访问核对（捕获的当前引用失效后不能恢复，异步等待之后须重核）、存储的执行索引（`(租户, 执行)` 到会话的唯一映射，同名执行可分属不同租户）。

| 性质（模型名）                            | 含义                                                     | 负控：去掉的控制                                                          |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `RetiredNeverCurrent`                     | 已退役的捕获引用的当前性为假，包括晚到答复与重装后的引用 | `bad-retirement` 不关闭存活；`bad-generation-check` 不比较引用代次        |
| `LiveReaderUnaffected`                    | 未退役读取方的引用仍可使用，避免正常控制退化为恒假       | 与上两项共同检查                                                          |
| `AtomicRecord`                            | 索引与完整意图对应，结果有完整原记录                     | `bad-partial-record` 只发布索引                                           |
| `ReplyIsDurable`、`RestartRetainsReplies` | 已返回的结果在返回时与重启后都可读                       | `bad-early-reply` 在计算后即返回，随后崩溃丢失结果                        |
| `UniqueHandoff`                           | 同一输入标识或同一消息标识只能认回同一完整原记录         | `bad-ki-rebind`、`bad-h-rebind` 允许不同输入占据原索引                    |
| `UniqueExecutionRoute`                    | 同租户同执行只对应一个会话                               | `bad-execution-rebind` 允许写入第二个会话                                 |
| `OriginalResult`、`AtMostOneAdmission`    | 同一消息标识永远返回原结果，固定新结果至多一次           | `bad-repeat-admission` 再次计入准入；`bad-original-result` 绕过原结果选择 |

| 配置                                                                                                                                                                     | 预期                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `generation`、`handoff-same`、`handoff-payload-conflict`、`handoff-ki-rebind`、`handoff-h-rebind`、`handoff-route-rebind`、`handoff-cross-tenant`、`handoff-independent` | 无反例（正控），分别覆盖代次、同输入、载荷冲突、两种重绑、路由重绑、跨租户、互不相干的调用   |
| `bad-retirement`、`bad-generation-check`                                                                                                                                 | 命中 `RetiredNeverCurrent`                                                                   |
| `bad-early-reply`                                                                                                                                                        | 命中 `RestartRetainsReplies`                                                                 |
| `bad-partial-record`                                                                                                                                                     | 命中 `AtomicRecord`                                                                          |
| `bad-ki-rebind`、`bad-h-rebind`                                                                                                                                          | 命中 `UniqueHandoff`                                                                         |
| `bad-execution-rebind`                                                                                                                                                   | 命中 `UniqueExecutionRoute`                                                                  |
| `bad-repeat-admission`                                                                                                                                                   | 命中 `AtMostOneAdmission`                                                                    |
| `bad-original-result`                                                                                                                                                    | 命中 `OriginalResult`                                                                        |
| `witness-late-answer`、`witness-recovery`                                                                                                                                | 见证：命中 `NoLateAnswer`、`NoRecoveredResult`，证明晚到答复与恢复后读到原结果这两种交错可达 |

| 模型                             | 代码                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Capture`、`Deliver`             | `runtime-context-trust.ts` 的捕获与三种授权方法                                                                                      |
| `Retire`、`Assemble`             | 应用进程桥的代次、桥与信任的取得                                                                                                     |
| `intents`、`outcomes`            | Agent 公开类型的 `InputHandoff`、`InputOrigin`、`HandoffOutcome`、`HandoffLookup`                                                    |
| `SaveIntent`、`Commit`、`Lookup` | `message-handoff.ts` 的 `prepare`：先以意图阶段保存，存储确认后以结果阶段固定一次，事务内重查；`lookup` 按原租户、执行与输入标识只读 |
| `BindExecution`                  | 存储的执行索引迁移与路由读取；Journal 提供者里的路由写入，已有同租户同执行的不同会话时拒绝                                           |

## journal-facts

`JournalOught.tla` 是行为模型：一个执行，每步三批，外加认回、材料保存、重试、崩溃、恢复与存储拒绝。规格见 SE-14。

| 性质                  | 含义                                                                                                           | 模型中的名字                                               | 负控                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P1 唯一事实源         | 进程内视图等于已提交日志的折叠                                                                                 | `P1_ViewIsFold`、`P1_HeadIsTail`                           | `bad-cache-only-p1`：判定批只进视图，不追加                                       |
| P1 位置唯一来源       | 核心给下一批的位置等于发布计数加一；每个完成步的判定事实都到达日志                                             | `P1_OnePosition`、`P1_FactsPublished`                      | `bad-second-position-p1`、`bad-second-position-facts`：核心另持位置               |
| P2 只追加             | 执行结清之前，已提交的批不改写、不删除；结清之后整执行的回收见 `execution-settlement`                          | `P2_AppendOnly`（动作性质）                                | `bad-upsert-p2`：判定批原地改写上一批                                             |
| P3 每步提交有界       | 一批只带本步新增事实，权重有与步数无关的常数上界                                                               | `P3_NoFactRepeated`、`P3_BatchBounded`                     | `bad-whole-rewrite-p3`、`bad-whole-rewrite-p3-repeat`：每批带上全部游标与历史事实 |
| P4 自有部分线性于步数 | 自有权重不超过显式系数乘步数加常数，及其对日志内容的比值形式                                                   | `P4_LinearInSteps`、`P4_RatioBound`                        | `bad-whole-rewrite-p4`、`bad-whole-rewrite-p4-ratio`                              |
| P5 恢复等价           | 重启后折叠出的视图等于崩溃前最后一次成功提交留下的视图                                                         | `P5_Recovery`（动作性质）                                  | `bad-cache-only-p5`                                                               |
| P6 幂等认回           | 一个操作一批，答复是本批的函数，同输入重试得到原答复                                                           | `P6_OneBatchPerOp`、`P6_AnswerFromBatch`、`P6_RetryAgrees` | `bad-retry-reexecute-p6`：重试再执行一次                                          |
| 失败不静默            | 存储拒绝后槽位为失败，或命令待重发                                                                             | `RejectVisible`                                            | `bad-silent-stop`：拒绝后槽位仍为运行                                             |
| P7 记录是投影         | 写者的读者记录等于折叠视图的投影；继任者只投影折叠，不存记录副本；记录所编号的事件就是折叠按规则判出的事件事实 | `P7_RecordsProjected`                                      | `bad-event-without-fact-p7`                                                       |
| 单推进者              | 每批由日志所记的当前代次写入                                                                                   | `GenGuard`                                                 | 无负控                                                                            |

配置：`journal` 与 `journal-wide`（放大步数、崩溃与重试）是正控，检查同一组性质，预期无反例；十二个 `bad-*` 各打开一个故意的错误，预期命中上表对应的性质。运行器的自检把预期改错，应判不通过。

| 前提                | 内容                                 | 谁强制                                          |
| ------------------- | ------------------------------------ | ----------------------------------------------- |
| A1 原子追加         | 一批要么整体可见，要么都不可见       | 存储的单事务提交                                |
| A2 折叠纯           | 折叠函数不读时钟、随机数或 I/O       | 折叠定律的属性测试 `tests/journal-laws.spec.ts` |
| A3 批自描述         | 批的内容在提交时固定                 | P2 与 A1                                        |
| A4 操作身份确定派生 | 同一帧同一转移在崩溃前后派生同一身份 | Agent 规格里的派生规则                          |
| A5 单写者在位       | 旧代次的写入被拒                     | 发布计数的条件提交与批的主键                    |

| 性质       | TLC 有限范围           | 手写证明（无界）                 |
| ---------- | ---------------------- | -------------------------------- |
| P1         | 正控通过，负控命中     | 命题 1：对日志长度归纳           |
| P2         | 正控通过，负控命中     | 命题 2：改写日志的动作只有追加   |
| P3         | 正控通过，两个负控命中 | 命题 3：上界只含常量             |
| P4         | 正控通过，两个负控命中 | 命题 4：线性上界与比值上界       |
| P5         | 正控通过，负控命中     | 命题 5：由 P1 与折叠的确定性得出 |
| P6         | 正控通过，负控命中     | 命题 6：答复是批的函数，批不变   |
| 失败不静默 | 正控通过，负控命中     | 命题 7：单步要求，不需要推广     |
| 单推进者   | 正控通过，没有负控     | 不在本资源范围                   |

| 模型                                           | 实现                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `log`（批序列）                                | 存储的事实表按（租户、会话、发布位置、序）聚簇，一批是一个发布位置 |
| 批的 `op`、`digest`、`gen`                     | 序为 0 的行是批信封；认回索引（租户、操作）到（摘要、发布位置）    |
| 批的 `changed`、`intents`、`results`、`judged` | 游标移动、调用意图、结果接收、回复判定四类事实                     |
| `view`、`Apply`、`FoldN`、`head`               | 进程内会话视图与纯折叠函数；视图折叠到的发布位置即根的已发布读数   |
| `corePub`                                      | 核心给下一批的位置，等于视图 head 加一                             |
| `answers`、`DeriveAt`                          | 实现不存答复，答复由批与视图的操作索引推导                         |
| `writerGen`                                    | Agent 契约里授权的代次                                             |
| `records`、`ProjectOf`、`NewEvents`            | 读者记录由视图与块投影；事件规则是折叠的事件判定                   |
| `slot`、`lastCommit`                           | Agent 提供者里的执行槽状态与最近一次提交结论                       |
| `Weight`、`logContent`                         | 批字节的抽象权重；Session 条目族的内容字节                         |

| 模型动作                     | 实现步骤                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `CommitIntend`               | 发出外部效果之前的提交：步开始、请求采用或调用意图、游标移动，一次存储事务                         |
| `CommitReceive`              | 结果接收方的接收共同提交：结果接收加保管块                                                         |
| `CommitJudge`                | 回复准入的提交：回复判定加同事务的历史消息，会话参加者同事务写条目                                 |
| `Recognize`                  | 新操作认回已有事实：认回批，不推进修订，指向被认回的批                                             |
| `Preserve`                   | 材料保存：核心的批，一条材料保存事实加材料块，不动游标、不推进修订                                 |
| `RetrySame`、`RetryConflict` | 同语义输入认回原结果，异语义输入答冲突，无写入                                                     |
| `Crash`、`Recover`           | 进程重启；继任者冷启动折叠，再挂接                                                                 |
| `Refuse`                     | 存储在受理前拒绝，无写入：暂时的原因驱动等待后以同一操作重发，确定的原因驱动不重发，Run 以失败终结 |

## journal-open-set

`OpenSet.tla` 是抽象模型：一个执行，项有原键，开、改、关，关后不变。持久投影与关闭索引在追加批的同一次提交里写；写者的进程内视图折叠到哪一批就持有哪一批的开放集；冷装载分两页读投影，两页的头不同就重来；Agent 先看快照，缺席的项按原键点查，决定只在读到的修订上条件提交；生产方保存迟到结果，不带期望修订。规格见 Agent 规格「执行日志」的快照与开放两条。

| 性质         | 含义                                           | 模型中的名字           | 负控                                                                              |
| ------------ | ---------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| 快照是开放集 | 快照等于它所标修订的开放项                     | `P1_SnapshotIsOpenSet` | `bad-mix-pages`：冷装载接受两个头的页                                             |
| 投影同提交   | 持久投影始终是整条日志的开放集，头等于日志长度 | `P2_ProjectionCurrent` | `bad-projection-lags`：投影由之后的步骤写                                         |
| 按原键可达   | 开着的在投影里，关了的按原键查得到             | `P3_Reachable`         | `bad-no-closed-index`：关闭只从投影删，不写关闭索引                               |
| 决定看到真值 | 提交的决定看到的是它提交修订上的真值           | `P4_DecisionsTrue`     | `bad-absent-as-never`：缺席当作从未发生；`bad-unchecked-commit`：不带期望修订提交 |
| 只含开放项   | 快照的大小只取决于开放工作                     | `P5_OpenBound`         | `bad-keep-closed`：关闭项留在快照                                                 |

配置：`open-set` 是正控（2 个键、4 个批、每批至多 2 处改动、1 次崩溃、2 次重来），预期无反例；六个 `bad-*` 各打开一个错误，预期只命中上表对应的性质。运行：`models/run-tlc.sh models <证据目录>`。

| 模型                       | 实现                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| 开放的判据                 | `agent-contract` 的 `openItems`；两份核心都照它裁快照                                  |
| 按原键点查                 | `AgentJournalReading.inputAcceptance`；模型控制记录自带 `modelInvocation`              |
| 进程内视图与冷重建同一投影 | `testing/journal-records.ts` 与进程内推进；守卫 `tests/journal-records-parity.spec.ts` |
| 持久投影、冷装载两页同头   | 尚未实现：冷装载仍从头重放事实（#1310）                                                |

## working-directory

`WorkingDirectory.tla` 检查会话工作目录在更换、步的边界、工具调用的受理与进程重建任意交错下的四条性质。采用的承诺：Session 规格[日志与提交](../../SPEC.md#日志与提交)里会话工作目录的规则，Tool 规格里固定请求钉住工作目录的规则。模型里的耐久事实是会话的选择、块在最近一次步边界提交的值、写给模型的最后一条提醒、每次已受理调用钉住的目录；活体只有持有者的「已告知」，重建时丢。

| 性质（模型名） | 含义 | 负控：去掉的规则 |
| --- | --- | --- |
| `PinnedDirectory` | 一次调用执行时用的目录等于它第一次受理时钉住的目录 | `bad-exec-reread` 执行时重新读块；`bad-volatile-pin` 钉住的值不耐久，重建后重新取 |
| `ToldDirectory` | 一次调用钉住的目录等于模型发出它时被告知的目录 | `bad-live-read` 受理时读最新的选择；`bad-direct-publish` 更换的提交直接改块；`bad-recover-latest` 重建后按最新的选择给块赋值 |
| `NoRefusal` | 没有调用因为没有目录而被答不可用，跨重建也成立 | `bad-volatile-block` 重建时把块丢掉 |
| `ToldAtBoundary` | 走到模型请求的一步，已经把这一步开始时的选择告知了模型 | `bad-refresh-after-read` 先读变化、后刷新 |

| 配置 | 预期 |
| --- | --- |
| `working-directory`、`working-directory-wide` | 无反例。前者两个目录、两次调用、两次更换、三步、一次重建；后者三个目录、三次调用、三次更换、四步、两次重建 |
| `bad-live-read`、`bad-direct-publish`、`bad-recover-latest` | 命中 `ToldDirectory` |
| `bad-volatile-block` | 命中 `NoRefusal` |
| `bad-exec-reread`、`bad-volatile-pin` | 命中 `PinnedDirectory` |
| `bad-refresh-after-read` | 命中 `ToldAtBoundary` |
| `witness-new-directory`、`witness-outlives-switch`、`witness-resume` | 见证：有调用在新目录里执行；有调用在更换之后仍在原目录执行完；有调用还没受理时发生了重建。证明正控不是空转 |

环境假设：一个会话同一时刻只有一个 Run，一个 Run 的步串行；一步的调用都在下一步开始之前受理；一步开始之前的动作失败时这一步不发模型请求。模型检查只说明这些假设与上界之内的设计性质。

## execution-settlement

`ExecutionSettlement.tla` 是行为模型，判什么时候可以回收一个执行的执行记录。模型里有同一租户的两个执行：一个发起一个调用，调用可以先转到后台再送来最终结果（Tool），也可以第一份交付就是终局（Model 与前台 Tool），Agent 可以处理交付，也可以不处理就终结；调用意图可以是单独的一个事件，也可以没有事件点名它：交付先保管，处理这份交付的事件同时登记这个调用；另一个只发终结事件。另有日志解释与条目消费的互相唤醒、会话自己写下的终结、进程崩溃与新写者代际打开租户域。条目消费在模型里是 `Ad06`，代表这个调用的被调用方的那一条：Tool 是 AD-06，Model 是 AD-05。规格见 [SE-40](../../SPEC.md#不变式)，与包组规格[与 Agent 的同日志参加与解释](../../SPEC.md#与-agent-的同日志参加与解释)一节里执行记录的确认与回收。

| 性质                             | 含义                                                                                          | 负控                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NoLostEvent`                    | 内容不再是全时，会话已消费这个执行发出的每一个事件                                            | `bad-settle-short`：`settled` 不要求确认到最后发出的事件                                                                                                                                          |
| `NoLostLateResult`               | 内容不再是全时，这个执行的调用结果已写进会话日志                                              | `bad-ignore-consumption`：`receivedAll` 不看挂着的调用；`bad-interpret-overtakes`：条目消费还没写下交付，日志解释就解释了处理它的事件                                                             |
| `SummaryBeforeReclaim`           | 内容不再是全时，终结条目已在会话日志里：解释写下的带收尾摘要，会话自己写下的按规则 `end` 为空 | 无负控命中，见配置一段                                                                                                                                                                            |
| `AckOnlyReceivedAll`（动作性质） | 确认只在收完成立、且 `through` 等于消费位置时前进                                             | `bad-ignore-run-active`：`receivedAll` 不看 Run 是否进行中                                                                                                                                        |
| `FrozenAfterReclaim`（动作性质） | 内容不再是全之后，发出、消费、确认都不再变                                                    | 无负控                                                                                                                                                                                            |
| `TwoPhase`                       | 内容为无时，结清它的代际早于当前代际                                                          | `bad-sweep-any-generation`：清扫不看结清它的代际                                                                                                                                                  |
| `AnswerStable`                   | 本代际的写者在已结清的执行上发过的操作，按 `er_operation` 认回仍答已提交                      | `bad-phase1-drops-operation`：第一段连 `er_operation` 一起删                                                                                                                                      |
| `EventuallyReclaimed`（活性）    | 每个终结了的执行最终不再是全                                                                  | `bad-no-startup-wake`：打开租户域不唤醒；`bad-ad06-agent-wake-only`：只有 Agent 记录的写入唤醒条目消费；`bad-open-awaits-processing`：终局交付写进会话之后，调用还要等 Agent 处理过交付才不再挂着；`bad-atomic-event-awaits`：一个事件既登记调用又处理它的交付时，日志解释整个事件一起等交付 |
| `BoundedRetention`（活性）       | 结清之后有了更晚的代际，墓碑最终变成无                                                        | `bad-no-phase2`：清扫什么都不删                                                                                                                                                                   |

配置：`settlement` 是正控，检查全部性质，预期无反例。十一个 `bad-*` 各打开一个错误，只检查上表对应的一条性质，预期命中它。`masked-ignore-run-active` 打开与 `bad-ignore-run-active` 相同的错误，检查除 `AckOnlyReceivedAll` 以外的全部性质，预期无反例。`masked-no-ad06-ack` 让条目消费把交付写进会话之后不调 `acknowledgeReceived`，检查全部性质，预期无反例。运行：`TLA2TOOLS_JAR=<钉住的 tla2tools.jar> python3 check.py --out <证据目录>`。执行全部收完之后没有可走的步，所以运行器给 TLC 加 `-deadlock`，这些状态由两条活性性质判。

`receivedAll` 不看 Run 是否进行中时，`NoLostEvent` 与 `SummaryBeforeReclaim` 仍成立。Agent 一侧的结清要求确认到最后发出的事件，也就是终结事件；`through` 只取会话的消费位置。所以会话解释终结事件之前，任何确认都不会让执行结清。终结事件的解释提交同时写下终结条目与收尾摘要。这个错误只违反 `AckOnlyReceivedAll`。`bad-phase1-drops-operation` 不命中 `TwoPhase`：第一段留着 `er_execution`，内容仍是墓碑。`bad-sweep-any-generation` 的反例：本代际第一次打开时清扫没做完，本代际结清一个执行，再次打开时清扫把它的墓碑删了。

四个和交付有关的负控的反例。`bad-atomic-event-awaits`：Agent 发出调用时没有事件点名它，最终结果先保管，处理它的事件同时登记它；日志解释停在这个事件之前等交付，条目消费因为会话还不认识这个调用而不写交付，两边互相等，执行终结之后不结清。`bad-interpret-overtakes`：Agent 处理了交付并终结，日志解释在条目消费写下这份交付之前解释了处理它的事件，会话把调用当作已由这个结果答复；Run 终结之后调用不再挂着，执行结清，之后的交付写不进会话。`bad-ad06-agent-wake-only`：交付都在日志解释登记调用之前送到，条目消费被唤醒时会话还不认识这个调用；登记调用的解释提交不再唤醒条目消费，调用一直挂着。`bad-open-awaits-processing`：Run 被取消，Agent 没有处理交付就终结，终局交付写进了会话，调用仍因为交付没被处理而挂着。`masked-no-ad06-ack` 无反例：条目消费的提交唤醒日志解释，日志解释的每一轮之后都调 `acknowledgeReceived`，有没有可解释的事件都一样，所以少了条目消费那一处确认，执行仍会结清。

范围：两个执行，只有 `e1` 发起调用，`e2` 只发终结事件；每个执行至多 5 个事件，终结事件在内，所以 `e1` 在终结之前放得下调用意图、占位、最终结果与处理交付四个事件；`e1` 的调用也可以不带事件发出，由处理交付的事件登记；至多 2 次崩溃；至多 1 次清扫没做完。

模型比实现宽的地方：Agent 可以在任何时候终结，调用转了后台、还在运行或已收到结果都可以，处理没处理交付都可以；会话可以在任何时候自己写下终结。宽出来的行为只会多出反例，不会藏住反例。

| 前提                         | 内容                                                                                                                                                                                                                                               | 谁强制                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 判结清与回收同事务        | 触及执行的提交判结清，结清的那一次在同一事务里删内容、留墓碑与 `er_operation`，并记下结清它的写者代际                                                                                                                                              | `session-storage-sql` 的 `execution-record.ts`：写批带着结清的写者代际（`settledBy`）就调 `reclaim`，写进 `er_execution.settled_by`                                                                                                                                                                                                                                                             |
| S2 终结事件是最后一个        | 终结之后不再发事件；终结之后收到的结果只保管                                                                                                                                                                                                       | `journal/fold.ts` 的 `eventOf`                                                                                                                                                                                                                                                                                                                                                                  |
| S3 Run 与执行同时终结        | 工作快照里 Run 的终态与执行的 `terminal` 由同一个 `run.terminal` 条目写下                                                                                                                                                                          | `session-contract` 的 `applyRunTerminal`                                                                                                                                                                                                                                                                                                                                                        |
| S4 清扫的时机                | 本代际第一次打开租户域时唤醒并清扫；没做完时，本代际之后的一次打开再做；本代际的读写不等清扫做完                                                                                                                                                   | `agent-journal.ts` 的 `domainOf` 调 `createTenantSweep`，没做完就在下次打开时再做；服务就绪时执行日志那一行对每个已登记的租户打开一次（`openTenant`）                                                                                                                                                                                                                                             |
| S5 清扫只删更早的代际        | 清扫带着当前写者代际，只删别的代际结清的墓碑与 `er_operation`；同一时刻只有一个写者代际在写，别的代际就是更早的                                                                                                                                    | `execution-record.ts` 的 `sweep` 与读处理 `execution-record.retired` 按 `settled_by` 比；写者代际在 `createSessionLogJournal` 里每个实例新取一个                                                                                                                                                                                                                                                |
| S6 终结责任只建两类          | 输出责任与调用责任；其余各类在模型里视为已结清。清单在终结之前开出，输出责任覆盖到终结事件之前                                                                                                                                                     | `testing/journal-finishing.ts` 的 `buildObligations`、`callObligations`                                                                                                                                                                                                                                                                                                                         |
| S7 消费与解释终会发生        | 被唤醒的解释与条目消费、确认、被调用方的交付、打开租户域与清扫的再做都是弱公平                                                                                                                                                                     | Agent 记录每次写入之后的唤醒（`announcePublished`）、两边消费提交之后的互相唤醒（`announce`）与新代际的唤醒；新代际第一次打开租户域靠服务就绪时逐个租户的打开，清扫的再做靠本代际之后的读写打开租户域                                                                                                                                                                                                                                             |
| S8 失败的确认不留待办        | 一次确认失败与进程中断同样只靠新代际的唤醒补回；模型只经崩溃丢掉确认                                                                                                                                                                               | `acknowledgeReceived` 失败时只记日志                                                                                                                                                                                                                                                                                                                                                            |
| S9 唤醒不丢                  | 进程活着时，一次消费正在跑时来的唤醒，之后还会再跑一轮；模型里一个执行每边至多一个待处理的唤醒                                                                                                                                                     | `subscribePublished` 每个会话一条队列，每次唤醒排一轮；一轮读到当时日志里的全部                                                                                                                                                                                                                                                                                                                 |
| S10 一个调用代表两类被调用方 | 模型只有一个调用，Tool 与 Model 走同一套规则：条目消费停在未登记的调用、两种唤醒、提交之后唤醒并确认、因果顺序、终局交付写进会话就不挂着。Model 调用与前台 Tool 调用是 `Final` 从 `running` 直接走的那一支；转了后台的 Tool 调用先走 `Placeholder` | 两条条目消费同构：`tool-log-consumption.ts` 与 `model-log-consumption.ts` 都订阅 `interpreted`、提交之后 `announce` 并调 `acknowledgeReceived`；`awaitsDelivery` 按被调用方取 `tool-received` 或 `model-received` 的位置；`callOpen` 读工作快照里调用的 `delivered`。Model 一侧另由 `execution-settlement.spec.ts` 的两格模型用例与 `call-settlement.spec.ts`「the final delivery of a call」守 |
| S11 调用在终结之前有事件点名 | Agent 发出的调用，在终结事件之前由一个事件点名：调用意图、等待它的事件，或处理它第一份保管交付的事件。改动之前的模型要求调用意图本身是一个事件，比这条更强 | 模型的假设；实现里没有核对。事件后果按调用第一次出现的事件登记它（`testing/history.ts` 的 `callConsequences`） |

| 模型                          | 实现                                                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emitted`、`ended`、`acked`   | 执行视图的 `emitted`、`finish.ended`、`acknowledged`；Agent 快照的 `output.emittedThrough` 与 `acknowledgedThrough`                                                                                                                                 |
| `outputAt`                    | 输出责任的 `emittedThrough`；`acknowledgedFacts` 在确认到它时把它记为已结清                                                                                                                                                                         |
| `call`                        | 调用在 Agent 结果接收方的保管：`running` 还没有交付，`background` 占位已保管，`done` 最终结果已保管，`lost` 记录已回收时被拒                                                                                                                        |
| `callAt`、`consumption`       | 登记调用的事件：调用意图，或处理第一份保管交付的事件（这时等于 `procAt`），还没有事件点名时为 0；工作快照里这个调用：`bound` 已登记，`background` 占位已写进会话（`backgroundPlaceholders`），`settled` 终局交付已写进会话（调用的 `delivered`，转了后台的另有 `backgroundCalls` 的 `settled`），`answered` 会话把它当作已由结果答复 |
| `procAt`、`processed`         | Agent 处理交付的事件，交付成为这个调用在 Run 历史里的结果；会话已解释这个事件                                                                                                                                                                       |
| `consumed`、`run`             | 执行的 `readThrough`；工作快照的 `run` 与执行的 `terminal`：`end` 是解释提交写下的终结，带 `RunEnd`；`cancelled` 是会话自己写下的终结，`end` 为空                                                                                                   |
| `content`                     | `er_fact`、`er_item`、`er_item_content`、`er_preadmission` 都在为全，第一段之后只剩 `er_execution` 为墓碑，第二段之后为无                                                                                                                           |
| `operations`、`settledGen`    | 这个执行的 `er_operation`；`er_execution.settled_by`                                                                                                                                                                                                |
| `gen`、`opened`、`pendingAck` | 写者代际；`createTenantSweep` 已为本代际打开过租户域；进程里待发的 `acknowledgeReceived`                                                                                                                                                            |
| `twake`、`iwake`、`stalled`   | 进程里条目消费与日志解释待处理的唤醒；日志解释停在处理一份交付的事件之前，等这份交付写进会话                                                                                                                                                        |
| `swept`、`sweepFails`         | 本代际的清扫已做完，`createTenantSweep` 不再为这一代再扫；清扫没做完的次数                                                                                                                                                                          |
| `Settled`、`Commit`           | `journal/items.ts` 的 `settled`；提交的 `settles` 与 `reclaim`                                                                                                                                                                                      |
| `ReceivedAll`、`Ack`          | `cordis/received-all.ts` 的 `receivedAll` 与 `acknowledgeReceived`                                                                                                                                                                                  |
| `CallOpen`                    | `session-contract` 的 `callOpen`：终局交付已写进会话的调用不再挂着，不看 Agent 处理没处理；条目消费写终局交付的执行事实带 `delivered`，归约把它记成调用的 `delivered`                                                                               |
| `Delivered`、`Interpretable`  | `journal-interpretation.ts` 的 `awaitsDelivery`：事件处理的交付还在它的被调用方通道（`tool-received` 或 `model-received`）的消费位置之后，就停在这个事件之前                                                                                        |
| `Recognized`                  | `recordedStanding` 按 `er_operation` 认回；墓碑上的结清操作由 `reclaimedCommit` 答已提交                                                                                                                                                            |
| `Unbound`、`Registered`       | `journal-interpretation.ts` 的 `unbound`：事件里的 `call-registration` 在工作快照里没有这个消费的登记，`call-association` 在工作快照里还不是关联的登记；整个事件提交时，已在会话里的绑定后果再交一次，`registerCall` 认出同一登记，归约不变 |

| 模型动作                            | 实现步骤                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentCall`、`AgentEnd`             | Agent 的提交：调用意图；开出终结责任清单之后写 `finish.ended` 与终结事件。每次提交之后 `announcePublished` 唤醒两边的消费                                                                            |
| `AgentIssue`                        | Agent 的提交只带发出的调用（`effects` 里的 pending），没有点名它的事件；结果在下一个事件之前保管                                                                                                    |
| `Process`                           | Agent 处理保管的交付：一个带着这次调用结果的事件；调用还没有事件点名时，这个事件的后果同时带 `call-registration`                                                                                     |
| `Placeholder`、`Final`              | 被调用方把占位（只有 Tool）与终局交付推给原消费位置，结果接收方写 `result.received`；调用责任在第一份交付保管时结清（`callObligations`）                                                             |
| `SessionCancel`                     | 会话自己写下 `run.terminal`，例如取消一轮或归档                                                                                                                                                      |
| `Interpret`                         | AD-02（`journal-interpretation.ts`）解释一个事件；这一轮有提交就唤醒两条条目消费（`announce` 的 `interpreted`），之后调 `acknowledgeReceived`                                                        |
| `Stall`、`Woke`                     | AD-02 的一轮停在处理一份没写进会话的交付的事件之前（这个调用的绑定已在会话里；负控 `bad-atomic-event-awaits` 不看绑定），或被唤醒时没有可解释的事件；这一轮照样答复并调 `acknowledgeReceived`          |
| `Bind`                              | `round` 里 `awaitsDelivery` 答要等，而这个事件有工作快照里没有的绑定后果：只提交这些后果，`sequence` 为空、解释位置不前进，操作号按 `ad02/bindings/1` 算；有提交就唤醒两条条目消费，之后调 `acknowledgeReceived`，这一轮停在这个事件之前 |
| `Ad06`                              | 条目消费（AD-06 或 AD-05）被唤醒，把占位与终局交付写进会话日志；有提交时唤醒 AD-02（`announce` 的 `consumed`），随后调 `acknowledgeReceived`                                                         |
| `OpenTenant`、`SweepAgain`、`Sweep` | `createTenantSweep`：本代际第一次打开与之后的再做；唤醒 `retired.waiting` 里的执行，再提交带当前写者代际的清扫意图，由 `sweep` 删别的代际结清的墓碑与 `er_operation`；读或提交没有答复时这一次没做完 |
| `Crash`                             | 进程重启，写者代际加一，进程里待发的确认丢失                                                                                                                                                         |
