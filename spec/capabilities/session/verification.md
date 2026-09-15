# session 的验证范围

当前版本 [session v2](v2/contract.md) 与 [v1](v1/contract.md) 都没有自己版本目录下的形式
模型；条款由五处证据分担：

- 本页登记的 Inbound 证据模型
  [Inbound.tla](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/Inbound.tla)
  （受理、去重、容量、意图路由、消费、转换与扫描）。它放在提案证据目录，按 agent-runtime
  源基线的先例登记为形式任务 `session-v1-inbound-safety` 与 `session-v1-inbound-progress`
  （[formal-tasks.json](../../formal-tasks.json)），每次 spec-check 运行；任务名是模型文件这
  一证据对象的身份，不随契约版本改名，v2 继续引用同一目录的同一模型。重放与哈希由
  [replay.py](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/replay.py)
  写入 [results.json](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/results.json)。
- [tools v2 的调用模型](../tools/verification.md)：等待登记簿的按调用投影与入站路由的 A 列。
- [生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md)：生命周期、
  级联、占位。
- [run-driver 模型](../run-driver/verification.md)：Run 侧等待、消费与结算。
- session-run v1 的 [QueueControl.tla](../session-run/v1/QueueControl.tla)（队列顺序、命令与
  强停，仍是形式任务 `session-run-v1-QueueControl`）。

本页不重跑 TLC：下表的运行数字抄自上述 `results.json` 与存档日志，绑定它们记录的源提交。

## Inbound 模型

三类来源折叠：`call`（内部事实来源：call_settlement / human_answer / provisional_outcome /
gate_restored，refs 可指向 Run 等待位置，不受容量拒绝，归档后仍受理再关闭）、`ctx`
（connector_passive，意图 context）、`usr`（用户与日程等外部队列来源，意图 queue）。
Run 抽象为 none / running / waiting / interrupted / terminal / cancelled，只建模一个等待
位置；Session 为 open / archived / deleted。

| 配置 | 规范映射 | 有限范围与结果（2026-09-14，8 核 4 worker） |
|---|---|---|
| Inbound.cfg（安全） | TypeOK；Dedup（[SE-12](v2/contract.md) 同 `(source, dedupKey)` 至多一条）；Capacity（[SE-16](v2/contract.md) 外部来源未消费数有界）；NoStaleContinuation（[SE-17](v2/contract.md)：终态 Run 不留未消费 continuation）；ArchiveClean（[SE-02](v2/contract.md)、[LC-04 行 1](../../compositions/session-run-agent-lifecycles/v2/contract.md)：非 open 的 Session 无 classified 未消费项）；动作性质 ClassifyRule（[SE-14](v2/contract.md) A 列的单登记投影，见下节）、IntentOnce（每 arrival 恰一次裁决）、ScanBeforeDrive（[SE-18](v2/contract.md)：有 accepted 未裁决项时不开 Run、不 resume） | 3 arrival、2 dedup 键、Cap=1、队列 ≤ 3，对称约减；4.7 万不同状态、3 秒，通过 |
| InboundProgress.cfg（进展） | EveryArrivalAdjudicated（accepted 最终离开 accepted）；ContinuationsResolve（classified continuation 最终被消费/转换/关闭/撤回，或 Run 停在 interrupted）；QueueStarts（open 且无 Run 的非空队列最终开 Run，除非被撤空或 Session 离开 open） | 2 arrival、2 键；弱公平加在裁决、消费、开 Step、开 Run、进入等待；1.9 万不同状态、4 秒，通过 |

模型发现：QueueStarts 的首稿未把"用户撤回使队列清空"算作合法收敛，TLC 给出
accept → classify(queue) → withdraw → 停滞的反例；性质随即修正为允许队列清空，
契约不需改动（[SE-05](v2/contract.md) 的 withdraw 本就只关闭这次投递）。

## A 列与等待登记簿的对应

[SE-14](v2/contract.md) 的 A 列在 v2 改为查 [run v2](../run/v2/contract.md) 的等待登记簿：
holder 在其发起 Run 上有开放登记即 continuation。已有证据与它的关系是投影关系，不是
逐字对应：

| 模型 | 模型里的表达 | 与 v2 条款的关系 |
|---|---|---|
| Inbound.tla | `Decide(a)` 的 A 分支 `refs[a] ≠ none ∧ run ∈ {waiting, interrupted}` | 模型只建一个等待位置：`refs[a] ≠ none` 表示该 arrival 引用它，`run ∈ {waiting, interrupted}` 表示它仍开放。在"登记簿至多一条开放登记、holder 即被引用位置"的投影下，该判据与 SE-14 的 A 列同值；`ClassifyRule` 因此仍是 A 列的检查 |
| [tools v2 的 ToolCall 模型](../tools/verification.md) | 每个调用的 `rel` 字段、`Claimed(c)`、`Route` 的 A 列、`RunInterruptThenRun` | `rel` 是同一登记簿的按调用投影：`Claimed(c)` = 该调用有开放登记，`Route` 的 A 列 = "holder 有开放登记且发起 Run 活动"，`RunInterruptThenRun` 把全部关系置为 background = 整簿注销（[SE-17](v2/contract.md)）。多调用并发登记与逐 holder 注销由它覆盖，Inbound 模型不覆盖 |

