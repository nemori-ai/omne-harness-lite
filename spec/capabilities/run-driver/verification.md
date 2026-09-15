# run-driver 与 session / run / Inbound 的验证范围

当前正式契约是 [run-driver v3](v3/contract.md)。形式工件位于 [run-driver/v3](v3/)：
`RunDriver.tla` 建模驱动器与 Inbound 裁决的交互，`RunDriverMC.tla` 提供对称集，六个配置
登记在 [formal-tasks.json](../../formal-tasks.json)。[v2](v2/) 与 [v1](v1/) 的模型、配置与场景
保持冻结，运行记录见下节。

## v3 的模型与覆盖

v3 的模型按等待登记簿重写：问答型人类请求并入调用（`HIds` 是内建 `human` 工具的调用，
答复经 `call_settlement`，v2 的 `QIds` / `AskQuestion` / `Answer` 与 `waiting_human` 状态删除）；
调用的开放登记 `calls[c].open` 与门的 `gateRef` 构成登记簿，`Claims` 非空即"Run 在等"，
`waiting_gate` 不再是 Run 状态；Step 收束只看 attempt 已结算与提议已登记，开下一 Step 由
合批规则与占位规则控制；`InvalidProposal` 建模整份提议被拒的 Step 收口；`SteerOpen` 建模
空闲点取入排队文本。

| 配置 | 规范映射 | 有限范围与刻意未覆盖项 | 本次运行 |
|---|---|---|---|
| RunDriver.cfg（核心） | RD-04/06/08/09/10/11/12/13/16/18；SE-12/13/14/18、RN-01/02；I1、I9、I13、I14、I18、I21s、I22、I23、I24、I25、I26、NoDouble、Hist | 单 Run、2 arrival、1 调用、2 Step、1 attempt、1 次空闲点取入、允许 invalid_proposal；崩溃、Yield、门丢失、用户控制各至多一次；E7 收口原子 | 完整探索退出 0，5,754,253 states generated / 1,902,109 distinct，71 s |
| RunDriverSched.cfg（调度） | RD-04/13/14/15；SE-06/15/17、RN-09；I1、Hist、I14、I13、I22 | 2 Run、1 Step、2 arrival、1 调用、无 human 调用、不取入文本；覆盖 Yield 重取、trigger 取项、终态时接续转换/关闭与整簿注销 | 完整探索退出 0，10,118,241 states generated / 3,349,516 distinct，160 s（与另一配置并行 4 workers） |
| RunDriverOps.cfg（提交去重） | RD-03；I20、I18 | 单 Run、2 Step、2 attempt、1 arrival、1 调用，记录提交集合；同一 operationId 不出现异输入 | 完整探索退出 0，6,519,508 states generated / 2,015,450 distinct，155 s（与另一配置并行 4 workers） |
| RunDriverProgress.cfg | P1（调用结算与批准最终被消费）、P1g（门恢复最终返回或 Run 离开可推进状态）、P1y（Yield 后最终重取）、P1w（登记簿空了不停在 waiting） | 单 Run、2 Step、2 arrival、1 普通调用、无 human 调用、不取入文本；弱公平加在裁决、开 Step、门进入/唤醒、批准消费、恢复、重取与完成结算上；Step 数达上限时 P1 与 P1w 的前提排除 | 完整探索退出 0，4,346,962 states generated / 1,521,699 distinct，324 s |
| RunDriverProgressHuman.cfg | 内建 `human` 调用一侧：P1（答复经 call_settlement 最终被消费）、P1g、P1y、P1w；同时检查核心配置的全部安全不变式 | 单 Run、2 Step、2 arrival、1 个 `human` 调用（`HIds = CIds`，因此没有审批门分支） | 完整探索退出 0，2,383,610 states generated / 815,849 distinct，319 s（与另一配置并行 4 workers） |
| RunDriverSchedProgress.cfg | P1y、P2（无占位且有队列项最终开 Run） | 2 Run、1 Step、2 arrival、无调用；Run 数达上限时 P2 前提排除 | 完整探索退出 0，2,526,890 states generated / 888,835 distinct，69 s |

不变式与条款的对应：I1（占位与 Run 状态一致，LC-02）、Hist（被越过的 Run 只能是终态或
interrupted）、I9（进入切点的结算其登记已注销，RD-09/10）、I13（continuation 只指向活动且
有开放登记的 Run，SE-14 A 列）、I14（终态与接续处理同提交，SE-17）、I18（发网前耐久与
幂等接纳，MC-04/TL-08）、I20（operationId 去重，RD-03）、I21s（已消费的 arrival 有意图）、
I22（完成时登记簿为空；任何开放登记的 holder 其 Run 非终态，即终态整簿注销，RD-13）、
I23（开放登记的已结算调用只能被裁决为 continuation）、I24（门的登记与 gateRet 成对，
RD-12）、I25（`waiting` 只在 Step 收束之后，RD-10）、I26（invalid_proposal 的 Step 没有登记
调用，RD-08）、NoDouble（一个调用的结算至多进入一个切点，RD-09）。

拆成多个小配置是有意为之：单个全家桶配置在 8 核上 30 分钟未收敛，而所有反例都在百万
状态内出现；登记的任务须在其 `timeout_seconds` 内完整探索。

