# 形式化工件与论证映射

本页拥有**条款 → 性质 → 模型 → 检查配置**这一层对应关系，以及工件**盖不到什么**。
它不是模型，也不是证明，**不填通过状态**——实际执行的工具、配置、范围与结果在[验证入口](../../verification.md)。

本版只选一个工件：TLA+ 行为模型 [`Execution.tla`](Execution.tla)，理由在[契约 S-49](../contract.md#s-49-本版选用哪些形式工件)。
**不建 Alloy、不建 Schema**。

## 本版选用什么

| 契约条款 | 性质 | 模型里的定义 | 去掉哪一处保护会被反驳 | 未覆盖范围与相应义务 |
|---|---|---|---|---|
| [S-16](../contract.md#s-16-首胜收场只写一次) · [S-9](../contract.md#s-9-两个收场) | 收场写下之后不变；收场之后到达的交回不改收场、不再送达 | 动作性质 `OutcomeStable`、`CallOutcomeStable`；不变量 `AtMostOneToolMessage` | `FirstWins = FALSE`（[`Execution_NoFirstWins.cfg`](Execution_NoFirstWins.cfg)）：中断之后晚到的完成覆盖收场 | 「换了实例的执行者交回」与「同一个执行者晚到的交回」在模型里是同一个动作 `LateReturn`；实例身份不在模型里，证据是场景 [S-59](../contract.md#s-59-停止与交回交错) |
| [S-19](../contract.md#s-19-送达) · [S-27](../contract.md#s-27-转后台) | 执行记录收场了，那段消息**已在日志里或耐久地等着追加**；转了后台，占位同样 | `EndedIsLanded`、`BackgroundHasPlaceholder`；进展 `HandoffLands` | `DurableHandoff = FALSE`（[`Execution_VolatileHandoff.cfg`](Execution_VolatileHandoff.cfg)）：交付物只在进程内存里，停机即丢 | 两种承接形状（同事务、发件箱）都表达成「交付 + 追加」两步，同事务是其中「交付后立刻追加」的子集；**哪一种由提供者设计选**。按 `(CallId, 段)` 幂等在模型里由「追加即清掉交付物」兑现 |
| [S-19](../contract.md#s-19-送达) | 一次调用至多一条工具消息；一段后台执行至多一条收场提醒；提醒排在占位之后 | `AtMostOneToolMessage`、`AtMostOneReminder`、`ReminderAfterPlaceholder` | `FirstWins = FALSE` 反驳前一条；后一条由 `Drain` 的次序（占位先于提醒）给出 | 消息的**内容**（块、原因取值）不在模型里；证据是场景 [S-50](../contract.md#s-50-前台完成)～[S-54](../contract.md#s-54-停机后前台与后台各追补一条) |
| [S-18](../contract.md#s-18-收场先落停止后发) | 被中断的执行收场是 `interrupted`，不被它自己因停止而退出的那次交回抢先 | `InterruptHonored` | `WriteBeforeStop = FALSE`（[`Execution_StopBeforeWrite.cfg`](Execution_StopBeforeWrite.cfg)）：先发停止，执行者的退出抢先落定 | 宽限与强制两级只在进展性质 `StopsTakeEffect` 里以公平性出现；强制停止在各执行环境里做得到什么不在模型里 |
| [S-7](../contract.md#s-7-活体与找得到) · [S-20](../contract.md#s-20-恢复扫描与停机不重来) | 在服务中每条未收场的记录都找得到活体——恢复扫描覆盖全部未收场的记录，不只是有协程要恢复的那些 | `ServingConsistent`；进展 `LostSettles` | `RecoverAll = FALSE`（[`Execution_PartialRecovery.cfg`](Execution_PartialRecovery.cfg)）：只处置前台的，后台的永远悬着 | 模型只有一个会话；「不论会话」由场景 [S-54](../contract.md#s-54-停机后前台与后台各追补一条) 在多会话下演练 |
| [S-17](../contract.md#s-17-持久意图先于外部效果) · [S-20](../contract.md#s-20-恢复扫描与停机不重来) | 同一次执行至多起一次执行者；停机不重来 | `AtMostOneStart` | `NoRestart = FALSE`（[`Execution_RestartOnRecover.cfg`](Execution_RestartOnRecover.cfg)）：恢复把在跑的重起一遍 | 「记录先落、再起执行者」在模型里是 `Submit` 与 `Start` 两步的次序（**按构造**）；执行者资源在停机后是否真的没了（X-5）不在模型里 |
| [S-30](../contract.md#s-30-答复等待) · [S-12](../contract.md#s-12-等待) | 答复只解除它所答的那一次等待 | `NoStaleAnswer` | `CheckWaitIndex = FALSE`（[`Execution_NoWaitIndex.cfg`](Execution_NoWaitIndex.cfg)）：答给第 1 次的迟到答复解除了第 2 次 | 答复值的形状校验、答复者身份不在模型里 |
| [S-29](../contract.md#s-29-会话归档) | 归档之后没有未收场的执行；归档之后没有新的交付 | `ArchiveSettlesAll`、`NoNewDeliveryAfterArchive` | `FirstWins = FALSE` 反驳后一条（晚到的完成在归档后被再交付一次）；前一条由 `Archive` 的写集合给出 | 撤销归档不在模型里 |
| [S-13](../contract.md#s-13-账) | 一次执行恰一份账，只在收场时落 | `OneAccountPerEnded` | `FirstWins = FALSE` 会让晚到的完成再落一份（同一反例） | 账的内容（费用、起止时刻、被拒的一笔）不在模型里 |
| [S-8](../contract.md#s-8-姿态与阶段两个维度) · [S-28](../contract.md#s-28-取消一次运行) · [S-43](../contract.md#s-43-一批依次与同一工具的并发上限) · [S-9](../contract.md#s-9-两个收场) | 等待只在前台；取消运行不动后台；批内依次；并发上限；`unavailable` 只出自注册表判为不可用的项；执行的收场不是 `backgrounded`；后台段只在四种里；姿态单向 | `WaitOnlyForeground`、`RunCancelSparesBackground`、`SequentialBatch`、`ConcurrencyCap`、`UnavailableOnlyFromStandIn`、`NoExecutionBackgrounded`、`BackgroundSegmentOutcome`、`PostureOneWay` | **无对应的有效性核对**：它们由动作的守卫直接给出，去掉守卫是改模型，不是去掉一处契约保护 | **这几条只说明模型没写错，不单独作为证据**；证据形式是场景 [S-52](../contract.md#s-52-自动转后台后完成落一条提醒)、[S-57](../contract.md#s-57-取消运行不动后台)、[S-58](../contract.md#s-58-插队三行) |

**`TypeOK` 只约束模型自己变量的值域**，不绑任何条款。

## TLA+ 与 TLC

- **模型文件**：[`Execution.tla`](Execution.tla)。固定场景：一个会话、两批四次调用、至多一次停机——
  b1 = ⟨c1, c2⟩ 属运行 r1：c1 允许转后台、会进等待；c2 不允许转后台。
  b2 = ⟨c3, c4⟩ 属运行 r2：c3 发起即后台、与 c1 同一个工具（并发上限 1）；c4 在这次尝试里是替换件。
  **两批两个运行，才测得出「取消运行只动它自己在前台的」；c1 与 c3 同一工具，才测得出并发上限跨批成立。**
- **语义映射**：

  | 模型里的 | 契约里的 |
  |---|---|
  | `Submit(b)` | [S-23](../contract.md#s-23-提交一批) 整批一次提交；判为不可用的项即刻 `unavailable`、发起即后台即刻交付占位 |
  | 常量 `StandIn`、原因 `"standin"`、不变量名 `UnavailableOnlyFromStandIn` | **注册表判为不可用的项**：替换件、条目 `unavailable{reason}`、关掉的命令三支（账本 S13-a 之后同归收场 `unavailable`）。三支在模型里行为相同，只用一个集合表示；名字沿用起草时的，不改模型 |
  | `Start` / `StartFail` | [S-38](../contract.md#s-38-起执行者)：起来了，或落点、执行者任一不成立（执行者没跑过）。**参数不合不在这里**：2026-09-24 起它在提交时即刻收场 `failed{arguments_invalid}`（[S-23](../contract.md#s-23-提交一批) ④ 第 ② 条），**模型里没有这一支、对它没有断言**；证据是场景 [S-61](../contract.md#s-61-参数不合即刻失败并带用法)。模型文件与配置未改 |
  | `EnterWait` / `Answer(c, k)` / `WaitExpire` | [S-12](../contract.md#s-12-等待)、[S-30](../contract.md#s-30-答复等待)；`k` 是答复所指的第几次等待 |
  | `Return(c, o)` | [S-41](../contract.md#s-41-交回)：交回完成或失败 |
  | `Background(c)` | [S-27](../contract.md#s-27-转后台)，也代表阈值、上限到点与插队顺带那三个触发源（[S-44](../contract.md#s-44-前台上限与转后台阈值)、[S-31](../contract.md#s-31-插队处置)） |
  | `Interrupt(c)` | [S-25](../contract.md#s-25-中断一次执行)，也代表插队中断与 agent 掐掉 |
  | `InterruptSignal` / `InterruptWrite` / `DeathReport` | **没有** [S-18](../contract.md#s-18-收场先落停止后发) 时必然存在的「先发停止、后写收场」窗口 |
  | `CancelRun(r)` / `Archive` | [S-28](../contract.md#s-28-取消一次运行)、[S-29](../contract.md#s-29-会话归档) |
  | `Crash` / `Recover` | 本能力所在的进程没了 / 下一任的恢复扫描（[S-20](../contract.md#s-20-恢复扫描与停机不重来)） |
  | `pendLand`、`pendPh` 与 `Drain` | 已交付、待追加的消息与日志追加（[S-19](../contract.md#s-19-送达)）；`Drain` 一步追加全部，只为控制状态空间 |
  | `StopDone` / `LateReturn` | 执行者实际停下 / 收场之后才到的交回 |

- **公平性与进展**：主配置不带公平性、不检查进展。进展配置 [`ExecutionProgress.cfg`](ExecutionProgress.cfg) 用 `FairSpec`：
  恢复扫描终会发生（`WF Recover`）、交付物终会追加（`WF Drain`）、停下中的执行者终会实际停下（`WF StopDone ∨ LateReturn`，即强制停止生效）。
  **这三条是前提，不是结论**；契约第八节把它们写在进展性质的「前提」一列。
- **检查输入**：

  | 配置 | 常量 | 检查什么 | 预期 | 登记为 formal task |
  |---|---|---|---|---|
  | [`Execution.cfg`](Execution.cfg) | 六个开关全 `TRUE`，`MaxWaits = 2` | `TypeOK` 与本页第一张表的全部不变量；`OutcomeStable`、`CallOutcomeStable`、`PostureOneWay`、`NoNewDeliveryAfterArchive` | **本范围内无反例** | **是**：`tool-execution-runtime-v1-execution` |
  | [`ExecutionProgress.cfg`](ExecutionProgress.cfg) | 六个开关全 `TRUE`，`MaxWaits = 1` | `LostSettles`、`HandoffLands`、`StopsTakeEffect`（`FairSpec`） | **本范围内无反例** | **是**：`tool-execution-runtime-v1-execution-progress` |
  | [`Execution_NoFirstWins.cfg`](Execution_NoFirstWins.cfg) | `FirstWins = FALSE` | `OutcomeStable` | **找到反例** | 否（期望失败） |
  | [`Execution_VolatileHandoff.cfg`](Execution_VolatileHandoff.cfg) | `DurableHandoff = FALSE` | `EndedIsLanded`、`BackgroundHasPlaceholder` | **找到反例** | 否 |
  | [`Execution_StopBeforeWrite.cfg`](Execution_StopBeforeWrite.cfg) | `WriteBeforeStop = FALSE` | `InterruptHonored` | **找到反例** | 否 |
  | [`Execution_PartialRecovery.cfg`](Execution_PartialRecovery.cfg) | `RecoverAll = FALSE` | `ServingConsistent` | **找到反例** | 否 |
  | [`Execution_RestartOnRecover.cfg`](Execution_RestartOnRecover.cfg) | `NoRestart = FALSE` | `AtMostOneStart` | **找到反例** | 否 |
  | [`Execution_NoWaitIndex.cfg`](Execution_NoWaitIndex.cfg) | `CheckWaitIndex = FALSE` | `NoStaleAnswer` | **找到反例** | 否 |

  全部关掉死锁检查：场景里的调用终会都收场，收场之后没有动作是正常的终点。

- **有效性核对**（**主配置与六个去保护配置一起才成立**）：
  - 关键路径可达：两批都能提交、c1 能进两次等待、能转后台、能被中断、运行能被取消、会话能归档、能停机与恢复——守卫**不是**靠「没人动得了」成立的。
  - **六个去保护配置都必须给出反例**，且反例轨迹要对得上配置注释写的那个局面；给不出，说明对应条款在本模型里是平凡的，**不能记作已验证**。
- **规模**：两批四次调用、一次停机、至多两次等待——每条反例需要的最小局面都在内。**更大的规模是另一次检查**，结果按它自己的范围陈述。

TLA+ 描述行为规格，TLC 对给定模型进行检查；**在已检查范围内未发现反例，不自动成为任意范围的证明**。

## 版本与证据边界

模型与配置随本版本冻结（接受之后）；执行命令、原始输出与反例轨迹在版本外，入口是[验证入口](../../verification.md)。
