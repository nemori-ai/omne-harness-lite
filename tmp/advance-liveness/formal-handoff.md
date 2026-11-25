# 形式化交接表与转契约测试清单（修订 2）

模型：`models/AdvanceLiveness.tla`（修订 2，2026-11-26）。配置与预期：`models/expect.txt`。读数：`evidence/tlc-rev2/*.log`。
工具：TLC（tla2tools 1.7.4）。常量：`Inputs = {1, 2}`、`MaxSteps = 2`、`MaxCancels = MaxRestarts = MaxOutages = MaxHalts = 1`。应然配置 5,299 个不同状态。

跑法（在 `models/` 下，环境见仓库 `CONTRIBUTING.md`「形式工具链」）：

```sh
source ~/.config/omne/environment.sh
"$JAVA_BIN" -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 2 -deadlock -config ought.cfg AdvanceLiveness.tla
```

## 修订记录

- **修订 1（2026-11-25，已撤下）**：模型里有一个进程内的「发件箱」（Agent 已受理、交入事实还没写进日志的输入），应然要求「发件箱清空才能收场、交入事实延后再提交」。它建立在两个错的环境假设上：交入事实终究写得进日志；收尾要等交入事实。发行装配里交入回执没有证据来源（下面 E1），这个设计在发行环境下违反活性。修订 1 的日志留在 `evidence/tlc-*.log`（不带 `rev2`），只作历史。
- **名字撞车**：修订 1 的「发件箱」不是架构里的发件箱。架构的发件箱（原文用词是 outbox）在 `docs/architecture/data-and-state.md` 讲正式消息队列的那几段：业务变更、通知身份、接收责任与发件箱记录同一个 SQL 事务保存，对方给出持久承接证明后才销账，定期扫描没销账的。输入的交付已经符合这个形状：会话日志里的待处理资格就是发件箱记录（与受理同一次提交），周期扫描重投，Agent 取走输入的那次提交销账。再造一个进程内的发件箱是多余的第二套机制。
- **修订 2**：环境按发行装配写（下面的 E1 到 E10，其中 E1 到 E3 是推翻修订 1 的三条），应然取第 1 程（卡 #1655）已经兑现的两处，加上 F1 的批界。还没关上的缺口单列成一份会失败的配置。

## 量设计的尺子

每一条推进义务都要能从日志现算出来，进程内的状态只许让推进器多做一次幂等的认回，不许让它少做一步；并且有周期扫描兜底。模型里对应：`Restart` 丢掉 `known`、驱动与执行槽之后，系统照样收场；去掉 `Scan` 就卡死。

今天不满足这把尺子的两处：

1. 停下的 execution 由谁、在几次之内终结（`gap-deterministic-halt.cfg`）。
2. 日志解释的永久失败无限重试（`as-is.md` 的 R5；不在这份模型里，在 `totalization.md` 表 5）。

## 验证了什么、前提与上界

| 配置 | 结果 | 说明 |
| --- | --- | --- |
| `ought.cfg` | 通过 | 应然：`Bugs = {}`、`Deterministic = FALSE`。四条不变式与两条活性都成立 |
| `is-after-run1.cfg` | 通过 | 第 1 程之后的实然（只带首条输入开轮）。不查 `BatchNotSplit`。说明 F1 是批界问题，不是活性问题 |
| `bad-first-only.cfg` | 违反 `BatchNotSplit` | 今天的 F1。反例：发两句、开轮只带一句、第一步只取走一句 |
| `bad-halt-pins-slot.cfg` | 违反活性 | 第 1 程之前。反例：开轮、驱动停下带着执行槽、恢复看到「在跑」，这一轮永不收场 |
| `bad-failed-finish-blocked.cfg` | 违反 `ActiveRunSettles` | 第 1 程之前。反例：走到步数上限时还有一句已受理未取走，既走不了下一步也收不了尾 |
| `bad-no-scan.cfg` | 违反活性 | 依赖坏着的时候重启，叫醒用掉，之后没有人再叫醒 |
| `bad-void-answered.cfg` | 违反 `AnsweredNotPending` | 安全负对照 |
| `gap-deterministic-halt.cfg` | 违反 `ActiveRunSettles` | **没关上的缺口，不是负对照**。反例：收尾提交确定地失败，驱动停下，恢复接手，再停下，循环不止 |

