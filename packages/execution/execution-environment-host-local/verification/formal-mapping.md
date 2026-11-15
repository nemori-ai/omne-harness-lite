# 宿主提供者的形式模型对照

本页把 [FilesHelper.tla](models/FilesHelper.tla) 与 [WindowsCustody.tla](models/WindowsCustody.tla) 对到包组[规格](../../SPEC.md)与代码，并写出每份配置的预期。模型通过只说明所列规模与抽象之内的结论，不说明实现符合模型。

## 判读

[run-tlc.sh](models/run-tlc.sh) 运行本目录的全部配置与可达见证：

- 正控：TLC 退出 0，并且没有报告违反。
- 负控（文件名带 `-unsafe-`）：TLC 报告的违反是配置里所列性质之一。TLC 非零退出本身不算符合预期。
- 可达见证：模型里以 `Never` 开头的算子各生成一份配置，常量取同名模块的目标配置，只检查这一个算子。被违反才说明对应的状态可达，性质不是空洞成立。

`-deadlock` 关闭死锁检查，因为全部请求得到答复之后模型停止。WindowsCustody 用 `INSTANCE` 引用契约成员的 ProcessCustody.tla，脚本把它复制到临时目录，本目录不另存一份。

## FilesHelper

FilesHelper 描述 Windows 文件后端的常驻文件辅助进程：辅助进程的化身与重启、请求的排队与在途、答复帧、每请求超时、所有者的封闭与排空。对应规格「宿主提供者」一节的门面封闭与排空，以及不变式 H-10、H-12。模型的动作名是实现必须沿用的步骤边界。

### 性质与配置预期

| 名字                      | 命题                                                         | 配置                                                                                          | 预期                           |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------ |
| `P1_NoAnswerWithoutFrame` | 没有收到完整答复帧的请求不答完成或拒绝                       | `FilesHelper-unsafe-p1.cfg`：半帧被当作完整帧                                                 | 违反 `P1_NoAnswerWithoutFrame` |
| `P2_ExitAnswersUnknown`   | 辅助进程退出时，已经写给它、没有答复的请求答未知             | `FilesHelper-unsafe-p2.cfg`：退出时答拒绝                                                     | 违反 `P2_ExitAnswersUnknown`   |
| `P3_NoDispatchAfterSeal`  | 所有者封闭之后，它的请求不发给辅助进程                       | `FilesHelper-unsafe-p3.cfg`：排队中的请求在封闭后被发出                                       | 违反 `P3_NoDispatchAfterSeal`  |
| `P4_InFlightBounded`      | 在途数不超过上限                                             | `FilesHelper-unsafe-p4.cfg`                                                                   | 违反 `P4_InFlightBounded`      |
| `P5_SingleAnswer`         | 每个请求只有一个最终答复，迟到的帧不改写它                   | `FilesHelper-unsafe-p5.cfg`（重复帧）、`FilesHelper-unsafe-p5-late.cfg`（已退出进程的迟到帧） | 违反 `P5_SingleAnswer`         |
| `P6_SettledIsQuiet`       | 所有者结清时，辅助进程里没有它的请求还在执行                 | `FilesHelper-unsafe-p6.cfg`：超时只答一个请求而不停止进程                                     | 违反 `P6_SettledIsQuiet`       |
| 活性 L1、L2               | 弱公平下，每个准入的请求最终得到答复，辅助进程退出之后会重启 | `FilesHelper-unsafe-l.cfg`：退出之后不重启                                                    | 报告活性违反                   |
| 全部安全性质与活性        | —                                                            | `FilesHelper.cfg`、`FilesHelper-live.cfg`：2 个所有者、3 个请求、在途上限 2、至多 2 次故障    | 正控，没有违反                 |
| 全部安全性质              | —                                                            | `FilesHelper-faults3.cfg`（3 次故障）、`FilesHelper-req4.cfg`（4 个请求）                     | 正控，没有违反                 |

### 实现对应

路径相对本包的 `src/`。`windows-files/helper.ts` 的 `request` 对应 Enqueue，`pump` 对应 Dispatch、Start 与 Restart，`received` 对应 StartOk 与 ReceiveFrame，`startFailed` 对应 StartFail，`expired` 对应 RequestTimeout，`invalidate` 对应 Terminate 的宿主一侧，`exited` 对应 HelperExit。Admit 对应门面准入（`host-domain.ts` 的 `trackedFacade` 与 `host-files.ts` 的 `unlessSealed`），Seal、DrainTimeout 与 Settle 对应责任域的排空。实现改动这些步骤时，同步本节。

