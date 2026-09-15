# human-decisions 的验证范围

当前正式契约是 [human-decisions v2](v2/contract.md)。它的条款由三处证据分担：本页登记的两个
模型 [Decisions.tla](v2/Decisions.tla)（合法作答、独立请求的接续与活性）与
[Provisional.tla](v2/Provisional.tla)（暂行依赖的批准、生效与逆序撤销）、
[tools 验证范围](../tools/verification.md)登记的 ToolCall 模型（内建 `human` 调用、控制级联与
结算路由）、以及 [run-driver 验证范围](../run-driver/verification.md)登记的驱动器模型（系统
批准的消费与等待出边）。模型检查是有限状态证据，不是无界系统或真实实现的证明。

## v2 的形式工件与登记

[v2 目录](v2/)内的四个文件是 [v1](v1/) 的逐字节副本，SHA-256 相同，本次发版**没有重跑
TLC**：v2 对 HD-01/06/10/11 未改一字，对 HD-02/03/04/05/07/08/09/12 的改动与 HD-13 的新增都
落在这两个模型不建模的维度（调用、Run 状态、等待登记簿、作答主体的组织关系、读面），
模型的状态空间与性质不受影响，v1 的运行结果直接适用。

| 文件 | SHA-256 | 内容 |
|---|---|---|
| [Decisions.tla](v2/Decisions.tla) | `e832652d14fd0a60e19eb8e9ee5630277a70a10549871eaa6d51c4f7134b358a` | 两个独立问题、owner 与 admin 两类作答者、逐个接续、Run 完成、中断与关闭 |
| [Decisions.cfg](v2/Decisions.cfg) | `957e416940d7ea91ec238929e85b5f862cc271c37637892ead3983044b800bc5` | 正向配置：三条不变量与一条活性 |
| [Provisional.tla](v2/Provisional.tla) | `a56e91a28443762ce65d219f2a367c42c9ea875efc0472b6fb1a6b26dcb135ad` | 父子两节点的暂行产物：批准、拒绝、finalize 与逆序撤销 |
| [Provisional.cfg](v2/Provisional.cfg) | `87a900dabe84b7501c905f5f20a30457ae7a0a40b03044952d2d5f3c69bd6fdf` | 正向配置：两条不变量 |

形式任务 `human-decisions-v1-Decisions` 与 `human-decisions-v1-Provisional`
（[formal-tasks.json](../../formal-tasks.json)）当前登记 v1 路径；两份工件逐字节相同，执行
任一份结果一致，任务路径是否改指 v2 由本批次的发版者统一处理。否定变体不是登记任务，
它们与重放脚本、运行日志留在
[核心能力提案的证据目录](../../../docs/proposals/core-capabilities/evidence/model/results.json)，
可由 `replay.py` 在提供 JAVA_BIN 与 TLA2TOOLS_JAR 后重放。

## Decisions 模型

两个待答问题 `q1`、`q2`；作答者只有 `owner` 与 `admin` 两类；接续是逐个的原子动作；
`Interrupt` 与 `Close` 是全局阻塞与关闭。模型没有调用、Step、等待登记簿、请求 kind、
后果交付状态与时间。

| 配置 | 规范映射 | 有限范围与结果（2026-09-13 运行记录） |
|---|---|---|
| Decisions.cfg（正向） | `OnlyOwnerAnswers`（[HD-01](v2/contract.md) 作答者固定为 Session.owner、[HD-05](v2/contract.md) answer 处再次验证）；`ContinuationHasAnswer`（[HD-08](v2/contract.md)：没有答复就没有接续）；`CompletionKeepsPending`（[HD-03](v2/contract.md)、[HD-08](v2/contract.md)：仍有未消费接续时 Run 不完成，对应 [RN-02](../run/v2/contract.md) 的完成条件）；活性 `IndependentProgress`（[HD-03](v2/contract.md)：已答问题最终获得自己的接续，不被另一个仍 pending 的问题挡住；全局中断或关闭解除该义务） | 2 问题、2 类作答者；64 生成状态 / 40 不同状态，状态图深度 8，两条时序分支在 80 个不同状态上检查，1 秒内完整探索，退出 0 |
| Decisions 否定变体 `owner`（不登记） | 允许 admin 代答：期望违反 `OnlyOwnerAnswers` | 找到反例，退出 12 |
| Decisions 否定变体 `allAnswers`（不登记） | 接续要求所有问题都已答（全答屏障）：期望违反 `IndependentProgress` | 找到活性反例，退出 13 |
| Decisions 否定变体 `earlyComplete`（不登记） | 尚有未消费接续时允许 Run 完成：期望违反 `CompletionKeepsPending` | 找到反例，退出 12 |

## Provisional 模型

节点 2 依赖节点 1；产物状态 `staged / final / revoked`，决定 `pending / approve / reject`。
模型没有资格注册、遏制能力、真实撤销函数、任意 DAG 与并发屏障。

| 配置 | 规范映射 | 有限范围与结果（2026-09-13 运行记录） |
|---|---|---|
| Provisional.cfg（正向） | `DependencyFinalized`（[HD-12](v2/contract.md)：子项只在父项已正式生效后才能 finalize）；`RejectedNotFinal`（[HD-12](v2/contract.md)：被拒的产物不得生效，撤销按依赖逆序） | 2 节点、批准/拒绝/finalize/撤销；36 生成状态 / 22 不同状态，深度 5，1 秒内完整探索，退出 0 |
| Provisional 否定变体 `parent`（不登记） | 允许子项越过父项 finalize：期望违反 `DependencyFinalized` | 找到反例，退出 12 |

