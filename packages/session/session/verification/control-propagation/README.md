# 控制传播与会话串行队列的有限模型

[ControlPropagation.tla](ControlPropagation.tla) 检查 C3 控制传播、S5 重放、会话串行队列（SR-2）、后继 Run 的 S1 推进与实例关闭之间的交错。模型检查只说明给定抽象和有限范围内的性质。它不证明产品实现符合模型，也不证明 Agent 最终应答。

## 采用与边界

采用的源码与契约基线是提交 `f42da6226`，其中 `control.ts` 最后一次改动是 `2741ebe0a`（控制出站移出会话串行段）。下文源码映射里的行号都以该基线为准，当前树的行号可能不同；先按函数名定位。本模型补 [Run 取消与单调用中断模型](../../../../agent/agent/verification/cancellation/README.md) 没有建的 Session 一侧：该模型建 Agent 收到取消之后的围栏、中断与接收，本模型建 Session 把控制送到 Agent 之前的协调与调度。两份模型之间没有证明精化关系。

| 契约拥有者 | 本模型采用的承诺 |
| --- | --- |
| [Session 的终态与控制](../../../session-contract/SPEC.md#终态与控制) | 控制先保存意图，随后按持久关联传播。Run 取消关联该 Run，单调用控制关联原调用。未知时按原提交身份查询，不换身份重做 |
| [PM-13](../../../session-contract/SPEC.md#pm-13) | 控制经出站端口 `control` 送到原执行。控制结果未知时先查原操作，不为取得挂接而重发。超过策略上限时仍保留进度并报告 |
| [Session C3](../../SPEC.md#c3) | 同一控制 operation 重放认回。不可用与未知保留责任，按原身份接续。受理不等于实际停止。失败分支写明：关闭不等待未应答的出站，迟到应答丢弃，重启后由 S3 以同一操作身份找回重放 |
| [Session S5](../../SPEC.md#s5) | 每个控制操作一个在途重放。重放计数在内存，上限是每个进程寿命内的上限 |
| [SR-2](../../SPEC.md#sr-2) | 进程内每会话一个串行队列，协调器的动作按会话排队 |

在途出站不占住整段会话串行队列：串行段只读取和判定，出站在串行段外。这条取舍的归宿是 SPEC C3 失败分支和 `control.ts`，本 README 的「源码映射与六条约束的结构核对」记录核对结果。

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
| `Launch` | `trigger`、discovery 与 `launch` 合并成一步。控制为 propagating、任务空闲、`phase` 不是 stopped、尝试数未超上限时入队。`ignore-stopped` 故障开关去掉 `phase` 条件 |
| `BeginRead` | `scheduling.serial` 把队列交给任务 |
| `Stop` | 串行段内读到实例已关闭、控制不再 propagating 或原关联不唯一，退出并释放队列 |
| `Send` | 串行段内判定后发出一轮出站。`phase` 为 query 时发查询，否则发控制。尝试数加一。正确设计在这里释放队列，`outbound-in-serial` 故障保留队列直到应答 |
| `RespondControl(r)` | Agent 应答 `port.control`：`ok` 与 `busy` 进入等待，`rejected` 停止，`commit-unknown` 在同一轮内直接发查询。已被放弃的出站的应答被丢弃 |
| `RespondQuery(r)` | Agent 应答 `port.query`：`committed` 停止并记录，`unknown` 进入等待，`excluded` 立即再入队 |
| `EndWait` | 重放间隔到期，或因关闭返回 false。再入队前重新核对关闭与上限 |
| `AbandonOutbound` | 实例关闭后，任务不再等待未应答的出站。出站保持在途。它只在 `outbound-in-serial` 与 `close-waits-outbound` 都关闭时可用 |
| `TriggerAdvance`、`OpenRun` | R1 终态后 S1 入队，取得队列后开启 R2。`startRun` 与 `invoke` 抽象成一步并假定应答 |
| `RequestClose`、`CloseDone` | 关闭开始；所有任务结束后关闭返回 |
| `Reconcile`、`Replace`、`FinishRun1` | 环境：控制对账为 reconciled；R1 出现替换执行；R1 正常终结 |

`Next` 枚举上述动作的任意交错。没有状态裁剪或对称性缩减。`CHECK_DEADLOCK FALSE` 允许静止状态，`NoInternalDeadlock` 另行检查：关闭开始后，不是 `closeDone` 的状态必须仍有内部动作可走。

## 性质与负控

| 要求 | 检查 | 负控与预期反例 |
| --- | --- | --- |
| 安全：只发原关联的执行，cancel-run 关联唯一时才发 | `TargetSafe` | `bad-association` 让 cancel-run 在两个执行之间任选。`Replace` 之后发往 `e1b` |
| 安全：结果不明时先查询，不直接重发 | `QueryBeforeResend` | `bad-skip-query` 在 `commit-unknown` 后直接等待。下一轮在未知未结清时再次发送 |
| 安全：查询返回 committed 后不再发送 | `NoSendAfterCommitted` | `bad-ignore-stopped` 让 `Launch` 忽略 `phase = stopped`。`committed` 之后任务再次入队 |
| 安全：重放次数不超过 `maxReplays` | `ReplayBounded` | `bad-replay-bound` 去掉循环的上限。Agent 连续应答 `busy` 时第 `MaxReplays + 1` 次发送 |
| 离开 propagating 后不再重放 | `ReplayOnlyWhilePropagating` | `bad-propagating-filter` 去掉 `launch` 与 `step` 的过滤。`Reconcile` 之后仍开新一轮 |
| 活性：控制出站不返回时后继 Run 仍被调度（前提见下） | `SuccessorProgress` | `bad-serial-outbound` 把控制出站留在串行段内。控制占住队列表头，S1 永远排在后面 |
| 活性：控制出站不返回时实例关闭仍能完成（前提见下） | `CloseProgress` | `bad-serial-close` 同时打开 `outbound-in-serial`，它既把出站留在串行段内，又让关闭不能放弃出站，见下。`bad-close-waits` 出站已在串行段外，但任务仍无条件等待出站 |

两条活性性质限定为「控制出站」：它们只说明 C3 的 `port.control` 与 `port.query` 不返回时不拖住后继 Run 与关闭。前提是 S1 的 `invoke` 应答：`OpenRun` 把 `startRun` 与 `invoke` 抽象成一步并假定应答。S1 的 `invoke` 在串行段内等待 Agent，它不应答时同样占住队列。这类占用不在本模型的性质范围内，见下文的未展开清单。

`bad-serial-close` 的一个开关同时关掉两项控制。`outbound-in-serial` 一方面让出站发生在串行段内，另一方面让 `Abandonable` 为假，关闭时任务不能放弃出站。所以它说明「两项一起缺失时关闭挂起」，不单独说明串行段占用。`bad-close-waits` 只关掉放弃出站这一项，是单项对照。

正控还检查 `TypeOK`、`LaneConsistent` 与 `NoInternalDeadlock`。`LaneConsistent` 要求任务状态与队列成员一致，并在没有 `outbound-in-serial` 时要求 sending 与 querying 状态不在队列里。

`NoInternalDeadlock` 只对内部动作取 `ENABLED`：环境动作 `RequestClose` 在关闭前始终可用，对 `Next` 取 `ENABLED` 会使这条性质在关闭前空转。按字面写成 `closeDone \/ ENABLED Internal` 时，正控 `valid-cancel-run` 在深度 4 违反它（53 个状态，37 个不同状态）。原因是模型里存在合法的静止状态：控制出站在等 Agent 应答，或没有任务可做而等待环境，这时没有内部动作，也还没有关闭。所以实际成立并写入模型的含义是：关闭开始后，不是 `closeDone` 的状态必须有内部动作可走，即 `closed => (closeDone \/ ENABLED Internal)`。关闭之前不检查内部死锁。这条性质因此比字面形式窄，窄在「关闭前的静止不算死锁」。对 `close-waits-outbound` 做的一次性探测（不入库）在 74 个生成状态内违反它，说明它对「关闭后无内部动作可走」有检出力。

负控各自只改变具名故障开关，不改性质。三个时序负控的 cfg 各只声明一个 PROPERTY，因为 TLC 的时序失败消息不包含性质名。运行器同时核对 cfg、退出码和反例标记，语法错误、工具失败和超时均不算检出。

## 公平性与环境前提

`Spec` 对调度器与任务的内部动作使用逐动作弱公平性：入队、取得队列、判定、等待到期、关闭时放弃出站、S1 入队与开启、关闭返回。Agent 的两类应答没有公平性，所以出站永远不返回的行为全部在检查范围内。两条活性性质在这个前提下通过，说明控制出站的应答与否不影响它们。S1 的 `invoke` 应答是另一项前提：`OpenRun` 假定应答，所以两条性质不覆盖 S1 出站不返回的行为。

环境动作 `Reconcile`、`Replace`、`FinishRun1` 与 `RequestClose` 没有公平性，可以不发生，也可以在任意可用时刻发生。`Reconcile` 可以在没有任何出站被受理时发生，这是环境行为的超集。模型里出站端口始终存在，`agentDrive.current()` 为 null 的分支没有展开。

本模型没有展开：多个控制操作、多个会话、租户身份、`background-tool` 与 `archive` 种类、`stopCall` 的绑定与 attempt 查找细节、S3 周期扫描的分页、重放间隔的时钟拒绝、`replays` Map 的清理（评审 N7）、进程重启后的计数归零、S1 自身出站 `invoke` 不返回时对队列的占用、串行段内的权威读（`scheduling.principal` 与 `readWork`）总能返回的假定、Agent 收到控制后的围栏与物理停止。原执行 `e1` 退出快照而只剩 `e1b` 的情形没有展开。不得由本模型推导这些行为。

## 源码映射与六条约束的结构核对

| 模型边界 | `control.ts` 在 `f42da6226` 的位置 | 对应与差异 |
| --- | --- | --- |
| `Launch` | `trigger`（第 236–260 行）与 `launch`（第 203–229 行）：`running`、`phase === 'stopped'`、`attempts >= maxReplays` 的核对 | 合并成一步。模型不区分 discovery 的 `again` 折叠（第 240–243 行） |
| `BeginRead`、`Stop` | `step`（第 192–202 行）里 `scheduling.serial` 包住 `plan`（第 119–146 行）：`read`、`controls.find(state === 'propagating')`、`originalExecution`（第 124–134 行） | `plan` 在非 propagating 时删除重放记录（第 129 行）。模型不建重放记录的清理 |
| `Send` | `plan` 的 `attempts += 1` 与请求生成（第 135–146 行），出站由 `exchange`（第 149–191 行）在串行段外发出 | 模型把「串行段内生成目标并释放队列」与「出站在途」合成一步。`exchange` 开头再核对一次 `lifecycle.closed`（第 154 行），对应 `Send` 的 `~closed` 条件。`port === null` 时 `plan` 仍加一次尝试数并返回 wait（第 135–137 行）。模型里出站端口始终存在 |
| `RespondControl` | `exchange` 第 176–190 行：`ok` 返回 wait，`commit-unknown` 进 `asked()`，`busy`/`unavailable` 返回 wait，其他失败置 stopped，throw 返回 wait | `unavailable` 与 throw 并入 `busy`。`lifecycle.closed ? 'stop' : await asked()` 对应 `closed` 分支 |
| `RespondQuery` | `asked()`（第 155–175 行） | 失败与 `unknown` 并入 `unknown` |
| `EndWait`、`Again` | `launch` 的循环（第 220–224 行）与 `scheduling.wait` | 时钟到期由弱公平性表示 |
| `AbandonOutbound` | `untilClosed`（第 104–117 行）：出站 promise 与 `lifecycle.signal` 竞速，`exchange` 对 `port.control` 与 `port.query` 都使用它（第 156、178 行） | 对应关闭时放弃出站。出站仍在途，由对端自己结束 |
| `TriggerAdvance`、`OpenRun` | `advance.ts` 的 `check`（第 254–265 行）与第 264 行 `scheduling.serial(... openRun)`；`openRun` 第 225 行，`invoke` 第 184 行 | `invoke` 的重试与 `commit-unknown` 不展开 |
| `RequestClose`、`CloseDone` | `lifecycle.ts` 的 `close`（第 50–54 行）：置 closed、abort、等全部在途任务 | 模型要求 `ctl` 与 `adv` 都空闲。`untilClosed` 返回的出站 promise 不进入 `inflight` 集合 |
| `Reconcile` | 命令处理器对 `receive(control)` 的提交 | 环境动作，不建模提交细节 |

核对方式是结构核对：逐条阅读 `f42da6226` 的 `control.ts`、`advance.ts` 与 `lifecycle.ts`，把下面六条动作约束对到代码位置。没有运行产品测试，也没有证明模型与代码精化。约束成立才使正控描述的设计与实现同形。

| 约束 | 核对结果 |
| --- | --- |
| 1. 串行段在出站发出之前结束，只含读快照、核对 propagating、解析原关联、尝试数加一、生成目标 | 成立。`step` 第 198–200 行的 `scheduling.serial` 只包住 `plan`，`exchange` 在其返回后调用（第 201 行） |
| 2. 每轮都在串行段内重新读取与判定，出站用这一轮生成的目标 | 成立。`round` 是 `step` 的局部变量，每轮由 `plan` 重新读取（第 125 行）并生成请求（第 138–144 行），没有跨轮缓存 |
| 3. `commit-unknown` 之后的查询在同一轮发出，不加尝试数，结清之前不发新控制 | 成立。第 181–184 行置 `phase = 'query'` 后在同一 `exchange` 内调用 `asked()`，未经过 `plan`。`phase === 'query'` 时 `exchange` 只查询（第 177 行）。下一轮的查询仍由 `plan` 加一次尝试数，与模型的 `Send` 一致 |
| 4. 尝试数上限在入队前核对，尝试数在串行段内加一 | 成立。`launch` 第 213 行与循环条件第 220 行核对上限，加一在 `plan` 第 136 行 |
| 5. 关闭时对出站的等待能结束而出站仍未应答 | 成立。`untilClosed` 与 `lifecycle.signal` 竞速。出站 promise 不是 `lifecycle.spawn` 的任务，`close` 不等它。第 104–117 行 |
| 6. 被放弃出站的迟到应答被丢弃，不改变 `phase`、`attempts`，不再入队 | 成立。`phase` 的赋值都在 `await untilClosed(...)` 返回非 `CLOSED` 之后。迟到应答经 `work.then` 对已完成的 promise 调用 `resolve` 或 `reject`，没有效果，也没有未处理的拒绝 |

第 5 条改变 `lifecycle.ts` 注释里「让在途工作结束」的字面含义：对无应答的外部出站，等待只能在关闭时放弃。这条取舍已经写入 [SPEC C3 失败分支](../../SPEC.md#c3)：关闭不等待未应答的出站，迟到应答丢弃。它不改变 `close` 不回滚、不发送的承诺。

S1 的 `openRun` 把 `invoke` 也放在串行段内（`advance.ts` 第 264 行与第 184 行起的 `invoke`）。同类占用在本模型里被抽象掉（`OpenRun` 假定应答）。它不在本模型范围。

## 执行

Windows 宿主从工作树根运行。Python 仅使用标准库。TLC 使用 WSL Ubuntu-24.04 与 `/opt/tlaplus/tla2tools.jar`。

```bash
export PYTHONUTF8=1
unset UV_DEFAULT_INDEX
python packages/session/session/verification/control-propagation/run-models.py --help
python packages/session/session/verification/control-propagation/run-models.py --parse-only
python -B packages/session/session/verification/control-propagation/test-runner.py
python packages/session/session/verification/control-propagation/run-models.py
```

运行器先执行负控，再执行正控。可在命令后追加一个或多个 cfg 名称，不含扩展名。`--timeout` 调整单配置预算，默认 180 秒。`--output` 只能指定本工作树 `tmp/` 下的证据根目录。TLC 不经 `with-test-slot` 排队：运行器自身串行执行各配置，一个 worker，堆 1 GiB。

Windows 运行器把模型、配置及自身快照通过标准输入复制到 WSL 的独立 `/tmp/omne-m-control.*`。Java 在该副本运行，TLC 状态文件也留在该副本。证据复制到 `--output` 指定的证据根目录下的 `runs/<UTC 时间>/`。该目录在工作树 `tmp/` 下，不入库。正常结束、失败或超时退出后删除 WSL 副本。没有在 `/mnt/d` 安装依赖或运行仓库构建。

每次执行保存输入 SHA-256、源码 HEAD、JAR SHA-256、Java/TLC 版本、完整命令、参数、退出码、状态数和原始日志。正控要求退出 0 且出现完整搜索成功标记。安全性负控要求退出 12、指定不变量及轨迹。时序负控要求退出 13 和时序反例。未执行配置与工具失败不能记为通过。

## 实测范围

2026-11-03（UTC 2026-11-02 17:08）在 Windows 11 宿主启动 WSL Ubuntu-24.04，使用 Temurin 21.0.12.1、TLC2 2.19（TLA2Tools 1.7.4，revision `5a47802`）。JAR SHA-256 为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`。参数为一个 worker、`-Xmx1024m`、ParallelGC、seed 787、fingerprint polynomial 0，每 cfg 180 秒预算。源码 HEAD `f42da6226`，模型与 cfg 为该次运行时的字节。SANY（`--parse-only`）通过，`test-runner.py` 七项通过。

| cfg | `Kind` / `MaxReplays` | 生成状态 / 不同状态 | 深度 | 耗时 | TLC 退出码 | 判读 |
| --- | --- | --- | --- | --- | --- | --- |
| `valid-cancel-run` | cancel-run / 2 | 2,816 / 886 | 17 | 1.7 s | 0 | 全部不变量与两条活性通过 |
| `valid-stop-call` | stop-call / 2 | 4,011 / 1,196 | 18 | 1.8 s | 0 | 同上，R1 由环境终结 |
| `bad-serial-outbound` | cancel-run / 2 | 2,216 / 786 | — | 1.0 s | 13 | 违反 `SuccessorProgress`：控制在串行段内发送，`commit-unknown` 后的查询永不应答，S1 一直排在队列后面 |
| `bad-serial-close` | cancel-run / 2 | 2,216 / 786 | — | 1.0 s | 13 | 违反 `CloseProgress`：同一开关同时关掉串行段外发送与关闭时放弃出站，关闭后队列仍被占住 |
| `bad-close-waits` | cancel-run / 2 | 2,256 / 786 | — | 1.0 s | 13 | 违反 `CloseProgress`：R2 已开启，出站在串行段外，任务仍等待永不应答的出站，关闭不返回 |
| `bad-replay-bound` | cancel-run / 1 | 602 / 248 | 8 | 1.2 s | 12 | 违反 `ReplayBounded`：`busy` 之后第二轮发送，尝试数 2 > 1 |
| `bad-skip-query` | cancel-run / 2 | 565 / 242 | 8 | 1.2 s | 12 | 违反 `QueryBeforeResend`：`commit-unknown` 未查询，下一轮直接再发控制 |
| `bad-propagating-filter` | cancel-run / 2 | 98 / 57 | 5 | 1.1 s | 12 | 违反 `ReplayOnlyWhilePropagating`：取得队列后控制变为 reconciled，仍发出 |
| `bad-association` | cancel-run / 2 | 92 / 58 | 5 | 0.9 s | 12 | 违反 `TargetSafe`：`Replace` 之后 R1 有两个执行，发往 `e1b` |
| `bad-ignore-stopped` | cancel-run / 2 | 370 / 174 | 7 | 1.2 s | 12 | 违反 `NoSendAfterCommitted`：查询返回 `committed` 后 `Launch` 忽略 `phase = stopped`，任务再次入队 |

十个配置全部与预期一致，入口退出 0。正控日志均包含 `Model checking completed. No error has been found.`，无剩余队列状态。TLC 报告的指纹碰撞乐观估计为 `9.3E-14` 与 `1.8E-13`。这是有限模型检查结果，不是数学证明。负控在反例处停止，其状态数不代表完整探索。时序负控没有深度行，TLC 的时序检查在完整状态图上报告 lasso 反例。

按 [docs/verification.md「分别表述这六种状态」](../../../../../docs/verification.md#分别表述这六种状态)：本模型在上表范围内有限通过。`control.ts` 在 `f42da6226` 的结构与六条约束一致（结构核对，不是机器证明），对应正控的设计，`outbound-in-serial` 开关对应的是修复前的旧实现。实现与模型的精化没有证明，真实 Agent 应答、真实时钟、S1 `invoke` 不应答以及权威读不返回的组合没有验证。

每次运行的原始日志与输入快照在证据根目录的 `runs/<UTC 时间>/` 下，不入库。`results.json` 汇总全部十项。