### v3 刻意未建模的条款

| 条款 | 未建模的部分 | 由谁承担 |
|---|---|---|
| RD-05 | 命令 Run 与命令处理者 | session v2 的队列与命令条款、场景 S19 |
| RD-06 | context 水位与指针、`system_reminder` 的三种 reminderKind 的正文投影、守卫求值 | CD v2 的块形状、session v2 的 SE-16、场景 S20/S22/S23/S25 |
| RD-07 | 辅助 Step 与压缩 | MC v2 的 MC-10、model-execution 验证页 |
| RD-08 | `invalid_proposal` 只建模 Step 收口与"不登记调用"，`reasons` 的内容与被拒块的派生未建模 | message-stream v1 的派生表、场景 S24 |
| RD-09 | 视图值只建模 proposed / waiting_approval / admitted / executing / settled 与前后台关系；`detach_in_flight`（本模型 detach 为原子）、`settling` 与 `staged_provisional` 未单独建模；占位块的形状与 `reason` 取值未建模 | tools v2 的 `ToolCall.tla` 按调用投影覆盖五维与 detach 两阶段；CD v2 的词表；场景 S03/S04 |
| RD-10 | 合批规则建模为"缺省等本批前台登记注销、门恢复可提前开"；"审批就绪提前开"被 E4A 的优先级吸收，未单独建模；占位的"首次呈现即开 Step"以动作前提（`NeedPh`）表达，不另设不变式 | 驱动器单测、场景 S21/S22 |
| RD-13 | interrupt_then_run 与 `superseded` 终态、force_stop 的隔离升级、unknown 的物理事实 | 生命周期组合 v2 的 `Lifecycles.tla`、run v2 的验证页、场景 S18 |
| RD-14 | `detach_in_flight` 阻止 Yield 的一段（detach 为原子） | tools v2 的 `ToolCall.tla`、场景 S09/S10 |
| RD-17 | 守卫本身（关闭项、fail-open、幂等） | external-hooks v1 的场景与 API 结构检查、场景 S25 |
| RD-18 | 队列内容、队首资格与"接续先于文本"的次序；模型只建模"在空闲点提前开一个 Step 并给在途调用占位" | 驱动器单测、场景 S21 |
| RD-19 | 无模型：站点枚举是登记面的结构约束 | external-hooks v1 的 API 结构检查与每站点一个越权字段被记为不支持的测试；场景 S25 |

所有配置都不建模租户、帧、预算数值、暂行回传、多 Session 与 Session 归档（D2 列）。
session v2 的队列顺序、命令与强停由 session 自己的验证覆盖；三台状态机的关系与级联由
[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md) 覆盖。

## v2 与 v1 的历史记录

v2 目录内的模型、配置与场景是 v1 的逐字节副本（D-014 只改契约引用），v1 的运行记录
保留在 [agent-loop-inbound 证据目录](../../../docs/proposals/agent-loop-inbound/evidence/model/results.json)，
四个否定变体配置与重放脚本也在那里，可由 `replay.py` 在提供 JAVA_BIN 与 TLA2TOOLS_JAR
后重放：

| 否定变体（v1 证据目录） | 目标 | 变异与预期 |
|---|---|---|
| sendEarly | I-18 的成立条件（MC-04 发网前耐久） | 允许未耐久 attempt 发网；预期 I18 反例 |
| yieldRelease | X1：Yield 释放占位的反例 | Yield 释放占位；预期 Hist 反例（被越过的 Run 仍 running） |
| splitSettle | I-14：结算与接续转换必须同提交 | 结算不处理接续；预期 I14 反例 |
| settledNotWaiting | X3/I-23：已结算前台调用仍是等待位置 | 裁决者不把已结算前台调用视为等待位置；预期 I23 反例 |

v3 的 `Mutation` 常量保留同样的四个变异点，其中 `settledNotWaiting` 的含义改为"登记在调用
结算时即注销，不等裁决"。四个变体在 v3 模型上各跑过一次并得到预期反例（TLC 退出码 12）：
`settledNotWaiting` → I23（3 s）、`yieldRelease` → Hist（1 s）、`splitSettle` → I14（3 s）、
`sendEarly` → I18（1 s）。变体配置与日志是版本目录之外的运行证据，位置由发版者按证据
归属安排：本批次产生于 spoke 工作树的 `tmp/tlc/`，工作树退役时连同日志复制到主检出的
`tmp/dsh-first-batch-retired/dsh-d015-batch/tlc/`（本地保留，不入库）；需要长期证据时用
`Mutation` 常量按上表重跑即可复现，不依赖这些日志。

正向配置要求 TLC 完整探索退出 0；否定配置要求对应不变量反例（退出 12）。检查是
有限状态证据，不是无界系统或真实实现的证明。

实现符合性仍待后续验收：崩溃窗口表（RD-16）须逐窗口注入崩溃核对；模型流式前缀
不可恢复、同进程前台工具 unknown 两项作为已接受局限写入验证边界；`gate_restored`
的生产者义务由预算与依赖可用性提供者的验收覆盖；RD-17 的守卫与 RD-19 的站点登记由
external-hooks 的提供者验收覆盖。
