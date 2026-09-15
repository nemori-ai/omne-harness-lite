# model-execution 的验证范围

当前正式契约是 [model-execution v2](v2/contract.md)。它的条款由三处证据分担：本页登记的
[ModelSelection.tla](v2/ModelSelection.tla)（会话模型切换的模态门与压缩门）、
[run-driver 验证范围](../run-driver/verification.md)登记的驱动器模型（attempt 的准入、发网前
耐久与崩溃窗口）、以及 [message-stream 验证范围](../message-stream/verification.md)登记的游标
模型（终止帧与耐久回执的先后、草稿最终收尾）。模型检查是有限状态证据，不是无界系统或
真实实现的证明；本能力的大部分条款没有模型，由 Schema、单测与场景承担。

## v2 的形式工件与登记

[v2 目录](v2/)内的两个文件是 [v1](v1/) 的逐字节副本，SHA-256 相同，本次发版**没有重跑
TLC**：v2 对 MC-08/09/10 未改一字，改动与新增（MC-04 的账本、MC-06 的结算记录字段、
MC-07 的模型族投影、MC-12～14 的瞬态帧、读面与公开投影）都落在这个模型不建模的维度，
它的状态空间与性质不受影响，v1 的运行结果直接适用。

| 文件 | SHA-256 | 内容 |
|---|---|---|
| [ModelSelection.tla](v2/ModelSelection.tla) | `9145647826db498e927a3c5c795e910ff8fd2125198ed2b2f961c47178e6f902` | 会话模态（text / image）、目标能力（支持 / 不支持 / unknown）、窗口三态、一次压缩与切换生效 |
| [ModelSelection.cfg](v2/ModelSelection.cfg) | `ef27652ac458d94f349598ce0f6a38bec6251579f2f9d4dcf27d00b2f0722b8f` | 正向配置：两条不变量 |

形式任务 `model-execution-v1-ModelSelection`（[formal-tasks.json](../../formal-tasks.json)）当前
登记 v1 路径；两份工件逐字节相同，执行任一份结果一致，任务路径是否改指 v2 由本批次的
发版者统一处理。两个否定变体不是登记任务，它们与重放脚本、运行日志留在
[核心能力提案的证据目录](../../../docs/proposals/core-capabilities/evidence/model/results.json)，
可由 `replay.py` 在提供 JAVA_BIN 与 TLA2TOOLS_JAR 后重放。

## ModelSelection 模型

一次会话模型切换：当前会话模态、目标模型的模态支持、上下文窗口立场，以及超限时的一次
具名压缩。模型没有 attempt、供应方路由、费用、实际请求、时间与并发。

| 配置 | 规范映射 | 有限范围与结果（2026-09-13 运行记录） |
|---|---|---|
| ModelSelection.cfg（正向） | `HistoryCompatible`（[MC-09](v2/contract.md)：切换生效时目标必须对当前耐久模态集合兼容，unknown 与已知不支持都不放行，压缩不删模态）；`AtMostOneCompaction`（[MC-10](v2/contract.md)：一次切换只发起一次具名压缩，不借 switch 无限重试） | 2 种模态 × 3 种目标能力 × 3 种窗口立场 = 18 个初始状态；37 生成状态 / 33 不同状态，深度 4，1 秒内完整探索，退出 0 |
| 否定变体 `modality`（不登记） | 允许绕过模态门安装新选择：期望违反 `HistoryCompatible` | 找到反例，退出 12 |
| 否定变体 `repeatCompaction`（不登记） | 允许同一次切换重复压缩：期望违反 `AtMostOneCompaction` | 找到反例，退出 12 |

