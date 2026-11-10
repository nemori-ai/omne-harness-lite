# verification/models

本目录承载本包的形式模型，例如 TLA+、Alloy 或 SMT 模型。

## 允许的内容

模型源文件、配置与说明。

## 边界

说明模型对应的 `SPEC.md` 性质、抽象前提与未覆盖的部分。模型通过不等于实现符合。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。

## 本包事实

### FilesHelper

[FilesHelper.tla](FilesHelper.tla) 描述 Windows 文件后端的常驻文件辅助进程：辅助进程的化身与重启、请求的排队与在途、答复帧、每请求超时、所有者的封闭与排空。对应 SPEC 的 [Windows 文件后端](../../SPEC.md#windows-文件后端未接受)「失败」一段与 [宿主文件责任域](../../SPEC.md#宿主文件责任域)的封闭与排空。

状态：未接受。模型的动作名是实现必须沿用的步骤边界。实现改动这些步骤时，在本节记下每个动作对应的文件与函数，以及最后一次确认一致的提交。

性质：

| 名字                      | 命题                                                         | 负控配置                                                                                      |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `P1_NoAnswerWithoutFrame` | 没有收到完整答复帧的请求不答完成或拒绝                       | `FilesHelper-unsafe-p1.cfg`：半帧被当作完整帧                                                 |
| `P2_ExitAnswersUnknown`   | 辅助进程退出时，已经写给它、没有答复的请求答未知             | `FilesHelper-unsafe-p2.cfg`：退出时答拒绝                                                     |
| `P3_NoDispatchAfterSeal`  | 所有者封闭之后，它的请求不发给辅助进程                       | `FilesHelper-unsafe-p3.cfg`：排队中的请求在封闭后被发出                                       |
| `P4_InFlightBounded`      | 在途数不超过上限                                             | `FilesHelper-unsafe-p4.cfg`                                                                   |
| `P5_SingleAnswer`         | 每个请求只有一个最终答复，迟到的帧不改写它                   | `FilesHelper-unsafe-p5.cfg`（重复帧）、`FilesHelper-unsafe-p5-late.cfg`（已退出进程的迟到帧） |
| `P6_SettledIsQuiet`       | 所有者结清时，辅助进程里没有它的请求还在执行                 | `FilesHelper-unsafe-p6.cfg`：超时只答一个请求而不停止进程                                     |
| 活性 L1、L2               | 弱公平下，每个准入的请求最终得到答复，辅助进程退出之后会重启 | `FilesHelper-unsafe-l.cfg`：退出之后不重启                                                    |

规模上限：`FilesHelper.cfg` 与 `FilesHelper-live.cfg` 是 2 个所有者、3 个请求、在途上限 2、至多 2 次故障。`FilesHelper-faults3.cfg`（3 次故障）与 `FilesHelper-req4.cfg`（4 个请求）只检查安全性质。

实现与动作的对应（最后一次确认一致的是本节所在提交）：`src/windows-files/helper.ts` 的 `request` 对应 Enqueue，`pump` 对应 Dispatch、Start 与 Restart，`received` 对应 StartOk 与 ReceiveFrame，`startFailed` 对应 StartFail，`expired` 对应 RequestTimeout，`invalidate` 对应 Terminate 的宿主一侧，`exited` 对应 HelperExit。Admit 对应门面准入（`src/host-domain.ts` 的 `trackedFacade` 与 `src/host-files.ts` 的 `unlessSealed`），Seal、DrainTimeout 与 Settle 对应责任域的排空。

与模型的差别：模型在 Enqueue、Dispatch 与 Seal 里对排队中的请求再查一次封闭，答 `closed`。实现不在辅助进程里查封闭，这两步的封闭检查由门面准入对应：封住之后新操作在准入处答 `closed`，已经准入的请求照常做完。所以 `P3_NoDispatchAfterSeal` 在实现上只对封闭之后才准入的请求成立；准入之后、发送之前遇到封闭的请求仍会发给辅助进程。H-12 由门面准入与排空守住：排空等全部已准入的操作结束才结清，所以 `P6_SettledIsQuiet` 仍然成立。模型里 `Bug = "P3"` 去掉的正是这三处检查：2026-11-10 用 `FilesHelper.cfg` 的规模（`MaxFaults = 2`）、`Bug = "P3"`，检查除 P3 之外的安全性质与 `P5_FinalStable`，TLC 退出 0，9,334,976 个不同状态；这份配置只在任务目录里运行，不在本目录。依据：引擎没有「所有者已结清」以外可接的封闭事实，而接到引擎封闭会使已准入的多步写入与批次在封闭之后的暂存清理答 `closed`。

前提与未覆盖：帧按任意次序读到，比真实管道的交错更多，所以安全性质的结论仍然成立。下列内容不在模型里：编号属于另一个未答复请求的错帧、帧内容是否正确、句柄的寿命、跨所有者的公平排队、队列的上界、`maintain()`、冷恢复与延迟。

运行（在本目录，JDK 21 与 tla2tools 1.7.4，JAR 的 SHA-256 与 [契约的运行记录](../../../execution-environment-contract/verification/formal-runs.md)相同）：

```sh
java -XX:+UseParallelGC -cp <tla2tools.jar> tlc2.TLC -workers 6 -deadlock -metadir <临时目录> -config <配置>.cfg FilesHelper.tla
```

`-deadlock` 关闭死锁检查，因为全部请求得到答复之后模型停止。判读：正控 TLC 退出 0 且没有报告违反；负控报告的违反是上表所列的那一条性质。

运行记录：2026-11-10，Windows 11 build 26300，JDK 21.0.13。`FilesHelper.cfg` 退出 0，2,222,652 个不同状态；`FilesHelper-live.cfg` 退出 0；`FilesHelper-faults3.cfg` 退出 0，13,450,136 个不同状态；`FilesHelper-req4.cfg` 退出 0，44,249,149 个不同状态。七个安全性质的负控各报告对应的违反，`FilesHelper-unsafe-l.cfg` 报告活性违反。

### WindowsCustody

[WindowsCustody.tla](WindowsCustody.tla) 用 Windows Job 的事实描述一次性命令、处置、保留、停止与冷恢复，并用 `INSTANCE` 精化契约的 [ProcessCustody.tla](../../../execution-environment-contract/verification/models/ProcessCustody.tla)。精化成立时，契约模型的 T1～T10、I2、I8 与 L1～L3 在 Windows 机制上也成立。对应 SPEC 的 [Windows 的兑现](../../SPEC.md#windows-的兑现未接受)。变量与动作的对应见 [WindowsCustody-mapping.md](WindowsCustody-mapping.md)。

状态：未接受。实现改动模型对应的步骤时，同步 [WindowsCustody-mapping.md](WindowsCustody-mapping.md)。

目标配置（`WindowsCustody.cfg`）：Job 里有锚进程持有句柄（`Anchor = TRUE`），移交时保留 `KILL_ON_JOB_CLOSE`（`ClearOnHandover = FALSE`），冷恢复只在创建它的登录会话与同一次启动里把「按名字打不开」当作已停止（`SessionAware = TRUE`）。

Windows 专有的性质：

| 名字                    | 命题                                                      |
| ----------------------- | --------------------------------------------------------- |
| `UserCodeAfterPermit`   | 用户代码只在账本许可确认之后开始执行                      |
| `Reachable`             | 有成员或有锚的 Job 在命名空间里有名字，所以能被列出和停止 |
| `MarkerCoversJob`       | 有成员或有锚的 Job 都有冷索引标记                         |
| `NoRetainedKillOnClose` | 保留执行域从不因句柄关闭而失去成员                        |

负控：

| 配置                                               | 改动                                   | 违反                                                                            |
| -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `WindowsCustody-unsafe-noanchor.cfg`（N-W1）       | 没有锚，桥是唯一的句柄持有者           | 精化 `Refines`：桥死亡杀掉保留进程，契约模型里没有对应的停止                    |
| `WindowsCustody-unsafe-noanchor-clear.cfg`（N-W3） | 没有锚，移交时清除 `KILL_ON_JOB_CLOSE` | `StopTruth`：Job 的名字随最后一个句柄消失而成员仍在运行，「打不开」被当作已停止 |
| `WindowsCustody-unsafe-session.cfg`（N-W2）        | 别的登录会话里「打不开」也当作已停止   | `StopTruth`                                                                     |

`Never` 开头的算子是可达见证。运行脚本从 `WindowsCustody.cfg` 为每个见证生成一个配置，见证被违反才说明对应的状态可达，性质不是空洞成立。

规模上限：2 个命令、容量 1、1 次崩溃或重启、1 次桥死亡、2 个登录会话。

前提与未覆盖：只建模命令，不建模终端与多份获取；锚进程自身崩溃、GO 之前的启动失败、账本答 `unavailable` 或 `adopt` 结果未知、优雅停止与输出尾部都不在模型里。

运行：[run-tlc.sh](run-tlc.sh) 运行本目录全部配置与见证。它把契约成员的 `ProcessCustody.tla` 复制到临时工作目录，不在本目录另存一份。

```sh
TLA2TOOLS_JAR=<tla2tools.jar> TLC_WORKERS=8 bash run-tlc.sh <输出目录>
```

运行记录：2026-11-10，Windows 11 build 26300，JDK 21.0.13，tla2tools 1.7.4。`run-tlc.sh` 退出 0，`failures=0`：两个模型的全部正控、负控与 7 个可达见证都符合预期。`WindowsCustody.cfg` 319,330 个不同状态，`WindowsCustody-live.cfg` 31,156 个。

另一个候选性质是撤除顺序：宿主文件插件卸载与服务卸载并发时，同一个提供者只退役一次，全部租约都失效，待处置时调用方直接调用的撤除函数不以正常返回报告完成。它还没有模型。
