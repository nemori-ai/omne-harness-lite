# verification/models

本目录承载本包的形式模型，例如 TLA+、Alloy 或 SMT 模型。

## 允许的内容

模型源文件、配置与说明。

## 边界

说明模型对应的 `SPEC.md` 条款、抽象前提与未覆盖的部分。模型通过不等于实现符合。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。

## 本包事实

本目录有两个 TLA+ 模型。ProcessCustody 对应的 SPEC 条款标「未实现」，模型说明的是目标语义。TerminalSegments 对应的条款已由宿主提供者在 Linux 上兑现。性质与条款的逐条对应、规模上限与前提见 [formal-mapping.md](../formal-mapping.md)。获取、受管资源与设施请求的其他状态转移写在[对象模型](../../docs/object-model.md#生命周期)，没有模型。

### ProcessCustody

[ProcessCustody.tla](ProcessCustody.tla) 建模一份获取 A 与它可选的一个保留范围 R，以及若干执行域。执行域是 systemd 用户 scope 或 Windows Job，里面有一个主进程（命令或 shell）和留下的进程。留下的进程分普通的（挂断即退出）与免挂断的（`nohup`、`setsid`）。归属方是承担停止责任的账本：`acq`（A）或 `ret`（R）。模型含崩溃与冷恢复。

常量：

| 常量 | 含义 | 目标取值 | 负控取值 |
| --- | --- | --- | --- |
| `Units` | 可记账的执行域 | — | — |
| `Cap` | R 的保留容量 | — | — |
| `MaxRest` | 一个执行域里每种留下的进程的上界 | — | — |
| `MaxCrash` | 提供者崩溃次数的上界 | — | — |
| `Bound` | A 带保留范围 R | — | — |
| `Containment` | 收纳方式 | `sealed` | `pgroup`（只按进程组收纳） |
| `Policy` | 处置策略 | `retain` | `stop`（现行宿主行为）、`hangup`（先挂断，只留挺过挂断的） |
| `RecheckClosed` | 移交提交时复核范围未封闭 | `TRUE` | `FALSE` |
| `RecheckPhase` | 移交提交时复核执行域仍待处置 | `TRUE` | `FALSE` |
| `EvictOldest` | 满额时停最旧的保留执行域 | `FALSE` | `TRUE` |
| `HonestEnum` | 枚举读不全时不前进 | `TRUE` | `FALSE`（任意子集都当作完整） |

配置：

| 配置 | 类别 | 常量 | 检查的性质 |
| --- | --- | --- | --- |
| `ProcessCustody.cfg` | 正控 | 2 个执行域，`Cap = 1`，`MaxRest = 1`，`MaxCrash = 1`，`Bound = TRUE`，其余取目标值 | 全部安全性质与两条步骤性质 |
| `ProcessCustody-unbound.cfg` | 正控 | 同上，`Bound = FALSE` | 同上 |
| `ProcessCustody-live.cfg` | 正控（活性） | 同上，`MaxCrash = 0`，弱公平 | `ClosureEnds`、`ReleaseEnds`、`RetainedSettles` |
| `ProcessCustody-inductive.cfg` | 正控（归纳性） | 1 个执行域；初始状态是满足 `IndInv` 的全部状态 | 走一步后 `IndInv` 仍成立 |
| `ProcessCustody-unsafe-stop.cfg` | 负控 N1 | `Policy = "stop"` | 应违反 `KeepWhenPermitted` |
| `ProcessCustody-unsafe-pgroup.cfg` | 负控 N2 | `Containment = "pgroup"` | 应违反 `NoLeak` |
| `ProcessCustody-unsafe-evict.cfg` | 负控 N3 | `EvictOldest = TRUE` | 应违反 `NoEviction` |
| `ProcessCustody-unsafe-enum.cfg` | 负控 N4 | `HonestEnum = FALSE` | 应违反 `ClosureTruth` 或 `SettleTruth` |
| `ProcessCustody-unsafe-enum-closure.cfg` | 负控 N4b | `HonestEnum = FALSE` | 应违反 `ClosureTruth`（只查封闭一侧） |
| `ProcessCustody-unsafe-commit-closed.cfg` | 负控 N5 | `RecheckClosed = FALSE` | 应违反 `NoEntryAfterClose` |
| `ProcessCustody-unsafe-commit-phase.cfg` | 负控 N6 | `RecheckPhase = FALSE` | 应违反 `OneDisposition` |
| `ProcessCustody-unsafe-hangup.cfg` | 负控 N10 | `Policy = "hangup"` | 应违反 `KeepWhenPermitted` |

可达见证是模型里以 `Never` 开头的七个算子：保留执行域活着、保留执行域活过获取、保留执行域自行结清、崩溃后封闭完成、崩溃后获取结清、满额走停止、保留终端随封闭停止。

### TerminalSegments

[TerminalSegments.tla](TerminalSegments.tla) 建模一个持久终端里依次运行的 K 段。段 k 的前台进程向 PTY 写字节，后台进程在任何时刻写字节。内核为每个 PTY 保持一个有序缓冲，但字节写入之后要过一段时间才能在 master 端读到。控制 FIFO 在前台进程退出后带来本段的结束帧。

常量：

| 常量 | 含义 | 目标取值 | 负控取值 |
| --- | --- | --- | --- |
| `K` | 段数 | — | — |
| `MaxFg`、`MaxBg` | 前台与后台各写的字节数上界 | — | — |
| `Drain` | 交出段结果之前怎样读 PTY | `sentinel`（读到段尾哨兵） | `eagain`（读到暂时无数据，现行宿主行为） |
| `Completion` | 怎样判段完成 | `control`（控制通道的结束帧） | `quiet`（静默） |
| `InvalidateOnExtra` | 段结束时有额外进程就使终端失效 | `FALSE` | `TRUE`（现行宿主行为） |

配置：

| 配置 | 类别 | 常量 | 检查的性质 |
| --- | --- | --- | --- |
| `TerminalSegments.cfg` | 正控 | `K = 2`，`MaxFg = 2`，`MaxBg = 2`，其余取目标值 | `CompletionTruth`、`FgInSegment`、`Monotone`、`NothingLost`、`StaysValid`、`OneSegment` |
| `TerminalSegments-unsafe-eagain.cfg` | 负控 N7 | `Drain = "eagain"` | 应违反 `FgInSegment` |
| `TerminalSegments-unsafe-quiet.cfg` | 负控 N8 | `Completion = "quiet"` | 应违反 `CompletionTruth` |
| `TerminalSegments-unsafe-invalidate.cfg` | 负控 N9 | `InvalidateOnExtra = TRUE` | 应违反 `StaysValid` |

可达见证是模型里以 `Never` 开头的四个算子：后台字节进段内、段间字节、两段都完成、第二段的前台字节。

### 判读

[run-tlc.sh](run-tlc.sh) 把每个配置的结果写成 `summary.txt` 的一行，`ok=yes` 表示符合预期：

- 正控：TLC 退出 0，并且没有报告违反。
- 负控：TLC 报告违反的性质是配置文件 `INVARIANT` 一行所列性质之一。TLC 非零退出本身不算符合预期。
- 可达见证：脚本为每个 `Never` 算子生成一个配置，常量取同名模块的目标配置，只检查这一个算子。TLC 报告违反它才算符合预期，表示对应的状态可达，目标性质不是空洞成立。

最后一行是 `failures=<n>`。`n` 为 0 时脚本退出 0。
