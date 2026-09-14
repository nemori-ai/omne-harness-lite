# run-driver 与 session / run / Inbound 的验证范围

形式工件位于 [run-driver/v2](v2/)：`RunDriver.tla` 建模驱动器与 Inbound 裁决的
交互，`RunDriverMC.tla` 提供对称集，六个配置登记在 [formal-tasks.json](../../formal-tasks.json)。
v2 目录内的模型、配置与场景是 [v1](v1/) 的逐字节副本（D-014 只改契约引用），v1 的
运行记录保留在 [agent-loop-inbound 证据目录](../../../docs/proposals/agent-loop-inbound/evidence/model/results.json)，
四个否定变体配置与重放脚本也在那里，可由 `replay.py` 在提供 JAVA_BIN 与 TLA2TOOLS_JAR
后重放。formal-tasks 只执行 v2 路径；v1 的两个模型文件以逐字节相同的工件挂在
`run-driver-v2-core` 任务下（两份都已冻结，哈希相同），不再单独跑一遍。
session v1 的队列顺序、命令与强停仍由 session-run v1 的 `QueueControl` 覆盖，本模型的
队列为无序集合，不重复证明那些条款；三台状态机的关系与级联由
[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md) 覆盖。

| 配置 | 规范映射 | 有限范围与刻意未覆盖项 |
|---|---|---|
| RunDriver.cfg（核心） | RD-04/06/08/09/10/11/12/13/16；SE-12/13/14/18、RN-01/02；提案 I-1、I-9、I-13、I-18、I-21（安全侧）、I-22、I-23、I-24、NoDouble | 单 Run、2 arrival、1 调用、1 问题、2 Step、1 attempt；崩溃、Yield、门丢失、用户控制各至多一次；E7 收口原子 |
| RunDriverSched.cfg（调度） | RD-04/14/15；SE-06/15/17、RN-09；提案 I-1、Hist（被越过的 Run 只能是终态或 interrupted）、I-14、I-13 | 2 Run、1 Step、2 arrival、1 调用、无问题；覆盖 Yield 重取、trigger 取项、终态时接续转换/关闭 |
| RunDriverOps.cfg（提交去重） | RD-03；提案 I-20、I-18 | 单 Run、2 Step、2 attempt、1 arrival、1 调用，记录提交集合；同一 operationId 不出现异输入 |
| RunDriverProgress.cfg | P-1（调用结算与批准最终被消费或转入门等待）、P-1g（门恢复最终返回）、P-1y（Yield 后最终重取） | 单 Run、2 Step、2 arrival、1 调用、无问题；弱公平加在裁决、开 Step、门进入/唤醒、批准消费、恢复、重取上；Step 数达上限时 P-1 前提排除 |
| RunDriverProgressHuman.cfg | P-1 的 waiting_human 一侧（问答答复最终被消费）、P-1g、P-1y | 单 Run、2 Step、2 arrival、1 问题、无调用；调用与问题同时存在的活性实例超出时限，未探索 |
| RunDriverSchedProgress.cfg | P-1y、P-2（无占位且有队列项最终开 Run） | 2 Run、1 Step、2 arrival、无调用；Run 数达上限时 P-2 前提排除 |

拆成多个小配置是有意为之：单个全家桶配置在 8 核上 30 分钟未收敛（超过 3800 万
状态），而所有反例都在百万状态内出现；登记的任务须在数分钟内完整探索。所有配置
都不建模租户、帧、预算数值、暂行回传、多 Session 与 Session 归档（D2 列）。

| 否定变体（v1 证据目录） | 目标 | 变异与预期 |
|---|---|---|
| sendEarly | I-18 的成立条件（MC-04 发网前耐久） | 允许未耐久 attempt 发网；预期 I18 反例 |
| yieldRelease | X1：Yield 释放占位的反例 | Yield 释放占位；预期 Hist 反例（被越过的 Run 仍 running） |
| splitSettle | I-14：结算与接续转换必须同提交 | 结算不处理接续；预期 I14 反例 |
| settledNotWaiting | X3/I-23：已结算前台调用仍是等待位置 | 裁决者不把已结算前台调用视为等待位置；预期 I23 反例 |

正向配置要求 TLC 完整探索退出 0；否定配置要求对应不变量反例（退出 12）。检查是
有限状态证据，不是无界系统或真实实现的证明。提案 I-5、I-6、I-7、I-8、I-10～12、
I-15～17、I-19、P-3、P-4 由既有契约证据或场景承担，未在本模型中建模。

实现符合性仍待后续验收：崩溃窗口表（RD-16）须逐窗口注入崩溃核对；模型流式前缀
不可恢复、同进程前台工具 unknown 两项作为已接受局限写入验证边界；`gate_restored`
的生产者义务由预算与依赖可用性提供者的验收覆盖。