与模型的差别：模型在 Enqueue、Dispatch 与 Seal 里对排队中的请求再查一次封闭，答 `closed`。实现不在辅助进程里查封闭，这几步的封闭检查由门面准入对应：封住之后新操作在准入处答 `closed`，已经准入的请求照常做完。所以 `P3_NoDispatchAfterSeal` 在实现上只对封闭之后才准入的请求成立；准入之后、发送之前遇到封闭的请求仍会发给辅助进程。H-12 由门面准入与排空守住：排空等全部已准入的操作结束才结清，所以 `P6_SettledIsQuiet` 仍然成立。理由：引擎没有「所有者已结清」以外可接的封闭事实，而接到引擎封闭会使已准入的多步写入与批次在封闭之后的暂存清理答 `closed`。

### 前提与未覆盖

帧按任意次序读到，比真实管道的交错更多，所以安全性质的结论仍然成立。下列内容不在模型里：编号属于另一个未答复请求的错帧、帧内容是否正确、句柄的寿命、跨所有者的公平排队、队列的上界、`maintain()`、冷恢复与延迟。

## WindowsCustody

WindowsCustody 用 Windows Job 的事实描述一次性命令、处置、保留、停止与冷恢复，并用 `INSTANCE` 精化契约的 [ProcessCustody.tla](../../execution-environment-contract/verification/models/ProcessCustody.tla)。精化成立时，契约模型的 T1 至 T10、I2、I8 与 L1 至 L3（编号见[契约的形式对照](../../execution-environment-contract/verification/formal-mapping.md)）在 Windows 机制上也成立。

目标配置 `WindowsCustody.cfg`：Job 里有锚进程持有句柄（`Anchor = TRUE`），移交时保留 `KILL_ON_JOB_CLOSE`（`ClearOnHandover = FALSE`），冷恢复只在创建它的登录会话与同一次启动里把「按名字打不开」当作已停止（`SessionAware = TRUE`）。模型保留 `ClearOnHandover` 与 `HandedAware` 两个常量，供负控与替代设计比较。

### 配置预期

| 配置                                               | 改动                                   | 预期                                                                                 |
| -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| `WindowsCustody.cfg`                               | 目标取值                               | 正控，没有违反，含精化 `Refines`                                                     |
| `WindowsCustody-live.cfg`                          | 目标取值，检查活性                     | 正控，没有违反                                                                       |
| `WindowsCustody-unsafe-noanchor.cfg`（N-W1）       | 没有锚，桥是唯一的句柄持有者           | 违反精化 `Refines`：桥死亡杀掉保留进程，契约模型里没有对应的停止                     |
| `WindowsCustody-unsafe-noanchor-clear.cfg`（N-W3） | 没有锚，移交时清除 `KILL_ON_JOB_CLOSE` | 违反 `StopTruth`：Job 的名字随最后一个句柄消失而成员仍在运行，「打不开」被当作已停止 |
| `WindowsCustody-unsafe-session.cfg`（N-W2）        | 别的登录会话里「打不开」也当作已停止   | 违反 `StopTruth`                                                                     |

规模上限：2 个命令、容量 1、1 次崩溃或重启、1 次桥死亡、2 个登录会话。

可达见证（目标配置必须违反）：挂起进程先于许可存在、保留执行域活着、保留执行域活过桥、异会话待处置、以「找不到」确认、以启动身份确认、重启后结清。

### 性质对应

ProcessCustody 的性质在 WindowsCustody 里同名重导出：T1 `NoLeak`、T2 `UniqueOwner`、T3 `OneDisposition`、T4 `StopTruth`、T5 `NoEntryAfterClose`、T5/T8 `ClosureTruth`、T6 `NoEviction`、T8 `SettleTruth`、T10 `KeepWhenPermitted`、I8 `ReservedFromAcq`、I2 `OwnerOnlyForward`、T7 `RetainedSurvivesRelease`、L1 至 L3。`Refines == PC!Init /\ [][PC!Next]_pcvars` 是精化本身。

Windows 专有：

| 名字                       | 命题                                                      | 守的不变式                 |
| -------------------------- | --------------------------------------------------------- | -------------------------- |
| W1 `UserCodeAfterPermit`   | `started ⇒ permitted`                                     | H-2                        |
| W2 `Reachable`             | 有成员或有锚的 Job 在命名空间里有名字，所以能被列出和停止 | H-5                        |
| W3 `MarkerCoversJob`       | 有成员或有锚的 Job 都有冷索引标记                         | H-6                        |
| W4 `NoRetainedKillOnClose` | 保留执行域从不因句柄关闭而失去成员                        | EX-7 在 Windows 上的机制面 |