前提：依赖坏的次数有界，之后一直可用；系统动作强公平；扫描弱公平；人的发送、取消、重启、驱动因会过去的原因停下、模型多要一次工具，都不加公平但次数有界。

上界：2 条输入、步数上限 2、取消、重启、依赖中断、会过去的停下各 1 次。

没有验证的：

- 模型动作与代码步骤的逐条对应只做到下表的程度，标「读码」的没有在运行的系统上验过。
- 多于 2 条输入、多次取消与重启的组合。
- 归档与撤销归档（F11）、卡片与后台调用、插队、「等这一轮结束再发」的输入：都不在这份模型里。
- 多个会话之间的公平（归存储公平那一程的模型）。
- Agent 运行时内部一步的节点（已有模型 `packages/agent/agent/verification/run-lifecycle/`）。

## 环境假设（逐条对过发行装配）

| 编号 | 假设 | 证据 | 级别 |
| --- | --- | --- | --- |
| E1 | 交入回执没有证据来源，日志里的「已交入」永远是空的；Session 只靠进程内的 `known` 记住交过哪些输入 | `apps/harness-server/src/entry/session-evidence-sources.ts` 两个 `prepare` 无条件答 `unavailable`；现场日志里 `C2 receive unavailable` 在每一轮都出现，包括正常收场的（`as-is.md` 更正节）；#1195、#1197 的 G8 | 证实 |
| E2 | 待处理资格在 Agent 的一步取走输入时解除，不在交入时 | `packages/session/SPEC.md`「受理、承接、交入、解除是四件事」；复现 `evidence/repro/second-at-45`：一轮进行中再发一句，被后面的一步取走，这一轮正常完成 | 证实 |
| E3 | 以完成收尾时还有待处理输入就被挡回，Agent 回去再走一步；以失败收尾不挡 | `judgeCompletion`；复现 `evidence/repro/second-at-50-step-limit`（改前不收场）与 `…-FIXED`（改后以 `failed` 收场） | 证实 |
| E4 | 驱动停下后让出执行槽，execution 在执行记录里仍未终结 | 成员用例 `provider-run-failure.spec.ts`、`provider-slot.property.spec.ts` | 成员级证实；发行组合上没复现出导火索 |
| E5 | 恢复对「槽空着、execution 未终结」的一轮接手：`inspect` 得到失联，`detach`、`claim`、`resume` | `recover.ts` 的 `check`、`agent-drive.ts` 的 `inspect`、`contact.ts` | **读码**。`contact` 的答复有成员用例；整条接手路没有在发行组合上跑过 |
| E6 | 重启后首批还没被取走时，按原操作身份重放发起，Agent 认回原受理 | `advance.ts` 的 `replay`；现场两次重启后 `claim` 都答 ok（`f11/report.md`） | 读码加现场旁证 |
| E7 | 失败的一轮结束后会话停着等人，没取走的输入保留待处理；人的新输入开下一轮 | 真部署实测 F1（`findings.md`）：失败一轮的输入在下一句到来后被回答 | 证实 |
| E8 | 取消之后，待处理的输入自己开下一轮 | `packages/session/SPEC.md`「这一轮完成或被取消，等着的取得资格」；复现 `evidence/repro/cancel-*` | 证实 |
| E9 | 周期扫描对有待处理输入或活跃 Run 的会话叫醒推进与恢复 | `scan.ts`；现场约 37 秒一次 | 读码加现场旁证 |
| E10 | 依赖不可用时有界重试用完，这次叫醒被用掉 | `advance.ts` 的 `retries-exhausted`；现场 `C2 invoke retries-exhausted` | 证实 |

## 交接表

### 状态变量

| 模型变量 | 代码里的对应 | 拥有者 |
| --- | --- | --- |
| `pending`、`answered`、`run`、`awaiting`、`runAns`、`stepped`、`steps` | 会话日志与工作快照（`WorkSnapshot.pending`、`run`、`awaitingPerson`、承接事实、步的提交） | Session |
| `batch` | 今天：开始事实里的 `first`。应然：开始事实里的一批 | Session |
| `execOpen`、`agentAcc` | Agent 执行记录：execution 的状态、已受理的输入 | Agent |
| `known` | `known-handovers.ts`，进程内 | Session |
| `drive`、`slot` | `provider.ts` 的驱动与 `Slot`（`free`、`reserved`、`running`；模型把后两个并成 `held`） | Agent |
| `poison` | 环境：收尾提交确定地失败（现场 `command_limit` 落在 F2） | 环境 |
| `wake` | `advance.trigger` 与 `recover.trigger` 的叫醒，含 `scan.ts` | Session |
| `waiting0`、`split` | 观察量，不进代码 | — |

