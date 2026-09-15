# tools v1 的验证范围

[tools v1](v1/contract.md) 没有自己目录下的形式模型；它的条款由三处证据分担：
[run-driver v2 模型](../run-driver/verification.md)（驱动器侧的提议、门、等待与结算视图）、
[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md)（Run/Session
级联对占位与执行者的影响）、以及本页登记的调用生命周期证据模型
[ToolCall.tla](../../../docs/proposals/tool-execution/evidence/model/ToolCall.tla)
（调用进展、attempt 账本、等待关系、控制、结算交付五个维度及 `human` 调用）。模型放在
[工具执行提案](../../../docs/proposals/tool-execution/README.md)的证据目录，按 Inbound 模型的
先例登记为形式任务 `tool-execution-call-safety` 与 `tool-execution-call-progress`
（[formal-tasks.json](../../formal-tasks.json)），每次 spec-check 运行；重放与哈希由
[replay.py](../../../docs/proposals/tool-execution/evidence/model/replay.py) 写入
[results.json](../../../docs/proposals/tool-execution/evidence/model/results.json)。提案尚未
接受：模型证明的是候选设计的性质，条款覆盖表里标"提案"的行在接受前不构成 v1 的证据。

## ToolCall 模型

调用分 `tool`（执行 owner 为本地/shell owner）与 `human`（执行 owner 为人类决定提供者，
答复即结算）两种；每调用一个 attempt；Run 抽象为 none / running / waiting / interrupted /
terminal / cancelled，一个等待位置；Session 为 open / archived；执行 owner 可崩溃至多
`MaxCrash` 次。抽象与边界见[证据说明](../../../docs/proposals/tool-execution/evidence/README.md)。

