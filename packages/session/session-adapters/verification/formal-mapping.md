# 形式模型与规格、代码的对照

本页对照 `session-adapters/verification` 下四个有限模型：进程代次与准入记录（`generation-handoff`）、Agent 事实族（`journal-facts`）、执行日志的开放集（`journal-open-set`）、会话工作目录（`working-directory`）。条款在包组规格 [`packages/session/SPEC.md`](../../SPEC.md)；Agent 一侧的承诺在 [Agent 规格](../../../agent/SPEC.md)。模型检查只说明有限范围内的设计性质。配置预期见下表；运行器按预期判读，正控要求无反例，负控要求命中指定性质。手写的无界证明见 [proofs/](proofs/)。

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
| P2 只追加             | 已提交的批不改写、不删除                                                                                       | `P2_AppendOnly`（动作性质）                                | `bad-upsert-p2`：判定批原地改写上一批                                             |
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