两个模型都不区分"结算已受理、尚未裁决"的窗口（[SE-18](v2/contract.md) 的两次提交在
Inbound 模型里建模、在 ToolCall 模型里相邻），门不在 ToolCall 模型内。

v2 新增或改写的语义中，现有模型**不覆盖**的部分：

| 未覆盖 | 说明 |
|---|---|
| `system` 来源与 SE-14 的 `system` 行 | Inbound 模型的来源折叠为三类，没有内部 context 来源；"无活动 Run 时只等待、不触发 Run"与 [SE-08](v2/contract.md) 清单在终态提交同批受理都未建模。由 run-driver v3 场景与提供者验收承担 |
| 取入既有 Run（[SE-06](v2/contract.md)、[SE-15](v2/contract.md)） | Inbound 模型的开 Run 动作只在 Run 为 none / terminal / cancelled 时成立，没有"waiting 的 Run 取入队首文本并开 Step"这一步。tools v2 的 ToolCall 模型以 `RunSteer` 覆盖"等待中被唤醒、前台调用仍开放"的交错，但不含队列、合批规则与优先级；队列侧由 run-driver v3 场景与驱动器单测验收 |
| D1 的 `stopping` | 模型的 Run 只有 `cancelled`，没有 `stopping`；`closed(isolated)` 与 `closed(cancelled_run)` 在模型中同为 closed，force_stop 受理即整簿注销（[RN-05](../run/v2/contract.md)）未建模 |
| 终态 `superseded` 与 continuation 改判 context | 模型的终态转换把未消费 continuation 一律转 queue 或关闭，没有 superseded 分支（[SE-17](v2/contract.md)） |
| `hook_continuation` 与续跑刹车 | 来源、去重键、计数上限与 `closed(source_invalid)` 都不在模型内，归 [external-hooks v1](../external-hooks/v1/contract.md) 的场景与单测 |
| 派生 `Message` 表与读面（[SE-03](v2/contract.md)、[SE-10](v2/contract.md)、[SE-19](v2/contract.md)、[SE-20](v2/contract.md)） | 无模型：派生的纯函数性与重建稳定性、`asOf` 单一水位、`frames(S)` 的位置语义、可见范围版本由提供者验收；客户端一侧的水位、补齐与游标失效由 [message-stream v1 的游标模型](../message-stream/verification.md)覆盖 |

## 消息流游标模型

原在本页登记的 `Cursor.tla` 两个配置随 [message-stream v1](../message-stream/README.md) 的
接受移交其验证页与版本目录（形式任务 `message-stream-cursor-safety` /
`message-stream-cursor-progress` 改指该目录）。它对本能力的支持范围是客户端一侧：
[SE-03](v2/contract.md) 的历史水位读面与 [SE-16](v2/contract.md) 的水位语义在有限模型里的
投递与补齐行为、[SE-10](v2/contract.md) 的完整覆盖水位不被越过、[SE-20](v2/contract.md) 的
可见范围版本变化导致全量重取。服务端的裁剪规则、贡献注册与派生正文安装不在该模型内。