## v2 条款覆盖

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [HD-01](v2/contract.md) 请求身份与合法作答者 | Decisions.cfg（`OnlyOwnerAnswers`）与否定变体 `owner` | kind 的五值、内容版本、来源不可由自由文本推导、系统审批内容从冻结 Action 派生：Schema 与授权单测 |
| [HD-02](v2/contract.md) 状态、首个合法答复与迟到答复 | 无模型（Decisions 的答复动作只有 pending → answered 一步） | 后果交付状态五值、comment 不占首次决定、内容版本与 revision 匹配、迟到答复不产生结算到达：提供者单测 |
| [HD-03](v2/contract.md) 阻塞请求的创建与等待 | Decisions.cfg（`CompletionKeepsPending`、`IndependentProgress` 覆盖“独立请求不合成屏障”）；[ToolCall 模型](../tools/verification.md)的 `human` 调用覆盖“请求附属于调用、一次等待一条登记” | 登记簿的成员规则与注销时点归 [run v2](../run/v2/contract.md)（其单测覆盖“登记与 holder 事实同批”）；`deferred_receipt` 占位的呈现归 [run-driver v3](../run-driver/v3/contract.md) 与投影单测；请求数量无上限、热宽限只回收资源：场景 |
| [HD-04](v2/contract.md) 控制级联与答复路由 | [ToolCall 模型](../tools/verification.md)：`InterruptKeepsHuman`（interrupt 保留请求）、`FailKeepsHuman`（不可恢复失败保留请求）、`SupersedeReleasesPositions` / `SupersedeKeepsWork`（interrupt_then_run 整簿注销而请求保留）、`Route`（按登记与发起 Run 状态裁决接续／context／queue／closed） | 单次 `stopCall` 撤回问题、`resume` 后阻塞的显式解除、跨崩溃的重建：场景与提供者单测；模型不区分受理未裁决的窗口 |
| [HD-05](v2/contract.md) 作答认证与程序化作答者 | Decisions.cfg（`OnlyOwnerAnswers` 只覆盖“非 owner 不能答”这一面） | 程序化作答者全部未建模：actor 与 on-behalf-of 的区分、提交时重验成员关系与资产选用、`confirm` 模式下 approve 无效、审计可辨。证据义务在 [external-hooks v1](../external-hooks/v1/contract.md) 的装配与否定测试（HS-02、HS-07） |
| [HD-06](v2/contract.md) 一次性决定的消费 | [run-driver 模型](../run-driver/verification.md)（批准消费与执行许可同提交）；[ToolCall 模型](../tools/verification.md)的 `ConsumedOnce` | `approved_but_not_admitted`、Action 范围变化后的 superseded 与重新判定：授权单测 |
| [HD-07](v2/contract.md) reject 的结算与模式变化 | [ToolCall 模型](../tools/verification.md)（`GateDeny` 分支与 `denied_before_execution` 结算，等待登记随结算注销） | standard → unattended 的关闭／取代、已有 grant 不自动答复：授权与设置单测 |
| [HD-08](v2/contract.md) 决定与接续意图 | Decisions.cfg（`ContinuationHasAnswer`、`CompletionKeepsPending`）；[ToolCall 模型](../tools/verification.md)（`human` 调用的结算即接续，`AnswerOnce`） | 跨协调域的 CC-05 去重、`pending_delivery` 的重投、agent_approval 的答复不被任何门消费（结构性质，用授权单测与场景 TS-14） |
| [HD-09](v2/contract.md) 决策池与 `requests` 贡献 | 无模型 | 池的聚合与可答性四值、分页游标、跨租户存在性不泄漏、`requests` 贡献在同一 `asOf` 水位裁剪：读面与授权单测，快照一致性见 [message-stream 验证范围](../message-stream/verification.md) |
| [HD-10](v2/contract.md) 暂行资格 | 无模型（Provisional 假定资格已成立） | `ProvisionalContract` 的注册与验证、资格失效后禁止新暂行执行：注册单测 |
| [HD-11](v2/contract.md) staging 与依赖图 | Provisional.cfg（父子两节点的依赖关系） | 遏制能力、无主产物的排除、任意 DAG、不可逆效果在 finalize 前被实际提供者阻止：提供者验收 |
| [HD-12](v2/contract.md) finalize、reject 与回传 | Provisional.cfg（`DependencyFinalized`、`RejectedNotFinal`）与否定变体 `parent` | `revoke_failed` 的隔离与重试、并发屏障排序、四种回传策略、暂行调用沿入站裁决原行：提供者验收与场景 |
| [HD-13](v2/contract.md) 内建 `human` 工具的执行 | [ToolCall 模型](../tools/verification.md)：`HumanByAnswer`（`human` 调用恰由答复结算成功）、`AnswerOnce`、进展性质 `HumanRequestsResolve`（以“用户最终答复”为环境假设） | 三个执行动作各自的提交边界、两条命令的参数与答复形状、零费用来源、答复的两种去向恰居其一（[T-14](../../../docs/proposals/tool-execution/invariants.md#调用)）：投影单测与场景 TS-12 / TS-14 |

## 实现符合性

正向配置要求 TLC 完整探索退出 0；否定配置要求对应不变量反例（退出 12）或活性反例
（退出 13）；语法错误、未赋值状态与超时不算有效反例。两个模型都不建模租户、预算、
通知投递、读面裁剪与时间，因此“系统不为等待设置超时”“请求不设数量上限”这类承诺没有
模型证据，只能由场景与提供者验收承担。v2 新增的程序化作答者（HD-05）与 `requests` 快照
贡献（HD-09）目前完全没有形式证据，是本版接受时明确保留的验证缺口。
[提供者设计](../../../packages/governance/human-decisions/design.md)仍是 v1 基线，按 v2 重写
之前，实现符合性无从验收。