### 变量映射

精化映射是恒等映射：ProcessCustody 的 19 个变量在 WindowsCustody 里同名、同义，账本层的步骤直接调用 `PC!` 的动作。Windows 机制另加 14 个变量，对 ProcessCustody 不可见。

| ProcessCustody 变量                                                                                              | 在 Windows 上的含义                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ph`、`own`、`kind`、`acqSt`、`closed`、`closureDone`、`resv`、`known`、`indexComplete`、`crashes`、五个 history | 与 PC 相同：TS 管理器与账本的状态。`kind` 恒为 `cmd`（本模型只建模一次性命令）                                                                   |
| `prim`                                                                                                           | 主进程对象存在：以 `CREATE_SUSPENDED` 创建后即为真，不论是否已 `ResumeThread`。挂起态与运行态的区别由 Windows 变量 `started` 表达                |
| `rp`、`ri`                                                                                                       | Job 内除主进程、锚之外的成员数。Windows 没有挂断，两类留下的进程行为相同，保留两类只为与 PC 同形                                                 |
| `out`                                                                                                            | 恒为 0：子进程以 `PROC_THREAD_ATTRIBUTE_JOB_LIST` 创建且不允许 breakaway，没有 `Escape` 动作。`Containment = "sealed"` 的实质在前提 P4，不在模型 |

| Windows 变量                                                      | 含义                                                                           | 对应的机制事实                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `started[u]`                                                      | 已发 GO（`ResumeThread`）                                                      | 用户代码开始执行                                               |
| `permitted[u]`                                                    | 账本 `permit` 答 `confirmed`                                                   | H-2 的证据                                                     |
| `bridge[u]`                                                       | `none`／`attached`（与提供者相连）／`orphan`（提供者已死，桥仍持句柄）／`dead` | 桥是 detached 独立进程，持有 Job 句柄                          |
| `anchor[u]`                                                       | Job 内的句柄持有者活着（只在 `Anchor = TRUE` 时为真）                          | 选定设计：Job 内锚进程，像 Linux 的门留在单元里                |
| `koc[u]`                                                          | Job 带 `KILL_ON_JOB_CLOSE`                                                     | 创建时设置；移交时按 `ClearOnHandover` 清除                    |
| `marker[u]`                                                       | 冷索引标记：`none`／`cmd`／`handed`                                            | 状态目录里的标记文件，记 Job 名、启动身份、会话号；移交后更新  |
| `sessAt[u]`                                                       | 标记记下的登录会话                                                             | `Local\` 命名对象按会话隔离                                    |
| `stale[u]`                                                        | 标记的启动身份与当前不同                                                       | 重启后为真。启动身份取 `BootTime − BootTimeBias`，校时不改变它 |
| `curSess`                                                         | 当前提供者实例所在的登录会话                                                   | 只在 `Recover`（新实例）时可变                                 |
| `rebooting`                                                       | 机器正在关机，进程逐个死亡，无人观察                                           | 重启的串行化                                                   |
| `bridgeDeaths`                                                    | 桥死亡计数                                                                     | 由 `MaxBridgeDeath` 限界                                       |
| `retainedKilledByClose`、`confirmedByAbsence`、`confirmedByStale` | history                                                                        | 分别支持 W4 与两个可达见证                                     |

派生定义：

- `Live(u) == PC!Live(u)`：主进程（含挂起）或留下的进程活着。锚不算成员。
- `Held(u)`：桥（相连或孤儿）持有句柄。`Named(u) == Held(u) \/ anchor[u]`：命名空间里还有这个名字。
- `Openable(u) == Named(u) /\ sessAt[u] = curSess /\ ~stale[u]`：当前实例 `OpenJobObjectW` 能打开它。
- `Addressable(u) == bridge[u] = "attached" \/ Openable(u)`：提供者能作用于这个 Job。

### 动作映射

「PC 步骤」列写每个 Windows 动作对应 ProcessCustody 的哪个动作；`stutter` 表示只改 Windows 变量，PC 的变量不动。「实现的步骤」一列是实现必须沿用的步骤边界，括号里是承担它的代码位置，路径相对本包的 `src/windows-execution/`；实现改动这些位置时同步本表。

| Windows 动作                              | PC 步骤                                                                                                                 | 实现的步骤（代码位置）                                                                                                                                                                                                                                                               | 说明                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `PlanAcq(u)`                              | `PlanAcq(u, "cmd")`                                                                                                     | TS `start`：`ledger.plan`（`index.ts` `start`）                                                                                                                                                                                                                                      | 不变                                                                                                                      |
| `WriteMarker(u)`                          | stutter                                                                                                                 | TS：`jobs.record` 写冷索引标记并刷盘，在 `launch` 之前（`index.ts` `start`；`recovery.ts`；存取在 `cold-index.ts`）                                                                                                                                                                  | 先于任何 OS 对象。记 Job 名、启动身份、会话号                                                                             |
| `CreateSuspendedInJob(u)`                 | `Launch(u)`                                                                                                             | 桥 `Prepare`：`CreateJobObjectW` + `SetInformationJobObject(KILL_ON_JOB_CLOSE)` + `StartAnchor`（锚继承 Job 句柄）+ `CreateProcessW(CREATE_SUSPENDED, JOB_LIST)`（`native-source.ts` `Prepare`、`StartAnchor`）                                                                      | 首个外部效果。PC 的 `Launch` 守卫 `Permit(u)` 对应管理器的 `sealed` 检查，不是账本 `permit`。`prim` 变真但 `started` 为假 |
| `Permit(u)`                               | stutter                                                                                                                 | TS：`ledger.permit` 答 `confirmed`（`index.ts` `launch`）                                                                                                                                                                                                                            | 记 `permitted`                                                                                                            |
| `PermitGo(u)`                             | stutter                                                                                                                 | TS 发 `go`；桥 `ResumeThread`（`Run` 的 `go` 分支）                                                                                                                                                                                                                                  | 用户代码开始。W1 要求 `permitted` 在前                                                                                    |
| `ForkPlain`、`ForkImmune`、`RestExit`     | 同名                                                                                                                    | 命令自己的进程                                                                                                                                                                                                                                                                       | 挂起的主进程不能派生                                                                                                      |
| `MainExit(u)`                             | `PrimExit(u)`                                                                                                           | 桥 waiter 线程 `WaitForSingleObject(child)`、`AwaitQuiet` 后以 `Members()` 发 `exit` 帧；TS `exited` 记退出（`Run` 的 waiter；`index.ts` `exited`）                                                                                                                                  | waiter 不终止 Job，处置由 TS 决定。                                                                                       |
| `Dispose(u)`                              | `Dispose(u)`                                                                                                            | TS 共用 `decideDisposition`（`command-custody.ts`；`command-custody-steps.ts` `dispose`）                                                                                                                                                                                            | 不变                                                                                                                      |
| `Commit(u)`                               | `Commit(u)`                                                                                                             | TS：保留进程账本 `adopt` 答 `confirmed`，同一同步步骤里改归属（`command-custody-steps.ts` `apply`；`index.ts` `enterIndex`）                                                                                                                                                         | 不变                                                                                                                      |
| `Abort(u)`                                | `Abort(u)`                                                                                                              | TS：作废预留                                                                                                                                                                                                                                                                         | 不变                                                                                                                      |
| `WriteMarkerHanded(u)`                    | stutter                                                                                                                 | TS：保留进程索引 `commit` 写下索引自己的标记；写成之后删去冷索引标记（`index.ts` `enterIndex`）。实现用两份标记表达模型里一份标记的 `cmd → handed`，任一时刻至少一份在。两份都在时（索引的标记后来才补写成），索引持有这个键，原引用的 `recover` 答 `pending`，等同模型里的 `handed` | 顺序受 `MarkerFirst` 控制                                                                                                 |
| `ClearKillOnClose(u)`                     | stutter                                                                                                                 | 桥或恢复桥：`SetInformationJobObject` 去掉 `KILL_ON_JOB_CLOSE`                                                                                                                                                                                                                       | 需要句柄：`Addressable(u)`                                                                                                |
| `Stop(u)`                                 | `Stop(u)`                                                                                                               | TS：句柄 `stop('forced')`（`index.ts` `stopHandle` → `forceStop`，归属判断在 `command-custody-steps.ts` `ownsForStop`）、保留进程扩展的 `stop`                                                                                                                                       | 不变                                                                                                                      |
| `TerminateJob(u)`                         | `Live(u)` 时 `Kill(u)`，否则 stutter                                                                                    | 桥 `Stop()` 的 `TerminateJobObject`；或恢复桥 `OpenJobObjectW` 后 `TerminateJobObject`（`Run` 的 `recover` 分支）                                                                                                                                                                    | 连锚一起杀                                                                                                                |
| `ConfirmObserved(u)`                      | `Confirm(u)`                                                                                                            | 桥或恢复桥 `QueryInformationJobObject` 读到 `active == 0`；TS 记 `stopped`，删标记                                                                                                                                                                                                   | 读数来自 Job 本身，经句柄                                                                                                 |
| `ConfirmNotFound(u)`                      | 应为 `Confirm(u)`；模型直接写 `ph'`，让 TLC 能查出证据为假的情形                                                        | 恢复桥 `OpenJobObjectW` 失败；TS 按全化表答 `confirmedStopped`。`HandedAware`：保留进程索引持有这个键或标记读不全时先答 `pending`（`host-provider.ts` `recover`）。`SessionAware`：会话取自冷标记、索引单元或终端引用                                                                | 守卫按 `SessionAware`、`HandedAware` 收紧                                                                                 |
| `ConfirmStale(u)`                         | 同上                                                                                                                    | TS：标记的启动身份不是当前的，答 `confirmedStopped`                                                                                                                                                                                                                                  | 重启已杀光一切                                                                                                            |
| `Drain(u)`                                | `Drain(u)`                                                                                                              | 共用索引 `maintain()` 经 `windowsRetainedSupervision` 按名读 Job 成员，只剩锚时停止                                                                                                                                                                                                  | 需要 `Addressable(u)`                                                                                                     |
| `Release`、`DrainSweep`、`Settle`         | 同名                                                                                                                    | 责任域排空：`stopAll`、冷恢复 `listRecoveryResources`／`recover`、结清                                                                                                                                                                                                               | 不变                                                                                                                      |
| `CloseScope`、`CloseSweep`、`ClosureDone` | 同名                                                                                                                    | 保留范围封闭信号、索引停止全部保留进程、完成报告                                                                                                                                                                                                                                     | 不变                                                                                                                      |
| `BridgeDies(u)`                           | 目标取值下：`ph = "running"` 且桥相连且 `known` 时 `Stop(u)`；否则 stutter。无锚且 `koc` 时成员全死，不对应任何 PC 步骤 | 桥进程崩溃或被杀；内核关闭其 Job 句柄；TS `onClosed` → `end` → `forceStop` → `issueStop` 经 `stopWindowsJob` 按名字停止；就绪之后名字不存在算确认（`index.ts`）                                                                                                                      | 只在 GO 之后建模                                                                                                          |
| `Crash`                                   | `Crash`                                                                                                                 | 提供者进程崩溃或换代                                                                                                                                                                                                                                                                 | 桥变孤儿，Job 仍在                                                                                                        |
| `Recover`                                 | `Recover`                                                                                                               | 新实例读账本与全部标记                                                                                                                                                                                                                                                               | 另选 `curSess`：新实例可能在别的登录会话                                                                                  |
| `Reboot`                                  | `Crash`                                                                                                                 | 机器重启                                                                                                                                                                                                                                                                             | 之后只允许 `RebootKill` 与 `BootUp`                                                                                       |
| `RebootKill(u)`                           | `PrimExit(u)` 或 `RestExitStep(u)`                                                                                      | 进程随关机死亡                                                                                                                                                                                                                                                                       | `known` 全假，所以 `ph` 不变                                                                                              |
| `BootUp`                                  | stutter                                                                                                                 | 机器起来：桥全死、锚全死、全部标记变陈旧                                                                                                                                                                                                                                             | 重启在模型里串行化为崩溃、进程逐个死亡、再启动三步，无人观察其间的退出                                                    |

ProcessCustody 有而本模型没有的动作：`PlanAcq(u, "term")`、`PlanRet`（终端不在本模型）、`Refuse`（Windows 的许可拒绝只因获取在排空，而排空的 `Release` 已把它扫走；账本答 `unavailable` 的拒绝 PC 也没有）、`Escape`（封闭收纳）、`Expire`（SPEC 没有这项配置）。精化允许少。

### 前提与未覆盖

只建模命令，不建模终端与多份获取。锚进程自身崩溃、GO 之前的启动失败、账本答 `unavailable` 或 `adopt` 结果未知、优雅停止与输出尾部都不在模型里。撤除顺序（宿主文件插件卸载与服务卸载并发时，同一个提供者只退役一次，全部租约都失效，待处置时调用方直接调用的撤除函数不以正常返回报告完成）没有模型。