## v2 条款覆盖

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [MC-01](v2/contract.md) 档案与能力事实 | 无模型 | 来源三分（官方目录／实测／自报）、撤回不复用 ID、价格事实版本：目录与档案单测 |
| [MC-02](v2/contract.md) 候选与资格 | 无模型 | `can_select / blocked / unknown` 的理由披露、来源断连具名返回：读面单测 |
| [MC-03](v2/contract.md) manifest 与共同门 | [run-driver 模型](../run-driver/verification.md)（attempt 准入与 epoch 校验） | manifest 的字段完整性、准备不发网、actualModel 取供应方响应：提供者单测 |
| [MC-04](v2/contract.md) 请求状态、interrupt 与强停的共用账本 | [run-driver 模型](../run-driver/verification.md)：提案 I-18 / I-24（发网前耐久、恢复不重发）与否定变体 `sendEarly`（允许未耐久 attempt 发网即出反例）；崩溃窗口表由 [RD-16](../run-driver/v3/contract.md) 承担 | interrupt 与强停在同一账本上与 start 的排序、墓碑对迟到启动的拒绝在模型里没有独立动作（该性质与 [TL-08](../tools/v2/contract.md) 同型，其 owner 侧排序是提供者验收项）；已流出前缀的保留按 MC-06 用单测验收 |
| [MC-05](v2/contract.md) 路由与出口约束 | 无模型 | provider 集合、禁止 fallback／转写／模拟、redirect 不转移凭据、原生 PDF 路径：adapter 单测与否定测试 |
| [MC-06](v2/contract.md) attempt 计费与结算记录 | 无模型（`purpose`、缺失清单、送达模态、紧凑记录都是记录字段） | 全部由提供者单测与 Schema 承担：四值 `purpose` 的分流、[CD v2](../../data/core-work/v2/contract.md) 形状的缺失清单与截断前缀、实际送达模态、紧凑记录可展开重建、unknown／partial 的费用暴露、内容过滤保留原始终止原因 |
| [MC-07](v2/contract.md) 上下文装配与模型族投影 | 无模型 | 贡献排序与命名冲突、必需 skill 与命令集合一致、压缩不混入未取批输入、`system_reminder` 按族投影为 user／developer message、投影选择器只选不改：投影单测（同一记录三种投影）与装配单测 |
| [MC-08](v2/contract.md) switchModel 与 pending_next_run | 无模型（ModelSelection 从“已决定切换”开始） | operationId、pending 不是已生效、切换与 Run 准入共享屏障：提供者单测 |
| [MC-09](v2/contract.md) 模态门 | ModelSelection.cfg（`HistoryCompatible`）与否定变体 `modality` | 完整模态编码、派生 Session 的切点、模态历史不可信时的阻塞：单测 |
| [MC-10](v2/contract.md) 窗口与一次压缩 | ModelSelection.cfg（`AtMostOneCompaction`）与否定变体 `repeatCompaction` | 压缩所用模型的记录、`compression_unavailable`、窗口未知不当成超限、提交前重核与 conflict：单测 |
| [MC-11](v2/contract.md) 下一 Run 的生效选择 | 无模型 | 旧后台工具保持原绑定、候选列表／设置成功／执行成功分别报告：与 [TL-11](../tools/v2/contract.md) 的绑定测试合并验收 |
| [MC-12](v2/contract.md) 瞬态帧与发布计数 | [游标模型](../message-stream/verification.md)：`EndedAfterCommit`（`ended{committed}` 只在耐久回执之后）、`DraftCurrent`、进展性质 `AttemptsSettle`（每个尝试最终收尾） | 模型没有真实 attempt 身份，也没有“提交后、终止帧前”的独立窗口；`purpose` 在 `started` 即确定、`pub{gen, n}` 的分配与换代、执行代次的取值来源都未建模，由提供者单测承担 |
| [MC-13](v2/contract.md) 活跃 attempt 读面 | 无模型（游标模型的 `Subscribe` 只重置草稿，不建模基线内容） | 读面快照与发布同一互斥、`version` 与 `items` 一致、中途装载取得完整基线、重启后为空、读权裁剪：提供者与消费者的同步切单测（[MS-23](../message-stream/v1/contract.md) 的证据表同此结论） |
| [MC-14](v2/contract.md) 私有序列与公开投影 | 无模型 | `toPublic` 的定义与性质归 [message-stream 验证范围](../message-stream/verification.md)（MS-21）；“三处出口共用同一转换”是本能力的提供者义务，用一组单测验收：三处入口调用同一函数、过滤后公开序号连续、tool-call 块终止帧不带参数、加密推理与回放状态不出现在任何公开出口 |

## 实现符合性

正向配置要求 TLC 完整探索退出 0；否定配置要求对应不变量反例（退出 12）；语法错误、未赋值
状态与超时不算有效反例。ModelSelection 只覆盖两条不变量，不覆盖真实 OpenRouter 请求、
模态编码、费用与并发切换。本版接受时明确保留的验证缺口：MC-06 的结算记录字段、MC-07 的
模型族投影、MC-12～14 的发布者义务都没有形式证据，且 MC 提供者设计尚未写
（[消息流提案的能力侧](../../../docs/proposals/message-stream/cordis.md#能力侧)把它列为接受后的
必需产物），在它完成之前实现符合性无从验收。