## 条款覆盖

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [SE-01](v2/contract.md) 身份、不可变字段、列表过滤 | 无模型；提供者验收（[设计 §2.2](../../../packages/session/session/design.md#22-权威对象)） | 全部为数据形状与读面 |
| [SE-02](v2/contract.md) 生命周期 | Lifecycles.cfg（S2：非终态 Run 下不可归档）；Inbound.cfg（ArchiveClean、Archive/Restore/Delete 动作） | 删除后的墓碑与审计披露；`superseded` 不阻止归档（随 LC v2 的模型处置，见[生命周期组合验证](../../compositions/session-run-agent-lifecycles/verification.md)） |
| [SE-03](v2/contract.md) 历史与派生 `Message` 表 | 无模型；提供者验收（projection fold 的纯函数与重建稳定性单测） | 派生表全部、`asOf` 读面、`supersededBy` 显示规则 |
| [SE-04](v2/contract.md) 队列项与 closed 原因 | QueueControl（TakenInputStable：取批后内容不再变）；Inbound.cfg（Withdraw 同步减队列） | closed 原因词表逐项（含 `closed_by_guard` / `source_invalid`）、附件占用 |
| [SE-05](v2/contract.md) edit / reorder / withdraw 修订 | QueueControl（Edit 只对 queued 项） | reorder 的完整成员校验 |
| [SE-06](v2/contract.md) takeBatch / takeTrigger / 守卫边界 | QueueControl（SingleClaim、ExactSlot）；RunDriverSched.cfg（取项建 Run）；tools v2 的 `RunSteer`（等待中被唤醒的交错） | 取入既有 Run 的门与合批规则、`hook_continuation` 的来源重查、守卫关闭的同批提交 |
| [SE-07](v2/contract.md) 有序命令 | QueueControl（CommandHasExecutionRight） | 让行位置与清除集合 |
| [SE-08](v2/contract.md) interrupt_then_run | Lifecycles.cfg（LC-04 行 8 的同提交）；tools v2 的 ToolCall 模型（越过时整簿注销、unknown 计入收口） | 停止未知时的 pending 显示、被保留工作清单的受理与恰一次消费 |
| [SE-09](v2/contract.md) 会话级强停 hold | QueueControl（HoldRespected、SafeRelease）；Lifecycles.cfg（L1：旧 epoch 迟到提交被拒） | continueQueue 的目标列表语义 |
| [SE-10](v2/contract.md) 状态贡献注册与投影读面 | 无模型；提供者验收（[persistence](../../../packages/session/persistence/design.md)、[projection](../../../packages/session/projection/design.md)） | 全部；`changes / snapshot / floor` 的水位一致性与贡献裁剪由提供者与 message-stream v1 的组合验收 |
| [SE-11](v2/contract.md) 恢复顺序 | Lifecycles.cfg（Crash 动作后 L1/I1）；Inbound.cfg（ScanBeforeDrive） | 前缀校验、版本校验、投影重建（崩溃注入验收） |
| [SE-12](v2/contract.md) arrival 账本与去重 | Inbound.cfg（Dedup、IntentOnce）；RunDriver.cfg（消费恰一次） | payloadRef 与 refs 的形状、holder 定位 |
| [SE-13](v2/contract.md) 意图与来源 | Inbound.cfg（三类来源折叠）；RunDriver.cfg（已结算前台调用不再是等待位置） | 十二种来源逐一区分（模型折叠为三类）；`system`、`hook_continuation` 与 control 意图不建模 |
| [SE-14](v2/contract.md) 判定顺序与决定表 | Inbound.cfg（Decide 的 A/B/C/D1/D2 列、ClassifyRule）；tools v2 的 `Route`（A 列按登记簿）；RunDriverSched.cfg（终态晚到） | `system` 与 `hook_continuation` 两行；D1 的 `stopping`；schedule_due 按 originWork 判 refused_origin_cancelled |
| [SE-15](v2/contract.md) 调度与激活 | LifecyclesProgress.cfg（LP1a/LP1b）；RunDriverSchedProgress.cfg；Inbound.cfg（StartRun 要求 Pending 空） | 先找 ready 实例再激活；空闲点取入与调度的互斥（提供者与驱动器验收） |
| [SE-16](v2/contract.md) context 水位与容量 | Inbound.cfg（Capacity、水位单调；OpenStep 消费全部 context） | lowerBound 推进与保留期；`system` 的清单丢失可接受 |
| [SE-17](v2/contract.md) 结算时接续处理 | Inbound.cfg（NoStaleContinuation、Settle 同步转换/关闭）；Lifecycles.cfg；RunDriver 否定变体 splitSettle | `superseded` 分支（整簿注销与 continuation 改判 context） |
| [SE-18](v2/contract.md) 两次提交与启动扫描 | Inbound.cfg（Accept 与 Classify 分离；ScanBeforeDrive）；InboundProgress.cfg（EveryArrivalAdjudicated） | 扫描分页与幂等（提供者验收） |
| [SE-19](v2/contract.md) `frames(S)` 流 | 无模型；提供者验收与 [tools v2 的帧条款](../tools/verification.md) | 全部：位置语义、保留期、与消息的提交顺序对齐 |
| [SE-20](v2/contract.md) 读权两级与可见范围版本 | message-stream v1 的游标模型（版本变化 → 全量重取的客户端一侧） | 权限键的核对点、版本聚合的来源（租户成员、Session 授予、HD 可见范围） |

刻意未覆盖：租户与权限（[设计 §11](../../../packages/session/session/design.md#11-当前调用者对象权限与运行委托)
按 TG 契约验收）、多 Session、control 意图的映射、来源的逐一区分、出站流传输
（[U-36](../../../docs/proposals/session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)）、
真实提供者的装卸与清理失败。检查是有限状态证据，不是无界系统或真实实现的证明；
实现符合性按各能力的场景另行验收。
