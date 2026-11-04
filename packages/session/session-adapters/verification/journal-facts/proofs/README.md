# JournalOught 的手写证明：从有限范围推广到无界

TLC 只检查了 3 步（`journal.cfg`）与 4 步（`journal-wide.cfg`）、至多两次崩溃、一次拒绝、两次重试。本页对每条性质给出命题、前提与推导，把结论推广到任意步数、任意崩溃与重试次数。记号沿用 [JournalOught.tla](../models/JournalOught.tla)。TLC 的运行记录见 [formal-runs.md](../formal-runs.md)。

证明的对象是模型，不是实现。实现要满足前提 A1 到 A5（第 0 节）才继承这些结论。各前提由谁强制见 [README](../README.md#前提)。

## 0 前提

- A1 原子追加。存储对一批要么全部可见（`Accept`），要么全不可见（`Refuse`）。没有部分可见。
- A2 折叠纯。`Apply(v, i, b)` 只读参数，无时钟、无随机、无 I/O，对相同参数返回相同值。
- A3 批自描述。一批的内容在提交时固定：`op`、`digest`、`gen`、`target`、`changed` 与三个事实集合。提交后不变（由 P2 保证，P2 自身由 A1 与 `Accept` 的定义保证）。
- A4 操作身份确定派生。同一帧、同一转移在崩溃前后派生同一 `op`；不同转移派生不同 `op`。
- A5 单写者在位。`Ready` 要求 `writerGen = view.gen`；`Recover` 推进 `gen` 并换写者。旧写者的提交在 `Ready` 处被拒。

## 命题 1（P1，SSOT）：视图等于折叠

**命题。**对任意可达状态，`~crashed ⇒ view = FoldN(log, head) ∧ head = Len(log)`。

**推导。**对动作归纳。

- `Init`：`log = <<>>`，`head = 0`，`view = EmptyView = FoldN(<<>>, 0)`。成立。
- `Accept(b)`（设计分支）：`log' = Append(log, b)`，`head' = Len(log) + 1`，`view' = Apply(view, Len(log) + 1, b)`。归纳假设 `view = FoldN(log, Len(log))`，于是 `view' = Apply(FoldN(log, Len(log)), Len(log) + 1, b) = FoldN(log', Len(log'))`（`FoldN` 的定义展开一步）。成立。
- `Recognize`、`Recover`：同上，都经 `Append` 加一步 `Apply`。`Recover` 先取 `folded = Fold(log)`，由 A2 它等于任何别的进程折叠同一 `log` 的结果。
- `Refuse`、`RetrySame`（设计分支）、`RetryConflict`：`log`、`view`、`head` 都不变。成立。
- `Crash`：`crashed' = TRUE`，命题的前件为假。

无界性：归纳不依赖 `Len(log)`、`step`、`crashes`、`retries` 的上界，所以对任意长度成立。TLC 的 `bad-cache-only-p1` 说明去掉 `Accept` 里的追加就立刻违背。

## 命题 2（P2，只追加）：已提交的批不改写、不删除

**命题。**对任意一步，`IsPrefix(log, log')`。

**推导。**设计里改 `log` 的动作只有 `Accept`（设计分支）、`Recognize`、`Recover`，三者都是 `log' = Append(log, b)`，`Append` 保留前缀。其余动作 `UNCHANGED log`。`Crash` 不改 `log`：这正是 A1 的含义，崩溃丢的是内存与未被受理的命令。

无界性：逐步性质，与长度无关。TLC 的 `bad-upsert-p2` 说明原地改写最后一批就违背。

推论：对任意 `i ≤ Len(log)` 与任意后续状态，`log[i]` 不变，因此 `FoldN(log, i)` 不变（A2）。这是命题 5 与命题 6 的基础。

## 命题 3（P3，每步提交有界）：一批只带本步新增事实，权重有与步数无关的上界

**命题。**对任意可达状态与任意 `i ≤ Len(log)`：
(a) `Facts(log[i]) ∩ FactsBefore(log, i − 1) = {}`；
(b) `Weight(log[i]) ≤ BatchBound = C0 + |Members| × WMember + FMax × WFact`，其中 `FMax = 1`。

**推导。**
(a) 设计里每批的事实集合由 `NewBatch` 给出：`CommitIntend` 只带 `intents = {step}`，`CommitReceive` 只带 `results = {step}`，`CommitJudge` 只带 `judged = {step}`，`Recognize` 与 `Recover` 不带事实。`step` 在 `CommitJudge` 受理后才加一，所以同一 `step` 的三种事实各只出现一次；不同 `step` 的事实不同。于是任何事实至多出现在一批里。
(b) `changed ⊆ Members`，所以 `|changed| × WMember ≤ |Members| × WMember`。由 (a) 的构造每批至多一条事实，所以事实项 ≤ `FMax × WFact`。相加得 (b)。

无界性：上界只含常量 `C0`、`|Members|`、`WMember`、`WFact`，不含 `step`、`Len(log)`、`crashes`。TLC 的 `bad-whole-rewrite-p3` 说明批里带上全部历史事实后在第 2 批就越界。

落到字节：实现里一条事实的字节由其编解码器决定；编解码器只接受引用与小值，不接受外部拥有者的内容类型，所以每条事实有常数上界 `FactMaxBytes`。一批至多 `FMaxImpl` 条事实（每种类每步至多一条）。于是一次提交 ≤ `c0 + |Members| × MemberMaxBytes + FMaxImpl × FactMaxBytes`，与步数无关。这就是[上位不变式](../../../../../../docs/architecture/runtime/session-and-run.md#h1-agent-fact-invariants)的第 1 条「每步提交有界」。保管块不在其中：它随内容大小变，但每份内容只写一次（命题 3 的 (a) 对块引用同样成立）。

## 命题 4（P4，自有部分线性于步数）：比值由显式常数界住

**命题。**
(a) `OwnWeight ≤ (BatchesPerStep × (step − 1) + 3 + MaxCrashes + 1) × BatchBound`；
(b) `OwnWeight ≤ J0 + WStep + (logContent ÷ LogMin) × WStep`，其中 `WStep = BatchesPerStep × BatchBound`，`J0 = (MaxCrashes + 1) × BatchBound`。

**推导。**
(a) 数批。已完成的每一步至多 4 批（intend、receive、judge、至多一次 recognize，`Recognize` 的守卫 `OpOf("recognize") ∉ DOMAIN view.ops` 保证每步至多一次）；当前步至多 3 批；`Recover` 的 attach 批至多 `MaxCrashes` 次，`Init` 之后没有初始批但为对称留 1。所以 `Len(log) ≤ 4 × (step − 1) + 3 + MaxCrashes + 1`。由命题 3(b) 每批 ≤ `BatchBound`，相乘得 (a)。
(b) 每次 `CommitJudge` 受理时 `logContent` 至少加 `LogMin` 且 `step` 加一，所以 `logContent ≥ (step − 1) × LogMin`，即 `step − 1 ≤ logContent ÷ LogMin`。代入 (a)：`OwnWeight ≤ (step − 1) × WStep + (3 + MaxCrashes + 1) × BatchBound ≤ (logContent ÷ LogMin) × WStep + WStep + J0`（用 `3 × BatchBound ≤ WStep` 与 `(MaxCrashes + 1) × BatchBound = J0`）。

无界性：(a) 对任意 `step` 成立，因为每一步新增的批数与权重都有与 `step` 无关的上界（命题 3）。(b) 跟随。`MaxCrashes` 出现在界里：崩溃次数无界时 attach 批无界，但每次崩溃对应一次真实的进程重启，这不是 Journal 的增长，是运行的增长；实现里以「每次 attach 一批」计入 W 即可。

比值形式：对任何每步至少 `L` 内容字节的负载，`Own / logContent ≤ WStep / L + (J0 + WStep) / logContent`，第二项随日志增长趋于零。所以渐近比值 ≤ `WStep / L`。这个数是负载的函数（`L` 由负载决定），不是系统的性质。所以[上位不变式](../../../../../../docs/architecture/runtime/session-and-run.md#h1-agent-fact-invariants)第 3 条把量级写成传感器指标，不写成不变式（R2-D294）：系统能保证的是 `WStep`，不能保证 `L`。

TLC 的 `bad-whole-rewrite-p4` 与 `-p4-ratio` 说明整份重写让每批权重随 `step` 增长，累计成二次，在第 3 步越过两条界。

## 命题 5（P5，恢复等价）：重启后折叠出的视图等于崩溃前最后一次成功提交留下的视图

**命题。**对任意 `Crash` 之后的 `Recover` 步，`Fold(log) = lastCommittedView`（在 `Recover` 之前的状态求值）。

**推导。**`lastCommittedView` 只在 `Accept`（设计分支）、`Recognize`、`Recover` 里被置为 `view'`，而这三处 `view' = FoldN(log', Len(log'))`（命题 1 的归纳步）。之后到 `Crash` 为止，`log` 只被这三类动作改动，每次改动同时更新 `lastCommittedView`；`Refuse`、`RetrySame`、`RetryConflict` 不改两者；`Crash` 不改两者。所以在 `Crash` 之后、`Recover` 之前，`lastCommittedView = FoldN(log, Len(log)) = Fold(log)`。由 A2 新进程的 `Fold(log)` 与旧进程的相同。

无界性：论证对任意长的日志与任意次崩溃逐段成立（每两次崩溃之间重复同一论证）。TLC 的 `bad-cache-only-p5` 说明一次「只进视图不进日志」的提交就让重启后少一步。

推论（提交边界收缩的依据）：`cursor.moved` 只记变了的成员，`position` 是其中一个成员，所以恢复位置是折叠的函数。没有新事实的提交不落批，等于 `changed = {}` 且三个事实集合为空的批，`Apply` 对它是恒等映射（`rev` 除外）。所以省掉它不改变 `Fold(log)` 的游标值，恢复点不变。

## 命题 6（P6，幂等认回）：答复是本批的函数，不存副本也成立

**命题。**
(a) 一操作一批：`∀ i, j: log[i].op = log[j].op ⇒ i = j`；
(b) `∀ op ∈ DOMAIN answers: answers[op] = DeriveAt(log, view.ops[op])`；
(c) 同输入重试得到的答复等于原答复（`retryMismatch = FALSE`）。

**推导。**
(a) 设计里 `op` 由 `(step, kind)` 派生（A4），每个 `(step, kind)` 在 `CommitIntend`、`CommitReceive`、`CommitJudge` 各只受理一次（受理后 `phase` 前移，`step` 在 judge 后加一），`Recognize` 每步至多一次，`Recover` 的 attach op 带新的 `gen`。`RetrySame`（设计分支）与 `RetryConflict` 不追加。所以同一 `op` 至多一批。
(b) `answers[op]` 在该 op 的批受理时置为 `[op, rev |-> view'.rev]`（attach、普通批）或 `DeriveAt(log', Len(log'))`（recognize）。对普通批，`view'.rev = FoldN(log', i).rev`（命题 1），正是 `DeriveAt(log', i)`。对 recognize 批，`DeriveAt` 取 `target` 批的 rev，与受理时相同。此后由命题 2，`log[i]` 与 `FoldN(log, i)` 都不再变，`view.ops[op] = i` 也不变（`Apply` 只在 op 不在域里时加入）。所以等式保持。
(c) `RetrySame` 的设计分支计算 `DeriveAt(log, view.ops[op])` 与 `answers[op]` 比较，由 (b) 二者相等，`retryMismatch` 保持 FALSE。

无界性：(a) 由身份派生的单射性，(b) 由命题 2 的不变性，都与长度无关。TLC 的 `bad-retry-reexecute-p6` 说明重试若再执行一次就出现两批同 op。

推论：实现不需要 `er_operation.answer` 列。认回索引只要 `(tenant, operation) → (digest, pub)`；答复由 `pub` 那批推导。认回的 `revision` 取被认回批的修订（SPEC「原操作认回与恢复」第 1 条），模型的 `target` 字段就是它。

## 命题 7（失败不静默）

**命题。**`lastCommit = "rejected" ⇒ slot = "failed"`。

**推导。**设计里 `Refuse` 是唯一把 `lastCommit` 置为 `"rejected"` 的动作，它在同一步把 `slot` 置为 `"failed"`；另一分支置 `"retry"` 并保持槽位，命令随后重发。没有别的动作把 `lastCommit` 改回 `"rejected"`。

这是对驱动闭包的单步要求，不需要推广。实现上就是 R2-D282：`packages/agent/agent/src/provider.ts` 的驱动闭包看 `runExecution` 的返回值，失败时槽位改 `failed` 并写 warn。TLC 的 `bad-silent-stop` 复现了 R2-D282 修复前的症状：存储拒绝之后槽位仍为 `running`，没有任何后续动作。

## 8 模型没有证明的

- 多 execution 与多会话的交错，租户隔离，Session 参加者的 `decide` 与 `expected` 冲突，事件序号逐事件连续，保管块大于单命令上限时的分提交，推进资格快照读的窗口。这些由存储与提供者车道的用例覆盖，见 [README](../README.md#覆盖)。
- 实现的 `fold` 确实纯（A2），编解码器确实只接受引用。这两条由属性测试与类型级守卫守住，它们归事实车道。
- 字节与权重之间的对应：命题 3 的字节版本依赖「每条事实有常数上界」，这由编解码器的运行时检查守，模型只用权重。
