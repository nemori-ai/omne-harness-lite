# 进程归属与终端段模型的规模上限与映射

本页说明 [ProcessCustody.tla](models/ProcessCustody.tla) 与 [TerminalSegments.tla](models/TerminalSegments.tla) 怎样对应本包 [SPEC](../SPEC.md) 的条款，模型在什么规模上限内检查，依赖哪些前提，以及哪些实现与模型动作对应。运行记录见 [formal-runs.md](formal-runs.md)，配置与判读规则见 [models/README.md](models/README.md)。

## 结论的边界

TLC 对有限状态做穷举。本页的任何结论只在下文的规模上限与抽象之内成立。模型通过不表示语义在任意规模下成立，也不表示实现符合模型。

证据分五种，分别陈述，互不代替：

| 证据 | 能支持的结论 |
| --- | --- |
| 正控（TLC 完成且没有违反） | 在所列配置的全部可达状态中，所列性质都成立 |
| 归纳性检查 | 从满足 `IndInv` 的每个状态走一步，`IndInv` 仍成立。只覆盖 1 个执行域 |
| 负控（故意改坏的配置） | 所列性质能检出对应的错误，并给出反例轨迹 |
| 可达见证 | 性质涉及的状态确实可达，性质不是空洞成立 |
| 手写证明 | [proofs/](proofs/README.md) 对不变式做动作归纳，推广到任意有限的执行域数。它不是机器检查的证明 |

## 规模上限

| 配置 | 执行域 | 容量 | 每种留下的进程 | 崩溃 | 保留范围 | 其他 |
| --- | --- | --- | --- | --- | --- | --- |
| `ProcessCustody` | 2 | 1 | 1 | 1 | 有 | — |
| `ProcessCustody-unbound` | 2 | 1 | 1 | 1 | 无 | — |
| `ProcessCustody-live` | 2 | 1 | 1 | 0 | 有 | 弱公平 |
| `ProcessCustody-inductive` | 1 | 1 | 1 | 1 | 有 | 初始状态是满足 `IndInv` 的全部状态 |
| `TerminalSegments` | — | — | — | — | — | 2 段；每段前台至多写 2 字节，后台在整次运行中共写 2 字节 |

只有一份获取与一个保留范围。两个获取共用一个保留范围、多个保留范围、租户之间的隔离都不在模型里。

## 性质与条款

ProcessCustody 的性质。「编号」一列是本页给每条性质的名字，命题在同一行：T 开头的是定理，I 开头的是不变式，L 开头的是活性。括号里的 I 编号是支持该定理的不变式。[proofs/process-custody.md](proofs/process-custody.md) 按同一编号引用，它的「不变式」与「定理」两节给出 I1 至 I8 与 T3、T5、T8 的证明。

