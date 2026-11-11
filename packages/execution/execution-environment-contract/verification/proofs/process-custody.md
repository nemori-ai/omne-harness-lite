# ProcessCustody 不变式的手写证明

本页对 [ProcessCustody.tla](../models/ProcessCustody.tla) 的不变式做动作归纳，把 TLC 在有限常量下的结果推广到任意有限的 `Units`、任意的 `Cap ≥ 1`、`MaxRest` 与 `MaxCrash`。性质与 SPEC 条款的对应见 [formal-mapping.md](../formal-mapping.md#性质与条款)。

## 范围与方法

- 证明是手写的，没有机器检查。它不是 TLAPS 证明。
- 常量取目标值：`Containment = "sealed"`、`Policy = "retain"`、`RecheckClosed = TRUE`、`RecheckPhase = TRUE`、`EvictOldest = FALSE`、`HonestEnum = TRUE`。`Bound` 取任意值。每条证明写明它用到哪一个目标取值，对应的负控正是去掉这一取值。
- 范围仍是一份获取 A 与一个保留范围 R。多份获取与多个保留范围不在本页。
- 方法：对每条性质 P，证明 `Init ⇒ P`，并且对 `Next` 的每个析取项 S，`P ∧ L ∧ S ⇒ P′`，其中 L 是下面「引理」一节已经证明的引理。模型里的 `Auxiliary` 有 15 个合取项，本页只证明其中被下文用到的几项（L-A 至 L-D、L-K、L-R、L-T）。其余合取项只由 `ProcessCustody-inductive.cfg` 在 1 个执行域下检查，本页不推广。
- 记号：`ph[u] = "none"` 表示执行域 u 还没有记账。`Live(u)` 表示 u 里有活进程。「改变 ph 的动作」指下表所列的动作。

| 动作 | 改变 `ph` 的方式 |
| --- | --- |
| `PlanAcq`、`PlanRet` | `none → planned` |
| `Launch` | `planned → running` |
| `Refuse` | `planned → stopped` |
| `PrimExit` | `running → exited`（命令）或 `running → stopping`（终端） |
| `Dispose` | 停止分支 `exited → stopping`；目标取值下没有其他改变 |
| `Commit` | `exited → retained` |
| `Abort` | `exited → stopping`，其余阶段不变 |
| `Stop` | `running`、`exited`、`retained → stopping` |
| `Confirm` | `stopping → stopped` |
| `Drain`、`Expire` | `retained → stopping` |
| `Release`、`DrainSweep` | 获取名下的 `planned → stopped`，`running`、`exited → stopping` |
| `CloseScope`、`CloseSweep` | 保留范围名下的 `planned → stopped`，`running`、`retained → stopping` |

没有动作把 `ph` 改成 `none`，也没有动作使 `ph` 离开 `stopped`。这两点在下面多处使用，记为事实 F1、F2。

## 引理

**L-A（未记账即无归属、无进程、不在内存）：**`ph[u] = "none" ⇒ own[u] = "none" ∧ ¬Live(u) ∧ ¬known[u]`。

- `Init`：全部成立。
- 改变 `own` 的只有 `PlanAcq`、`PlanRet`（同时使 `ph` 离开 `none`）与 `Commit`（守卫 `u ∈ resv`，由 L-D，`ph[u] ≠ "none"`）。
- 使 `Live` 变真的只有 `Launch`（守卫 `ph = "planned"`）与 `ForkPlain`、`ForkImmune`（守卫 `Live(u)`）。
- 使 `known` 变真的只有 `PlanAcq`、`PlanRet`（同时使 `ph` 离开 `none`）与 `Recover`（只对 `ph ≠ "none"` 的执行域）。
- 由 F1，`ph` 不会回到 `none`。所以 L-A 保持。

**L-B（计划中没有进程）：**`ph[u] = "planned" ⇒ ¬Live(u)`。

- 进入 `planned` 只经 `PlanAcq`、`PlanRet`，此前 `ph = "none"`，由 L-A，`¬Live(u)`，而这两个动作不改变进程。
- 处在 `planned` 时，使 `Live` 变真的动作只有 `Launch`，它同时把 `ph` 改为 `running`。`Fork` 要求 `Live(u)`，不可用。

**L-C（记账即有归属）：**`ph[u] ≠ "none" ⇒ own[u] ≠ "none"`。

- 使 `ph` 离开 `none` 的只有 `PlanAcq`、`PlanRet`，它们同时给 `own` 赋值。
- 没有动作把 `own` 改成 `none`。

**L-D（预留中的执行域已退出或在停止）：**`u ∈ resv ⇒ ph[u] ∈ {"exited", "stopping", "stopped"}`。

- 加入 `resv` 只经 `Dispose` 的预留分支，守卫 `ph[u] = "exited"`。
- u 在 `resv` 中时，`ph[u]` 可能经 `Release`、`DrainSweep`、`Stop` 改为 `stopping`，再经 `Confirm` 改为 `stopped`。`Commit` 把 `ph` 改为 `retained`，同时把 u 移出 `resv`。没有其他动作能把 `exited`、`stopping`、`stopped` 改成别的阶段。

**L-K（索引完整时内存覆盖全部记账）：**`indexComplete ⇒ ∀u：ph[u] ≠ "none" ⇒ known[u]`。用到 `HonestEnum = TRUE`。

- `Init`：`ph` 全为 `none`。
- `PlanAcq`、`PlanRet` 同时置 `known[u]`。
- 使 `known` 变假的只有 `Crash`，它同时置 `indexComplete = FALSE`。
- 使 `indexComplete` 变真的只有 `Recover`。`HonestEnum = TRUE` 时，它对每个 `ph ≠ "none"` 的执行域置 `known`。
- 负控 N4 取 `HonestEnum = FALSE`：`Recover` 可以只认回一个子集，却仍置 `indexComplete = TRUE`，L-K 不成立，于是 `ClosureTruth` 或 `SettleTruth` 被违反。

**L-R（封闭完成意味着已封闭）：**`closureDone ⇒ closed`。使 `closureDone` 变真的只有 `ClosureDone`，它的守卫含 `closed`。没有动作使 `closed` 变假。

**L-T（结清时没有预留）：**`acqSt = "settled" ⇒ resv = {}`。使 `acqSt` 变为 `settled` 的只有 `Settle`，它的守卫含 `resv = {}`。向 `resv` 加入执行域只经 `Dispose`，它要求 `ph[u] = "exited" ∧ own[u] = "acq" ∧ known[u]`。结清之后由下面 T8 的 `SettleTruth`，获取名下的执行域都处在 `none` 或 `stopped`，没有执行域满足 `Dispose` 的守卫。两条性质一起对动作归纳。

**L-S（获取不会重新打开）：**`acqSt` 只按 `open → draining → settled` 前进。`Release` 与 `Crash` 把 `open` 改为 `draining`，`Settle` 把 `draining` 改为 `settled`。没有动作使它后退。

## 不变式

**I1、I2（唯一归属，归属只向前）。**I1 即 L-C。I2 是步骤性质 `OwnerOnlyForward`：改变 `own` 的只有 `PlanAcq`、`PlanRet`（从 `none` 改为 `acq` 或 `ret`）与 `Commit`（守卫 `own[u] = "acq"`，改为 `ret`）。所以归属只能从未定义改为某一方，或从获取改为保留范围。

**I3（活着即已记账）：**`Live(u) ⇒ ph[u] ≠ "none"`。由 L-A 的逆否命题。

**I4（停止为真，`StopTruth`）：**`ph[u] = "stopped" ⇒ ¬Live(u)`。

- 进入 `stopped` 的途径：`Confirm`，守卫 `¬Live(u)`；`Refuse` 以及 `Release`、`DrainSweep`、`CloseScope`、`CloseSweep` 中从 `planned` 改为 `stopped` 的分支，由 L-B，此前 `¬Live(u)`，这些动作不改变进程。
- 处在 `stopped` 时，`Launch` 要求 `planned`，`Fork` 要求 `Live(u)`，都不可用。由 F2，u 一直处在 `stopped`。

**I5（封闭即终）。**在含崩溃的模型里，I5 分成两条安全性质与一条活性：

- `NoEntryAfterClose`：范围封闭之后，没有执行域进入 R。进入 R 的途径只有 `PlanRet`（守卫 `¬closed`）与 `Commit`（`RecheckClosed = TRUE` 时守卫 `¬closed`）。负控 N5 取 `RecheckClosed = FALSE`：`Dispose` 在封闭前预留，`Commit` 在封闭后提交。
- `ClosureTruth`：`closureDone ⇒ ∀u：own[u] = "ret" ⇒ ph[u] ∈ {"none", "stopped"}`。见下面 T8。
- 活性 L1（`ClosureEnds`）只由 TLC 在 `ProcessCustody-live.cfg` 的规模内检查，本页不推广。

**I6（保留活过获取，`RetainedSurvivesRelease`）。**`Release`、`DrainSweep` 只改变 `own[u] = "acq"` 的执行域的阶段，`Settle` 不改变任何阶段。所以这三个动作不改变 `own[u] = "ret"` 的执行域。

**I7（不驱逐，`NoEviction`）：**`Occ ≤ Cap ∧ ¬evicted`，其中 `Occ = |Duty("ret")| + |resv|`。用到 `EvictOldest = FALSE`。

- `Init`：`Occ = 0`。
- 使 `Occ` 增加的动作：`PlanRet`（守卫 `Occ < Cap`，加 1）与 `Dispose` 的预留分支（守卫含 `Occ < Cap`，加 1）。
- `Commit` 把 u 从 `resv` 移进 `Duty("ret")`，`Occ` 不变。`Abort`、`Confirm` 与其他动作只使 `Occ` 不变或减少。
- `evicted` 只在 `Dispose` 的驱逐分支被置真，该分支要求 `EvictOldest`。
- 把 `retained` 改为 `stopping` 的动作是 `Stop`、`Drain`、`Expire`、`CloseScope`、`CloseSweep`，它们的守卫都不含容量。所以容量不足从不停止已保留的执行域。负控 N3 打开驱逐分支。

**I8（预留来自获取，`ReservedFromAcq`）：**`u ∈ resv ⇒ own[u] = "acq" ∧ kind[u] = "cmd"`。

- 加入 `resv` 只经 `Dispose`，守卫 `own[u] = "acq" ∧ kind[u] = "cmd"`。
- u 在 `resv` 中时，改变 `own[u]` 的只有 `Commit`，它同时把 u 移出 `resv`。改变 `kind[u]` 的只有 `PlanAcq`、`PlanRet`，它们要求 `ph[u] = "none"`，由 L-D 不可能。

## 定理

**T3（移交恰好一次，`OneDisposition`）：**`¬(stopDecided[u] ∧ retainDecided[u])`。用到 `RecheckPhase = TRUE`。

- `retainDecided[u]` 只由 `Commit` 置真。之后 `own[u] = "ret"`（由 I2 不再改变），`ph[u] = "retained"`。
- `stopDecided[u]` 只在 `ph[u] = "exited"` 时被置真：`Dispose` 的停止分支、`Abort`、`Stop`、`Release`、`DrainSweep`。进入 `exited` 只经 `PrimExit` 从 `running`，进入 `running` 只经 `Launch` 从 `planned`。`Commit` 之后 u 处在 `retained`，由上表，它只能走向 `stopping` 与 `stopped`，不会回到 `exited`。所以先移交、后停止的顺序不可能置 `stopDecided`。
- 反过来，置 `stopDecided[u]` 的五个动作都在同一步把 `ph[u]` 从 `exited` 改为 `stopping`。此后 `ph[u]` 只能是 `stopping` 或 `stopped`。`Commit` 的守卫要求 `ph[u] = "exited"`，所以先停止、后移交的顺序也不可能。
- 负控 N6 取 `RecheckPhase = FALSE`：`Release` 已把预留中的执行域改为 `stopping`，`Commit` 仍把它移交。

**T5（封闭即终）**由 I5 的两条安全性质组成。

**T8（恢复覆盖）：**`SettleTruth` 与 `ClosureTruth`。用到 `HonestEnum = TRUE`。

- `SettleTruth`：`acqSt = "settled" ⇒ ∀u：own[u] = "acq" ⇒ ph[u] ∈ {"none", "stopped"}`。
  - `Settle` 的守卫是 `indexComplete ∧ resv = {} ∧ ∀u：known[u] ∧ own[u] = "acq" ⇒ ph[u] = "stopped"`。由 L-K 与 L-A，每个 `own[u] = "acq"` 的执行域都有 `ph[u] ≠ "none"` 且 `known[u]`，所以都已停止。
  - 结清之后：由 L-S，`acqSt` 不再是 `open`，`PlanAcq` 不可用；由 F2，已停止的执行域不再离开 `stopped`。由 L-T，`resv` 保持为空，所以不会有执行域经 `Commit` 改变归属。
- `ClosureTruth`：`closureDone ⇒ ∀u：own[u] = "ret" ⇒ ph[u] ∈ {"none", "stopped"}`。
  - `ClosureDone` 的守卫与 `Settle` 同形，只是归属方是 `ret`。同样由 L-K 与 L-A，R 名下的执行域都已停止。
  - 之后：由 L-R，`closed` 成立，且不会变假。进入 R 的 `PlanRet` 与 `Commit` 都要求 `¬closed`。由 F2，已停止的执行域不再离开 `stopped`。
- 崩溃之后，`Crash` 置 `indexComplete = FALSE`，所以 `Settle` 与 `ClosureDone` 都等到 `Recover` 完整地认回之后才可能前进。这就是 SPEC 中「恢复只在枚举完整时前进」的形式含义。

## 不在本页

- T1（`NoLeak`）：`out` 只由 `Escape` 增加，`Escape` 要求 `Containment = "pgroup"`。目标取值下 `out` 恒为 0。这一条的实质在平台前提 P4，不在模型。
- T10（`KeepWhenPermitted`）：目标取值下 `denied` 恒为假。实质内容是 `Dispose` 的守卫：可以保留且有留下的进程时，停止分支的守卫 `left = 0 ∨ ¬keep` 为假，只有预留分支可用。
- 活性 L1、L2、L3 只由 TLC 在 `ProcessCustody-live.cfg` 的规模内检查。
- 多份获取与多个保留范围、租户隔离（T9）。
- [TerminalSegments](../models/TerminalSegments.tla) 的性质 S1 至 S5 只由 TLC 检查，本页不推广。