### 每个操作的定义域与定义域外

| 模型动作 | 代码 | 定义域 | 定义域外 |
| --- | --- | --- | --- |
| `OpenRun` | `openRun` → `startRun` | 没有活跃 Run、不在等人、有待处理输入、依赖可用 | 依赖不可用：重试用完，叫醒用掉，等扫描。等人：不开 |
| `InvokeOk` | `invoke` | 活跃、execution 还没创建、执行槽空、依赖可用 | 槽一时被占（上一轮的驱动还没收场）：Agent 答忙，重试用完后等扫描。第 1 程之后槽不会被一个已经停下的驱动永久占着；模型把取消与让槽写成一步，没有覆盖这段短暂的忙 |
| `ReplayOk` | `replay` | 活跃、execution 已创建、首批既不在 `known` 也没被取走 | — |
| `SubmitOk` | `handIn` → `submit` | 活跃、execution 已创建、有没交过的待处理输入 | 依赖不可用：等扫描。准入拒收：这条输入失去待处理资格（不在模型里） |
| `RecoverResume` | `recover.check` → `inspect`、`detach`、`claim`、`resume` | 首批已交或已取走、没有驱动、执行槽空 | 槽被占：宿主答在跑，不接手 |
| `AgentStep` | 一步的开始提交（取走输入并送达）到这一步的回答 | 驱动在推、步数未到上限、有已受理的待处理输入 | 到上限：只能收尾 |
| `ToolStep` | 模型又要了一次工具 | 驱动在推、步数未到上限 | — |
| `FinishComplete` | 条件终结，结论完成 | 驱动在推、没有待处理输入、收尾提交不确定地失败 | 有待处理输入：挡回，回去取。收尾确定失败：停下（`Halt`） |
| `FinishFailedAtLimit` | 循环守卫到步数上限，条件终结，结论失败 | 驱动在推、步数到上限 | 收尾确定失败：停下 |
| `Halt` | `provider.ts` 的 `failRun` | 驱动在推 | — |
| `Cancel` | 人取消一轮：Session 写终态 | 有活跃 Run | — |

## 证明转契约测试

| 性质 | 契约测试 | 状态 | 去掉什么会变红 |
| --- | --- | --- | --- |
| `DriveHoldsSlot`，停下让出执行槽（E4） | `packages/agent/agent/tests/provider-slot.property.spec.ts`（fast-check：任意「完成、停下」序列，每次受理都成功，每次停下恰好报告一次） | 已有（第 1 程） | `failRun` 里让出槽位的那一行；反例缩到 `[["halts"]]` |
| 失败的收尾不被挡回（E3） | `packages/session/session-contract/tests/decide-reduce.spec.ts` 的 property（结论 × 待处理 × 已交入 × 推迟）；`packages/agent/agent/tests/loop-run-steps.spec.ts` 的上限用例 | 已有（第 1 程） | `judgeCompletion` 里失败那一行；`endsWithUntakenInput` 里的 `guard` |
| 宿主如实答失联（E5 的一半） | `packages/agent/agent-host-local/tests/recovery.spec.ts` 的 contact 一组 | 已有（第 1 程） | `contactOf` 里的 `holds` |
| `BatchNotSplit`（I-4，F1） | 任意受理与失败交错：新一轮第一步取走开始时全部待处理的普通输入；每条输入恰好被回答一次 | **待写**（批界那一程） | 只带首条输入 |
| `ActiveRunSettles` 对整条接手路（E5） | 生成的命令序列：发送、依赖翻转、取消、重启、停下、扫描到期，替身驱动口按序列答；断言依赖恢复后有界步数内这一轮收场 | **待写**。对象是 `session` 的推进协调配内存会话日志替身与驱动口替身 | 去掉扫描；让恢复不接手 |
| `gap-deterministic-halt` 关上之后 | 同一节点连续停下若干次后，这一轮以失败终结 | **待定设计**：由谁数、数在哪、几次 | — |
| `AnsweredNotPending`（I-4） | 任意受理、失败、取消交错：已回答的输入不回到待处理 | 待写 | 取消时退回本轮已回答的输入 |