| 模型中的名字 | 编号 | 命题 | SPEC 条款 | 违反的后果 | 守卫（负控） |
| --- | --- | --- | --- | --- | --- |
| `NoLeak` | T1 | 平台满足封闭收纳时，没有进程活在所有执行域之外 | [收纳](../SPEC.md#收纳) | 留下的进程失去归属，没有人能列出或停止它 | N2（`pgroup`） |
| `UniqueOwner` | T2（I1、I3、I4） | 每个活着的执行域恰有一个归属方，且该归属方没有结束责任 | [一次性命令留下的进程](../SPEC.md#一次性命令留下的进程)首段 | 活着的进程没有人负责 | 由 I1、I3、I4 的证明支持 |
| `OneDisposition` | T3 | 主进程退出后，执行域或者被停止，或者被移交，不会两者都发生 | [移交](../SPEC.md#移交)第 2、3 项 | 一个执行域既被停止又被保留，`residue` 与实际不符 | N6（提交不复核阶段） |
| `StopTruth` | T4（I4） | 报告已停的执行域里没有活进程 | [停止](../SPEC.md#停止)第 5 项；[保留进程的恢复](../SPEC.md#保留进程的恢复) | 未停的进程被当作已停，责任被提前解除 | 由 I4 的证明支持 |
| `NoEntryAfterClose` | T5（I5） | 范围封闭之后，没有执行域进入该范围 | [移交](../SPEC.md#移交)第 2 项 | 保留范围封闭之后仍有进程被保留下来，无人收尾 | N5（提交不复核封闭） |
| `ClosureTruth` | T5、T8 | 报告封闭完成时，该范围名下的执行域都已停止 | [保留进程的恢复](../SPEC.md#保留进程的恢复)；[恢复](../SPEC.md#恢复) | 封闭完成却仍有保留进程活着 | N4b（枚举不全当完整，只查封闭一侧） |
| `NoEviction` | T6（I7） | 占用不超过容量；容量不足从不停止已保留的执行域 | [容量](../SPEC.md#容量) | 新的保留挤掉旧的保留进程 | N3（满额停最旧的） |
| `SettleTruth` | T8 | 报告获取结清时，该获取名下的执行域都已停止 | [恢复](../SPEC.md#恢复) | 崩溃后获取结清，但它名下仍有进程活着 | N4 |
| `KeepWhenPermitted` | T10 | 可以保留且有留下的进程时，处置不停止它们 | [处置](../SPEC.md#处置) | 调用方用 `&` 起的服务在下一次调用前就被停止 | N1（全部停止）、N10（先挂断） |
| `ReservedFromAcq` | I8 | 预留中的执行域仍归获取，且是命令执行域 | [移交](../SPEC.md#移交)第 1 项 | 终端或已移交的执行域被再次移交 | 由 I8 的证明支持 |
| `OwnerOnlyForward`（步骤性质） | I2 | 归属只能从未定义改为某一方，或从获取改为保留范围（TLC 检查）。只经移交提交这一点由[证明](proofs/process-custody.md#不变式)给出，TLC 不检查是哪个动作改的 | [移交](../SPEC.md#移交) | 保留进程被改回获取，随获取释放而停止 | 由 I2 的证明支持 |
| `RetainedSurvivesRelease`（步骤性质） | T7（I6） | 获取的释放、排空与结清不改变保留执行域的阶段 | [移交](../SPEC.md#移交)第 3 项之后一段 | 释放获取时停掉了已经移交的进程 | 由 I6 的证明支持 |
| `ClosureEnds`（活性） | L1 | 范围封闭之后，名下的执行域最终都停止 | [保留进程的恢复](../SPEC.md#保留进程的恢复) | 封闭永远完成不了 | — |
| `ReleaseEnds`（活性） | L2 | 获取开始排空之后，最终结清 | [获取与租约](../SPEC.md#获取与租约)的释放 | 获取永远结清不了 | — |
| `RetainedSettles`（活性） | L3 | 保留执行域的进程全部退出之后，它最终结清 | [移交](../SPEC.md#移交)第 3 项之后一段 | 空的保留执行域一直占着名额 | — |

T9（租户隔离：`stop` 与 `list` 只作用于本范围）不在模型里。它由守卫中的归属核对承担，用契约用例验证。

TerminalSegments 的性质。S1 至 S5 是本页给每条性质的名字，命题在同一行：

| 模型中的名字 | 编号 | 命题 | SPEC 条款 | 违反的后果 | 守卫（负控） |
| --- | --- | --- | --- | --- | --- |
| `CompletionTruth` | S1 | 报告完成的段，前台进程已经退出 | [终端段的完成与字节归属](../SPEC.md#终端段的完成与字节归属)第 1 项 | 前台还在运行就报告完成 | N8（静默即完成） |
| `FgInSegment` | S2 | 前台进程写出的每个字节都归本段 | 同节第 3 项 | 本段输出缺最后几个字节，它们落进下一段 | N7（读到暂时无数据即交出） |
| `Monotone`、`NothingLost` | S3 | 每个读出的字节恰有一个归属，归属沿读出次序单调；没有字节丢失 | 同节第 3、4 项 | 字节被重复归属、乱序或丢失 | 由正控支持 |
| `StaysValid` | S4 | 后台写入不使终端失效 | 同节第 2 项 | `cmd &` 之后终端不可用 | N9（多出进程即失效） |
| `OneSegment` | S5 | 一个终端同时只有一段在运行 | [保留终端](../SPEC.md#保留终端)的 `execute` | 两段输出交错 | 由正控支持 |

## 动作对应

模型的动作与 SPEC 中的操作：

| 数学模型的动作 | TLA+ 动作 | SPEC 中的操作或事件 |
| --- | --- | --- |
| Plan | `PlanAcq`、`PlanRet` | 账本 `plan`；保留终端在首个异步等待前预留 |
| Launch、Refuse | `Launch`、`Refuse` | 账本 `permit` 之后发出首个外部效果；许可不成立时记停止 |
| Fork、Escape、RestExit | `ForkPlain`、`ForkImmune`、`Escape`、`RestExit` | 命令自己派生与退出进程。`Escape` 只在 `Containment = "pgroup"` 时可用 |
| PrimExit | `PrimExit` | 主进程退出；终端的 shell 死亡使终端失效 |
| Dispose | `Dispose` | [处置](../SPEC.md#处置) |
| Commit、Abort | `Commit`、`Abort` | [移交](../SPEC.md#移交)第 2、3 项 |
| Stop、Kill、Confirm | `Stop`、`Kill`、`Confirm` | 命令设施的停止；终端 `close`；保留进程的 `stop`；监督者确认 |
| Drain | `Drain` | 保留执行域的进程全部自行退出后结清 |
| Expire | `Expire` | 无人值守期限。SPEC 现在没有这项配置 |
| Release | `Release`、`DrainSweep` | 获取的释放与排空。`DrainSweep` 处理崩溃后由恢复放回内存的执行域 |
| Settle | `Settle` | 获取结清 |
| CloseScope | `CloseScope`、`CloseSweep`、`ClosureDone` | `releaseScope` 的封闭信号、回收与完成报告 |
| Crash、Recover | `Crash`、`Recover` | 提供者崩溃或换代；冷恢复的枚举 |

## 前提

下列前提不由模型或证明保证，由实现与测试维护：

- P1：账本 `plan` 先于首个外部效果，并且耐久。
- P2：同一执行域上的处置、移交提交、作废、停止、释放与封闭在一个共同顺序内判定。
- P3：监督者的读数真实反映执行域的活进程。
- P4：平台满足封闭收纳；不满足时，提供者不声称保留与完整停止。
- P5：控制通道与哨兵不被同一用户的恶意进程伪造。宿主提供者不声称同一用户之间的隔离。
- P6：提供者在 `adopt` 确认之后把执行域写入耐久索引，并且只在读全耐久索引时列出保留进程或推进恢复。模型的 `Recover` 对应读全耐久索引，模型里已移交的执行域都可被认回。

SPEC [保留进程的恢复](../SPEC.md#保留进程的恢复)的已知限制所写的崩溃窗口不满足 P6：`adopt` 确认之后、写入耐久索引之前提供者崩溃，或者提供者写不成耐久索引时，这个执行域不在耐久索引里，`Recover` 认不回它。窗口内的执行域不被列为保留进程，也不自行结清，只经请求方作用域的恢复结束。

各平台怎样满足 P3、P4 与冷索引、活过提供者崩溃、变空通知这几项原语，归宿主提供者的 SPEC，见 [host-local 的兑现](../../execution-environment-host-local/SPEC.md#留下的进程的兑现)。

## 未覆盖

- 多份获取共用一个保留范围、多个保留范围、多个租户。
- 归纳性检查只覆盖 1 个执行域。
- 保留进程的输出读取。SPEC 现在不定义它。
- 终端段的哨兵被同一用户的进程伪造（P5）。
- 无人值守期限（`Expire`）在模型里是可选动作，SPEC 现在没有这项配置。
- 活性只在无崩溃（`MaxCrash = 0`）下检查。崩溃之后封闭与结清最终完成，没有模型检查。
- 模型的移交提交是原子的。SPEC [移交](../SPEC.md#移交)第 4 项的「提交结果未知时按原移交身份查询」不在模型里。

## 实现对应

本节记每个模型动作对应哪段代码，以及实现里有哪些模型没有的行为。实现里出现模型没有的行为时，先记为差距，再决定改模型还是改实现。

### TerminalSegments

实现是宿主提供者的 Linux 终端（`execution-environment-host-local`）。路径相对该包的 `src/`。

| 模型动作 | 实现位置 | 说明 |
| --- | --- | --- |
| `GateStart` | `host-terminal.ts` 的 `execute`；`terminal-gate.ts` 的 `message()` 的 execute 分支 | gate 设当前段并开始按本段随机数扫描 |
| `ShellBegin` | `terminal-gate.ts` 的 `legSource()`：段首哨兵，再报告开始 | 哨兵由 Bash 内建 `printf` 写到 `/dev/tty` |
| `FgWrite`、`BgWrite` | 脚本与后台进程自己的写入 | 不在提供者代码里 |
| `FgExit` | `legSource()`：脚本返回、恢复临时目录之后写段尾哨兵，再报告完成 | |
| `Deliver` | 内核的 PTY 缓冲 | |
| `GateRead` | `terminal-gate.ts` 的 `readPty()` → `terminal-sentinels.ts` 的 `scanSentinels()` → `attribute()` | |
| `GateEnd` | `terminal-gate.ts` 的 `observe()` 收到完成观察 | |
| `GateComplete` | `terminal-gate.ts` 的 `poll()`：完成观察与段尾哨兵都到之后交出 | 对应 `Drain = "sentinel"` |
| `Finish` | `host-terminal.ts` 的帧处理与 `settleLeg()` | |

实现里有、模型里没有的行为：

- 段间缓冲有上界，超出的字节只计入丢弃数。模型的段间字节没有上界。
- gate 暂存可能是哨兵开头的流尾，下一次读取再判定。
- 哨兵用随机数区分各段，模型用段号。脚本能读到本段的随机数，这落在前提 P5 之外。
- gate 与管理器之间的 `between`、`begun` 帧，以及管理器对帧顺序的校验。
- 哨兵顺序不可能时终端失效。模型里这种顺序不可达。
- 段内字节按 `maxChunkBytes` 分块交出。

### ProcessCustody

实现是宿主提供者的 Linux 一次性命令（`execution-environment-host-local`）。收纳是 systemd 用户 scope 单元，即模型的 `Containment = "cgroup"`。路径相对该包的 `src/`。

| 模型动作 | 实现位置 | 说明 |
| --- | --- | --- |
| `PlanAcq` | `host-command.ts` 的 `start`：获取账本 `plan` | 先于起门进程 |
| `Launch`、`Refuse` | `start`：门报就绪后获取账本 `permit`，`confirmed` 才发 GO；否则强制停止单元并记 `stopped` | |
| `ForkPlain`、`ForkImmune`、`RestExit` | 命令自己的进程 | 不在提供者代码里。`Escape` 在 cgroup 收纳下不可用 |
| `PrimExit` | `command-gate.ts` 的 `finish()` 发退出帧，带单元里门以外的进程数；`host-command.ts` 的 `onExit` | 门在退出帧之后留在单元里 |
| `Dispose` | `host-command.ts` 的 `dispose` → `decideDisposition` | 五项条件按契约的次序判定 |
| `PlanRet` | `decideDisposition`：先 `reserve()`（`host-retained-processes.ts`，同步占名额），再保留进程账本 `plan` | 预留在首个异步等待之前 |
| `Commit` | `commitHandover`：保留进程账本 `adopt`；`apply` 的 `retained` 分支 → `enterIndex` | 归属在 `enterIndex` 里同步改为 `handedOver`，之后写标记文件，再改为 `retained` |
| `Abort` | `reservation.abort()`：在 `decideDisposition`、`commitHandover` 与 `apply` 的 `retainedInterrupted` 分支 | |
| `Stop`、`Kill`、`Confirm` | `forceStop`、`gracefulStop`；`host-scope.ts` 的 `forceStopScope`（`systemctl kill`、`stop`、`show`）；保留的执行域走索引的 `stop`；保留进程扩展的 `stop` 经登记表的门核对资格后落到同一个索引停止，每个执行域只有一个在途停止，重复的 `stop` 等它的读数（模型里 `stopping` 上 `Stop` 不可用） | 停止的记账去当前承担责任的账本：获取账本或保留进程账本 |
| `Drain` | 索引的 `maintain()` → `observe()`：`readScopeMembers` 读单元的 `cgroup.procs`，门以外没有进程或单元已不在时停止并记 `stopped` | 每 `retainedPollMs` 读一次。读不到不当作空 |
| `Expire` | 没有实现 | SPEC 没有这项配置 |
| `Release`、`DrainSweep` | `stopAll`：获取排空时强制停止 `live` 里的执行域。已移交的执行域不在 `live` 里 | `DrainSweep` 对应冷恢复的 `listRecoveryResources` 与 `recover` |
| `Settle` | 责任域的 `drain`：停止全部确认并记账后结清 | |
| `CloseScope`、`CloseSweep`、`ClosureDone` | 索引的 `watchClosure`：保留范围的释放信号或保留进程账本的 `closed` 信号触发 `closeScope`，停止该范围的全部保留进程 | 未确认的项留在索引里，`maintain()` 再试 |
| `Crash`、`Recover` | 新的提供者实例：索引 `ready()` 读 `<stateDirectory>/retained-processes/` 下的标记文件；`listRecoveryResources` 与 `recover` 带上索引里的资源 | 别的启动身份与已不在的单元的标记被删去 |

实现里有、模型里没有的行为：

- 提交结果未知时，归属记为未知，预留保留。停止与释放先用同一个键再问 `adopt`，查清之前不停止这个执行域。模型的提交是原子的。
- 提交之后再复核一次：`adopt` 答 `confirmed`，但执行域在等待期间被停止或释放，或保留范围已封闭时，执行域归保留范围，作为停止中的项进索引并立即停止，停止记入保留进程账本，`residue` 是 `stopping`（`closed`）。复核与归属改变在同一个同步步骤里，对应模型里原子的 `Commit`。打断的情形对应模型的 `Commit` 紧接保留范围一侧的 `Stop`，不对应 `Abort`：`adopt` 已经在集成方账本里生效，归属已是保留范围。物理结果与 `Abort` 后停止相同，执行域被停止，`residue` 不报告保留。
- 标记文件在 `adopt` 确认之后写，运行中与停止中的移交都写，留到停止确认并记账才删；写不成时由 `maintain()` 重写。标记不记停止意图，重启后停止未确认的项按运行中加载，模型的 `Recover` 则保留阶段。两者之间提供者崩溃时，单元只靠描述里的作用域摘要被列举，没有标记。
- 移交之后，原句柄的停止不作用于执行域，答 `unconfirmed`。模型里只有本次获取的 `Stop` 与保留范围的停止，没有「别的归属方的句柄」。
- 门在退出帧之后留在单元里，继续读命令的两条管道并丢弃字节。成员计数按进程号除去门。
- 只有保留范围与请求方作用域相同的获取才能保留。其他获取的处置原因是 `policy`。标记文件读不全时，预留答不可用，处置原因也是 `policy`。
- 一个状态目录一个索引，同一状态目录的各代提供者共用名额。
- 提供者重启之后，加载的保留进程在有获取给出该范围的保留进程账本视图之前没有账本可记。这期间它们自行结清时，提供者删去标记，但没有记 `stopped`。

### macOS 的 ProcessCustody

实现是宿主提供者的 macOS 一次性命令与终端（`execution-environment-host-local` 的 `src/macos-execution/`）。执行域是 POSIX 会话。进程可以用 `setsid` 离开会话，所以 macOS 不满足前提 P4（封闭收纳，原语 Π1）。这对应模型里 `Containment = "pgroup"` 的情形：`Escape` 可用。提供者因此不声称保留，命令设施没有 `retention` 扩展，没有执行域进入保留范围。机制见 host-local 的 [macOS 的兑现](../../execution-environment-host-local/SPEC.md#macos-的兑现)。测试路径相对 host-local 包的 `tests/macos-execution/`。

适用的性质与钉住它的测试：

| 性质 | 在 macOS 上的含义 | 测试 |
| --- | --- | --- |
| `StopTruth`（T4） | 报告已停的会话里没有活成员：连续两次读到空才答 `confirmed`，读不出时答 `unconfirmed` | `commands.spec.ts` 的「leftovers are stopped: StopTruth and the reasons」（四种原因下按进程号核对每个留下的进程都已不在）；`primitives.spec.ts` 的 Π3；`session.spec.ts` 的读取失败按未知处理 |
| `OneDisposition`（T3） | 主进程退出后执行域只被停止，从不被移交 | `commands.spec.ts` 的 C11 与「leftovers are stopped」；`decisions.spec.ts` 的 `residue` 判定只有 `none` 与 `stopping` |
| `UniqueOwner`（T2） | 每个活着的执行域归本次获取，停止未确认时留在获取的待停止集合 | `commands.spec.ts` 的释放与强制停止 |
| `SettleTruth`（T8） | 获取结清时，名下的执行域都已停止；提供者崩溃后冷恢复按标记停止 | `commands.spec.ts` 的「the release of the acquisition stops what it still runs before it settles」与「a provider killed with SIGKILL leaves nothing running; a fresh provider lists and recovers」；`terminals.spec.ts` 的释放与提供者被 `SIGKILL` 之后的恢复；`domain-index.spec.ts` 的完整或 `unavailable` 列举 |
| `CompletionTruth`、`FgInSegment`、`Monotone`、`NothingLost`、`StaysValid`、`OneSegment`（S1 至 S5） | Linux 的 Bash 驱动与分段源码不改动，在 `/bin/bash` 3.2.57 上运行，`TerminalSegments` 的实现对应同上一节 | `terminals.spec.ts` 的 C7、C8（200 段）、C9 与哨兵用例；`primitives.spec.ts` 的 Πt；`terminal-conformance.spec.ts` |

不适用的性质。前提 P4 不成立，所以没有执行域被保留：

| 性质 | 不适用的理由 |
| --- | --- |
| `KeepWhenPermitted`（T10） | 本提供者从不保留。可以保留的条件都成立时，`residue` 是 `stopping`，原因 `uncontained`（`commands.spec.ts` 与 `decisions.spec.ts`） |
| `NoEntryAfterClose`（T5）、`ClosureTruth`（T5、T8）、`NoEviction`（T6）、`ReservedFromAcq`（I8）、`OwnerOnlyForward`（I2）、`RetainedSurvivesRelease`（T7） | 都关于保留范围里的执行域、预留、名额或移交。macOS 上没有移交，这些性质空洞成立 |
| `ClosureEnds`（L1）、`RetainedSettles`（L3） | 同上，没有保留执行域 |

`NoLeak`（T1）在 macOS 上不成立。调用 `setsid` 的进程离开执行域，它不被停止，也不被列出，终端的 `close` 仍答 `confirmed`。这是 host-local 记下的已知偏离（[已知偏离](../../execution-environment-host-local/SPEC.md#留下的进程的兑现)），`terminals.spec.ts` 的用例「known deviation: a process that called setsid outlives the close, which still confirms」断言它。这与负控 N2（`Containment = "pgroup"` 违反 `NoLeak`）的结论一致。所以上表的 `StopTruth` 只对仍在会话里的成员成立。

实现里有、模型里没有的行为：

- 提供者走掉时（GO 之后控制通道结束），门停止自己的会话。模型的 `Crash` 之后执行域仍在，由 `Recover` 认回。
- 停止一个记下的执行域之前核对会话首进程的身份，首进程号被重用的会话被跳过。
- 冷索引的标记在 GO 之前写，确认的停止记入账本之后删去。