| 配置 | 规范映射 | 有限范围与结果（2026-09-14，8 核 4 worker） |
|---|---|---|
| ToolCall.cfg（安全） | TypeOK；SettledDelivered（[TL-07](v1/contract.md) 终态与 [SE-12](../session/v1/contract.md) 结算 arrival 同提交，[T-2](../../../docs/proposals/tool-execution/invariants.md#调用)）；UnknownAfterDispatch（TL-07/[RD-16](../run-driver/v2/contract.md)：unknown 只在 dispatch_intent 耐久后）；AttemptAfterAdmission（[TL-08](v1/contract.md)：准入前无 attempt，human 调用无 owner attempt）；HumanByAnswer（H-1：human 调用恰由答复结算成功）；TerminalRunOnlyBackground（[SE-17](../session/v1/contract.md)、[RN-02](../run/v1/contract.md)：终态 Run 下只剩后台工作或 stop 进行中的调用）；ArchivedNoPending（[SE-14](../session/v1/contract.md) D2）；NoStaleContinuation（SE-17）；FenceConsistent（[TL-09](v1/contract.md)：fence 不留无停止的开放调用）；动作性质 SettledStable、AttemptMonotone（T-5：账本只前进，恢复不重发）、FenceMonotone、NoStartAfterFence（TL-08 墓碑）、ConsumedOnce、AnswerOnce、InterruptKeepsHuman（[HD-04](../human-decisions/v1/contract.md)、PF-013.C4）、ArchiveKeepsWork（[TL-11](v1/contract.md)、政策 b）、SupersedeReleasesPositions / SupersedeKeepsWork（[RN-04](../run/v1/contract.md)、[SE-08](../session/v1/contract.md)，提案候选政策决定点 af：被新输入越过的 Run 释放全部等待位置，开放请求与后台工作不动） | 2 调用（种类自由）、至多 1 次 owner 崩溃、Run 的 interrupt / interrupt_then_run / cancel / 不可恢复失败、对称约减；40.0 万不同状态、15 秒，通过 |
| ToolCallProgress.cfg（进展） | CallsSettle（TP-1：proposed 最终终态）；SettlementsResolve（TP-3：结算最终被消费或关闭）；StopsProgress（TP-2：stop 请求最终得到物理事实）；HumanRequestsResolve（TP-4：请求最终被答复或关闭，以"用户最终答复"为假设） | 1 调用、至多 1 次崩溃；系统动作弱公平，Consume/RunStart 强公平，审批、答复、resume 为环境假设；3.6 千不同状态、2 秒，通过 |
| ToolCallProgressTwo.cfg（进展补充，不登记） | 同上四条进展性质 | 2 调用、无崩溃；24.0 万不同状态、约 3.5 分钟，通过；只在重放脚本里运行 |
| ToolCallRedispatch.cfg（否定，不登记） | 恢复时把已耐久 dispatch_intent 的 attempt 重发：期望违反 AttemptMonotone | 找到反例（约 3.3 千状态、1 秒内），证明 T-5 的保护点是恢复只 inspect 不重发 |

形式任务命令带 `-deadlock`（终态无后继，死锁检查关闭；卡住由进展性质检查）。结算交付
维度按 SE-14 建模：曾阻塞 Step 的调用在 Run 活动时结算为 continuation，`human_wait` 只在
Run 已等待时为 continuation，后台为 context；context 从不唤醒等待中的 Run（细节与其它抽象
见[证据说明](../../../docs/proposals/tool-execution/evidence/README.md)）。

模型发现：(1) 停止先于 start 时 fence 与 `cancelled_before_execution` 结算在同一提交，
所以"fence 后 owner 迟到 start"被 `prog = admitted` 守卫排除，`NoStartAfterFence` 由提交
结构保护；owner 账本里 start 与 fence 的排序（TL-08）是提供者验收项，模型不单独覆盖。
(2) 两调用加崩溃的活性检查在本机超过 10 分钟，登记的进展配置按裁决 h（单配置 ≤ 1 分钟）
缩到 1 调用；两调用的交错由安全配置和不登记的补充进展配置覆盖。(3) 等待位置被释放
（批准变后台启动）后若 Run 仍 waiting，后台结算的 context 无人消费，TLC 否定了首版的
`SettlementsResolve`；模型改为位置释放即重评（[RD-11](../run-driver/v2/contract.md) 出边），
契约不改。

## 条款覆盖

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [TL-01](v1/contract.md) 定义、命令表、校验后解析 | 无模型；[schema.md](../../../docs/proposals/tool-execution/schema.md)（提案）定投影与发布检查 | 校验 profile 与投影的实现测试 |
| [TL-02](v1/contract.md) 别名 | 无模型；[T-7](../../../docs/proposals/tool-execution/invariants.md#调用)（提案） | manifest 解析测试 |
| [TL-03](v1/contract.md) discover 摘要与披露 | 无模型 | 披露策略测试 |
| [TL-04](v1/contract.md) 权限声明与准入 | RunDriver.cfg（门与 ask/deny）；ToolCall.cfg（GateAllow/Ask/Deny 三分支） | AU 解析器细节归 [action-authorization](../action-authorization/README.md) |
| [TL-05](v1/contract.md) 必需 skill | 无模型 | 装配测试（MC-07） |
| [TL-06](v1/contract.md) 绑定撤回与 stale_binding | 无模型；[级联表](../../../docs/proposals/tool-execution/lifecycle.md#控制与级联表)末行（提案） | 发布单位注销测试 |
| [TL-07](v1/contract.md) 调用进展与 unknown | ToolCall.cfg（状态图全部转移、SettledStable、UnknownAfterDispatch）；RunDriver.cfg（结算视图） | `resolution` 追加与费用暴露 |
| [TL-08](v1/contract.md) attempt 账本、墓碑、恢复重发 | ToolCall.cfg（AttemptAfterAdmission、AttemptMonotone、NoStartAfterFence）；否定变体 redispatch | owner 侧 start/fence 账本排序；多 attempt 政策 |
| [TL-09](v1/contract.md) 停止 | ToolCall.cfg（FenceConsistent、FenceMonotone）；Progress（StopsProgress） | `forced_isolation` 的 `possible_effect`、清理失败 retained |
| [TL-10](v1/contract.md) 前后台关系与自动转换 | ToolCall.cfg（Detach/DetachConfirm/DetachFail、TerminalRunOnlyBackground、RunWake） | 有效阈值三值与计时来源（[T-11](../../../docs/proposals/tool-execution/invariants.md#调用)，提供者验收） |
| [TL-11](v1/contract.md) 崩溃与归档后后台 | ToolCall.cfg（OwnerCrash/OwnerRecover、ArchiveKeepsWork、ArchivedNoPending、RunFail 后后台不变） | 独立进程 owner（决定 b 留边界） |
| [RN-04](../run/v1/contract.md) / [SE-08](../session/v1/contract.md) interrupt_then_run | ToolCall.cfg（RunInterruptThenRun：未启动调用取消、前台调用转后台或 stop、开放请求与后台调用保留、等待位置整体释放；SupersedeReleasesPositions、SupersedeKeepsWork） | 提案候选政策（[决定点 ad～ag](../../../docs/proposals/tool-execution/README.md#确认报告后的决定点待用户2026-09-15)），与 RN-04"保留"、HD-04"答复不驱动新 Run"的措辞不同，随缺口表发版；停止未知的可见状态与系统超时不建模 |
| [RN-02](../run/v1/contract.md) / [RD-13](../run-driver/v2/contract.md) 不可恢复失败的收口 | ToolCall.cfg（RunFail：未准入调用取消；已准入调用与未答问题保留并失去等待位置，结算按 SE-14 C 列触发新 Run；FailKeepsHuman、TerminalRunOnlyBackground） | 提案按用户裁决 U-43 建模，与 RN-02"关闭剩余请求"的措辞不同，措辞缺口随闭环发版 |
| [TL-12](v1/contract.md) 帧 | 无模型；[frames.md](../../../docs/proposals/tool-execution/frames.md)（提案）定事实侧 | 序号、缺口与读权的实现测试 |
| [TL-13](v1/contract.md) 扩展点 | 无模型；[cordis.md](../../../docs/proposals/tool-execution/cordis.md#hooks-兼容层在工具站点的落点)（提案） | 守卫只收紧的单测（run-driver 场景 S20） |
