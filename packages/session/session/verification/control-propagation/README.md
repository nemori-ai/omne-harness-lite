# 控制传播与会话串行队列的有限模型

[ControlPropagation.tla](ControlPropagation.tla) 检查 C3 控制传播、S5 重放、会话串行队列（SR-2）、后继 Run 的 S1 推进与实例关闭之间的交错。模型检查只说明给定抽象和有限范围内的性质。它不证明产品实现符合模型，也不证明 Agent 最终应答。

## 采用与边界

本资源按 #502 revision 3 attempt 502-r3-a2 的 M-CONTROL 闭包维护。采用的源码与契约基线是 `19d294186`。它补 [M-CANCEL](../../../../agent/agent/verification/cancellation/README.md) 没有建的 Session 一侧：M-CANCEL 建 Agent 收到取消之后的围栏、中断与接收，本模型建 Session 把控制送到 Agent 之前的协调与调度。两份模型之间没有证明精化关系。

| 契约拥有者 | 本模型采用的承诺 |
| --- | --- |
| [Session 的终态与控制](../../../session-contract/SPEC.md#终态与控制) | 控制先保存意图，随后按持久关联传播。Run 取消关联该 Run，单调用控制关联原调用。未知时按原提交身份查询，不换身份重做 |
| [PM-13](../../../session-contract/SPEC.md#pm-13) | 控制经出站端口 `control` 送到原执行。控制结果未知时先查原操作，不为取得挂接而重发。超过策略上限时仍保留进度并报告 |
| [Session C3](../../SPEC.md#c3) | 同一控制 operation 重放认回。不可用与未知保留责任，按原身份接续。受理不等于实际停止 |
| [Session S5](../../SPEC.md#s5) | 每个控制操作一个在途重放。重放计数在内存，上限是每个进程寿命内的上限 |
| [SR-2](../../SPEC.md#sr-2) | 进程内每会话一个串行队列，协调器的动作按会话排队 |
| C-SCONTROL 实现评审 N1（线内处置，任务 tmp `reviews/C-SCONTROL-impl.md`） | 线内认定：在途出站也算「等待」，不占住整段会话单写队列。串行段只做读取和判定，出站移到串行段外 |

最后一行引用任务 tmp 里的评审处置。该文件不随仓库发布，所以这里不放链接。N1 的长期归宿是修复后的 `control.ts` 与本 README 的「对 N1 修复的约束」。

## 状态、范围和动作

每个配置包含一个会话、一个控制操作与三个执行身份。`e1` 是 Run R1 的原执行。`e1b` 是 R1 的替换执行，环境可以在任意时刻让它出现。`e2` 是后继 Run R2 的执行，只在 R2 开启后存在。控制种类由常量 `Kind` 决定：`cancel-run` 以 R1 为目标，R1 从初始状态起就是终态；`stop-call` 以 `e1` 上的原调用为目标，R1 由环境动作结束。

| 状态变量 | 含义与拥有者 |
| --- | --- |
| `cstate` | 快照里这个控制的进度：propagating 或 reconciled。reconciled 由环境的 `receive(control)` 产生 |
| `run1`、`run2` | R1 的 active/terminal，R2 的 none/started |
| `replaced` | 快照里 R1 是否有第二个执行 `e1b`。为真时 R1 的关联不唯一 |
| `lane` | 会话串行队列，FIFO 序列，表头是持有者。元素是 `control` 或 `advance` |
| `ctl` | C3 任务：idle、queued（等队列）、reading（持有队列并读取判定）、sending、querying、waiting（等重放间隔） |
| `phase`、`attempts`、`sends` | `control.ts` 的 `Replay` 记录：send/query/stopped，每轮计一次的尝试数，以及出站 `control` 的次数 |
| `outbound`、`target` | 在途出站的种类（none/control/query）与它携带的执行身份 |
| `pendingUnknown` | 一次发送以 `commit-unknown` 结束，且没有查询把它结清 |
| `committed` | 查询已经返回 `committed` |
| `adv` | 后继 Run 的 S1/C2 任务：idle 或 queued |
| `closed`、`closeDone` | `lifecycle.close` 已开始、已返回 |
| `assocSafe`、`replaySafe` | 观察用布尔值。产品动作不读取它们 |

| 动作 | 状态变化与抽象边界 |
| --- | --- |
| `Launch` | `trigger`、discovery 与 `launch` 合并成一步。控制为 propagating、任务空闲、`phase` 不是 stopped、尝试数未超上限时入队 |
| `BeginRead` | `scheduling.serial` 把队列交给任务 |
| `Stop` | 串行段内读到实例已关闭、控制不再 propagating 或原关联不唯一，退出并释放队列 |
| `Send` | 串行段内判定后发出一轮出站。`phase` 为 query 时发查询，否则发控制。尝试数加一。正确设计在这里释放队列，`outbound-in-serial` 故障保留队列直到应答 |
| `RespondControl(r)` | Agent 应答 `port.control`：`ok` 与 `busy` 进入等待，`rejected` 停止，`commit-unknown` 在同一轮内直接发查询。已被放弃的出站的应答被丢弃 |
| `RespondQuery(r)` | Agent 应答 `port.query`：`committed` 停止并记录，`unknown` 进入等待，`excluded` 立即再入队 |
| `EndWait` | 重放间隔到期，或因关闭返回 false。再入队前重新核对关闭与上限 |
| `AbandonOutbound` | 实例关闭后，任务不再等待未应答的出站。出站保持在途。它只在两个故障开关都关闭时可用 |
| `TriggerAdvance`、`OpenRun` | R1 终态后 S1 入队，取得队列后开启 R2。`startRun` 与 `invoke` 抽象成一步并假定应答 |
| `RequestClose`、`CloseDone` | 关闭开始；所有任务结束后关闭返回 |
| `Reconcile`、`Replace`、`FinishRun1` | 环境：控制对账为 reconciled；R1 出现替换执行；R1 正常终结 |

`Next` 枚举上述动作的任意交错。没有状态裁剪或对称性缩减。`CHECK_DEADLOCK FALSE` 允许关闭完成后的静止，`NoInternalDeadlock` 另行检查：只有 `closeDone` 的状态可以没有下一动作。

## 性质与负控

| 要求 | 检查 | 负控与预期反例 |
| --- | --- | --- |
| 安全：只发原关联的执行，cancel-run 关联唯一时才发 | `TargetSafe` | `bad-association` 让 cancel-run 在两个执行之间任选。`Replace` 之后发往 `e1b` |
| 安全：结果不明时先查询，不直接重发 | `QueryBeforeResend` | `bad-skip-query` 在 `commit-unknown` 后直接等待。下一轮在未知未结清时再次发送 |
| 安全：查询返回 committed 后不再发送 | `NoSendAfterCommitted` | 没有专门负控。正控检查它 |
| 安全：重放次数不超过 `maxReplays` | `ReplayBounded` | `bad-replay-bound` 去掉循环的上限。Agent 连续应答 `busy` 时第 `MaxReplays + 1` 次发送 |
| 离开 propagating 后不再重放 | `ReplayOnlyWhilePropagating` | `bad-propagating-filter` 去掉 `launch` 与 `step` 的过滤。`Reconcile` 之后仍开新一轮 |
| 活性：出站不返回时后继 Run 仍被调度 | `SuccessorProgress` | `bad-serial-outbound` 把出站留在串行段内。控制占住队列表头，S1 永远排在后面 |
| 活性：出站不返回时实例关闭仍能完成 | `CloseProgress` | `bad-serial-close` 同上，关闭等待串行段。`bad-close-waits` 出站已在串行段外，但任务仍无条件等待出站 |

正控还检查 `TypeOK`、`LaneConsistent` 与 `NoInternalDeadlock`。`LaneConsistent` 要求任务状态与队列成员一致，并在没有 `outbound-in-serial` 时要求 sending 与 querying 状态不在队列里。

负控各自只改变具名故障开关，不改性质。三个时序负控的 cfg 各只声明一个 PROPERTY，因为 TLC 的时序失败消息不包含性质名。运行器同时核对 cfg、退出码和反例标记，语法错误、工具失败和超时均不算检出。

## 公平性与环境前提

`Spec` 对调度器与任务的内部动作使用逐动作弱公平性：入队、取得队列、判定、等待到期、关闭时放弃出站、S1 入队与开启、关闭返回。Agent 的两类应答没有公平性，所以出站永远不返回的行为全部在检查范围内。两条活性性质在这个前提下通过，说明它们不依赖 Agent 应答。

环境动作 `Reconcile`、`Replace`、`FinishRun1` 与 `RequestClose` 没有公平性，可以不发生，也可以在任意可用时刻发生。`Reconcile` 可以在没有任何出站被受理时发生，这是环境行为的超集。模型里出站端口始终存在，`agentDrive.current()` 为 null 的分支没有展开。

本模型没有展开：多个控制操作、多个会话、租户身份、`background-tool` 与 `archive` 种类、`stopCall` 的绑定与 attempt 查找细节、S3 周期扫描的分页、重放间隔的时钟拒绝、`replays` Map 的清理（评审 N7）、进程重启后的计数归零、S1 自身出站 `invoke` 不返回时对队列的占用、Agent 收到控制后的围栏与物理停止。原执行 `e1` 退出快照而只剩 `e1b` 的情形没有展开。不得由本模型推导这些行为。

## 源码映射与对 N1 修复的约束

| 模型边界 | `control.ts` 基线 `19d294186` 的位置 | 对应与差异 |
| --- | --- | --- |
| `Launch` | `trigger`（第 167–190 行）与 `launch`（第 136–149 行）的 `running`、`phase`、`attempts` 核对 | 合并成一步。模型不区分 discovery 的 `again` 折叠 |
| `BeginRead`、`Stop`、`Send` | `step`（第 86–101 行）：`read`、`controls.find(state === 'propagating')`、`originalExecution`、`attempts += 1` | 基线的 `scheduling.serial`（第 155 行）包住整个 `step`，对应 `outbound-in-serial` 开关打开。正确设计对应开关关闭 |
| `RespondControl` | 第 119–134 行：`ok` 返回 wait，`commit-unknown` 进 `asked()`，`busy`/`unavailable` 返回 wait，其他失败置 stopped，throw 返回 wait | `unavailable` 与 throw 并入 `busy`。`lifecycle.closed ? 'stop' : await asked()` 对应 `closed` 分支 |
| `RespondQuery` | `asked()`（第 104–116 行） | 失败与 `unknown` 并入 `unknown` |
| `EndWait`、`Again` | 第 153–159 行的循环条件与 `scheduling.wait` | 时钟到期由弱公平性表示 |
| `AbandonOutbound` | 基线没有对应代码 | 这是修复必须新增的行为，见下 |
| `TriggerAdvance`、`OpenRun` | `advance.ts` 的 `check`（第 253–264 行）与 `scheduling.serial(... openRun)` | `invoke` 的重试与 `commit-unknown` 不展开 |
| `RequestClose`、`CloseDone` | `lifecycle.ts` 的 `close`（第 50–54 行）：置 closed、abort、等全部在途任务 | 模型要求 `ctl` 与 `adv` 都空闲 |
| `Reconcile` | 命令处理器对 `receive(control)` 的提交 | 环境动作，不建模提交细节 |

N1 修复在另一棵树进行。修复后的实现要让 `valid-cancel-run` 与 `valid-stop-call` 的正控继续成立，就必须满足下面几条动作约束：

1. 串行段只包含 `BeginRead` 到 `Send` 或 `Stop` 之间的工作：读快照、核对 propagating、解析原关联、尝试数加一、生成目标。串行段在出站发出之前结束。`LaneConsistent` 的最后一项检查这一点。
2. 每一轮都在串行段内重新读取和判定，出站使用这一轮刚生成的目标。不能跨轮复用上一轮的目标，否则 `Replace` 与 `Reconcile` 之后的出站绕过 `TargetSafe` 与 `ReplayOnlyWhilePropagating`。
3. `commit-unknown` 之后的查询仍在同一轮发出，不再进串行段，也不加尝试数。查询结清之前不发送新的控制。
4. 尝试数上限在入队之前核对（`Launch`、`EndWait`、`Again`），尝试数在串行段内加一。两处分开，`ReplayBounded` 才成立。
5. 实例关闭时，任务对出站的等待必须能够结束而出站仍未应答：与 `lifecycle.signal` 竞速，或者等价地不把出站的 promise 纳入 `close` 等待的集合。只把出站移出串行段不够：`bad-close-waits` 的反例说明，任务无条件 `await port.control` 时 `close` 仍然挂起。
6. 被放弃的出站的迟到应答必须丢弃，不能改变 `phase`、`attempts` 或再次入队。重启后由 S3 按 `controls` 找回并以同一操作身份重放，这是 S5 已接受的行为。

第 5 条改变 `lifecycle.ts` 注释里「让在途工作结束」的字面含义：对无应答的外部出站，等待只能在关闭时放弃。这是实现层的取舍，不改变 `close` 不回滚、不发送的承诺。它是否需要写回 SPEC 的 C3 失败分支，由派发者裁定。

S1 的 `openRun` 把 `invoke` 也放在串行段内（`advance.ts` 第 263 行与第 166–210 行）。同类占用在本模型里被抽象掉（`OpenRun` 假定应答）。它不在本次闭包范围，作为清理候选交回。

## 执行

Windows 宿主从工作树根运行。Python 仅使用标准库。TLC 使用任务指定的 WSL Ubuntu-24.04 与 `/opt/tlaplus/tla2tools.jar`。

```bash
export PYTHONUTF8=1
unset UV_DEFAULT_INDEX
python packages/session/session/verification/control-propagation/run-models.py --help
python packages/session/session/verification/control-propagation/run-models.py --parse-only
python -B packages/session/session/verification/control-propagation/test-runner.py
python packages/session/session/verification/control-propagation/run-models.py
```

运行器先执行负控，再执行正控。可在命令后追加一个或多个 cfg 名称，不含扩展名。`--timeout` 调整单配置预算，默认 180 秒。`--output` 只能指定本工作树 `tmp/` 下的证据根目录。TLC 按线内 2026-11-03 的名额规则不经 `with-test-slot` 排队：运行器自身串行执行各配置，一个 worker，堆 1 GiB。同一时间本线最多运行两个模型。

Windows 运行器把模型、配置及自身快照通过标准输入复制到 WSL 的独立 `/tmp/omne-m-control.*`。Java 在该副本运行，TLC 状态文件也留在该副本。证据复制到工作树的 `tmp/line-session-run/w2/M-CONTROL/runs/<UTC 时间>/`。正常结束、失败或超时退出后删除 WSL 副本。没有在 `/mnt/d` 安装依赖或运行仓库构建。

每次执行保存输入 SHA-256、源码 HEAD、JAR SHA-256、Java/TLC 版本、完整命令、参数、退出码、状态数和原始日志。正控要求退出 0 且出现完整搜索成功标记。安全性负控要求退出 12、指定不变量及轨迹。时序负控要求退出 13 和时序反例。未执行配置与工具失败不能记为通过。

## 实测范围

2026-11-03 在 Windows 11 宿主启动 WSL Ubuntu-24.04，使用 Temurin 21.0.12.1、TLC2 2.19（TLA2Tools 1.7.4，revision `5a47802`）。JAR SHA-256 为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`。参数为一个 worker、`-Xmx1024m`、ParallelGC、seed 787、fingerprint polynomial 0，每 cfg 180 秒预算。源码 HEAD `19d294186`，模型与 cfg 为本次提交的字节。

| cfg | `Kind` / `MaxReplays` | 生成状态 / 不同状态 | 深度 | 耗时 | TLC 退出码 | 判读 |
| --- | --- | --- | --- | --- | --- | --- |
| `valid-cancel-run` | cancel-run / 2 | 2,816 / 886 | 17 | 1.1 s | 0 | 全部不变量与两条活性通过 |
| `valid-stop-call` | stop-call / 2 | 4,011 / 1,196 | 18 | 1.1 s | 0 | 同上，R1 由环境终结 |
| `bad-serial-outbound` | cancel-run / 2 | 2,216 / 786 | — | 1.0 s | 13 | 违反 `SuccessorProgress`：控制在串行段内发送，`commit-unknown` 后的查询永不应答，S1 一直排在队列后面 |
| `bad-serial-close` | cancel-run / 2 | 2,216 / 786 | — | 1.0 s | 13 | 违反 `CloseProgress`：同上，关闭后队列仍被占住 |
| `bad-close-waits` | cancel-run / 2 | 2,256 / 786 | — | 1.0 s | 13 | 违反 `CloseProgress`：R2 已开启，出站在串行段外，任务仍等待永不应答的出站，关闭不返回 |
| `bad-replay-bound` | cancel-run / 1 | 602 / 248 | 8 | 0.9 s | 12 | 违反 `ReplayBounded`：`busy` 之后第二轮发送，尝试数 2 > 1 |
| `bad-skip-query` | cancel-run / 2 | 565 / 242 | 8 | 1.1 s | 12 | 违反 `QueryBeforeResend`：`commit-unknown` 未查询，下一轮直接再发控制 |
| `bad-propagating-filter` | cancel-run / 2 | 98 / 57 | 5 | 0.9 s | 12 | 违反 `ReplayOnlyWhilePropagating`：取得队列后控制变为 reconciled，仍发出 |
| `bad-association` | cancel-run / 2 | 92 / 58 | 5 | 0.9 s | 12 | 违反 `TargetSafe`：`Replace` 之后 R1 有两个执行，发往 `e1b` |

正控日志均包含 `Model checking completed. No error has been found.`，无剩余队列状态。TLC 报告的指纹碰撞乐观估计为 `9.3E-14` 与 `1.8E-13`。这是有限模型检查结果，不是数学证明。负控在反例处停止，其状态数不代表完整探索。时序负控没有深度行，TLC 的时序检查在完整状态图上报告 lasso 反例，三条反例都以 stuttering 结束。

按 [docs/verification.md「分别表述这六种状态」](../../../../../docs/verification.md#分别表述这六种状态)：本模型在上表范围内有限通过。`control.ts` 基线 `19d294186` 对应 `outbound-in-serial` 开关打开，也就是说基线实现对应的是负控，不是正控。正控描述的是修复后的目标设计。修复后的实现尚未存在，实现与模型的符合没有验证，真实 Agent 应答与真实时钟下的组合没有验证。

原始日志与输入快照位于当次工作树 `tmp/line-session-run/w2/M-CONTROL/runs/20261102T162141.737792Z/`，`results.json` 汇总全部九项，入口退出 0。更早一次运行（`20261102T161736.149781Z`）在 `valid-cancel-run` 以模型表达错误停止：`RespondControl` 对同一轮的查询误把出站清空。那次的负控结果与本次一致。它留在任务证据目录，不进入长期行为声明。
