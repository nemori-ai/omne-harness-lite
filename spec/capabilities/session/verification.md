# session v1 的验证范围

[session v1](v1/contract.md) 没有自己目录下的形式模型；它的条款由四处证据分担：
session-run v1 的 [QueueControl.tla](../session-run/v1/QueueControl.tla)（队列顺序、命令与
强停，仍是形式任务 `session-run-v1-QueueControl`）、
[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md)
（生命周期、级联、占位）、[run-driver v2 模型](../run-driver/verification.md)（Run 侧等待、
消费与结算）、以及本页登记的 Inbound 证据模型
[Inbound.tla](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/Inbound.tla)
（受理、去重、容量、意图路由、消费、转换与扫描）。Inbound 模型放在提案证据目录，
按 agent-runtime 源基线的先例登记为形式任务 `session-v1-inbound-safety` 与
`session-v1-inbound-progress`（[formal-tasks.json](../../formal-tasks.json)），每次 spec-check
运行；重放与哈希由 [replay.py](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/replay.py)
写入 [results.json](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/results.json)。

## Inbound 模型

三类来源折叠：`call`（内部事实来源：call_settlement / human_answer / provisional_outcome /
gate_restored，refs 可指向 Run 等待位置，不受容量拒绝，归档后仍受理再关闭）、`ctx`
（connector_passive，意图 context）、`usr`（用户与日程等外部队列来源，意图 queue）。
Run 抽象为 none / running / waiting / interrupted / terminal / cancelled，只建模一个等待
位置；Session 为 open / archived / deleted。

| 配置 | 规范映射 | 有限范围与结果（2026-09-14，8 核 4 worker） |
|---|---|---|
| Inbound.cfg（安全） | TypeOK；Dedup（[SE-12](v1/contract.md) 同 `(source, dedupKey)` 至多一条）；Capacity（[SE-16](v1/contract.md) 外部来源未消费数有界）；NoStaleContinuation（[SE-17](v1/contract.md)：终态 Run 不留未消费 continuation）；ArchiveClean（[SE-02](v1/contract.md)、[LC-04 行 1](../../compositions/session-run-agent-lifecycles/v1/contract.md)：非 open 的 Session 无 classified 未消费项）；动作性质 ClassifyRule（[SE-14](v1/contract.md) A 列：continuation 只在 Run waiting/interrupted 时判出）、IntentOnce（每 arrival 恰一次裁决）、ScanBeforeDrive（[SE-18](v1/contract.md)：有 accepted 未裁决项时不开 Run、不 resume） | 3 arrival、2 dedup 键、Cap=1、队列 ≤ 3，对称约减；4.7 万不同状态、3 秒，通过 |
| InboundProgress.cfg（进展） | EveryArrivalAdjudicated（accepted 最终离开 accepted）；ContinuationsResolve（classified continuation 最终被消费/转换/关闭/撤回，或 Run 停在 interrupted）；QueueStarts（open 且无 Run 的非空队列最终开 Run，除非被撤空或 Session 离开 open） | 2 arrival、2 键；弱公平加在裁决、消费、开 Step、开 Run、进入等待；1.9 万不同状态、4 秒，通过 |

模型发现：QueueStarts 的首稿未把"用户撤回使队列清空"算作合法收敛，TLC 给出
accept → classify(queue) → withdraw → 停滞的反例；性质随即修正为允许队列清空，
契约不需改动（[SE-05](v1/contract.md) 的 withdraw 本就只关闭这次投递）。

## 消息流游标模型（提案候选）

[message-stream 提案](../../../docs/proposals/message-stream/README.md)（未接受）的
[Cursor.tla](../../../docs/proposals/message-stream/evidence/model/Cursor.tla) 为 [SE-03](v1/contract.md)
的历史水位读面与 [SE-16](v1/contract.md) 的水位语义在客户端一侧提供有限证据：一个协调域的
提交序号、作用域内 / 外两种事实、可丢的进程内铃（[LC-06](../../compositions/session-run-agent-lifecycles/v1/contract.md)）、
每订阅的有界缓冲与已推送水位、投影下界、一个瞬态 attempt、断线与进程崩溃。按 Inbound 与
工具提案证据模型的先例放在提案证据目录并登记为形式任务 `message-stream-cursor-safety` 与
`message-stream-cursor-progress`（[formal-tasks.json](../../formal-tasks.json)）；抽象与边界见
[证据说明](../../../docs/proposals/message-stream/evidence/README.md)，重放与哈希由
[replay.py](../../../docs/proposals/message-stream/evidence/model/replay.py) 写入
[results.json](../../../docs/proposals/message-stream/evidence/model/results.json)。提案接受前，
这些结果只支持提案的候选性质 MS-1～MS-5、MS-7 与 MP-1～MP-3，不改变 session v1 的条款覆盖表。

| 配置 | 规范映射 | 有限范围与结果（2026-09-15，8 核 4 worker） |
|---|---|---|
| Cursor.cfg（安全） | TypeOK；NoForeignDelivery（MS-5 作用域）；CursorComplete（MS-3：游标之下的作用域内事实全部已投递，不论丢过多少次铃）；SentComplete（服务端水位不虚报）；EndedAfterCommit（MS-7）；BufferOrdered、DeliverOnce（MS-2）；DraftCurrent（MS-4）；Monotone | 1 个订阅、3 条事实、两个缓冲各 2、至多 1 次崩溃与 1 次断线；36.0 万不同状态、8 秒，通过 |
| CursorTwo.cfg（安全补充，不登记） | 同上 | 2 个订阅（对称约减）、2 条事实、至多 1 次崩溃与 1 次断线；217 万不同状态、1.5～3 分钟（视并发），通过；只在重放脚本里运行 |
| CursorProgress.cfg（进展） | EventuallyDelivered（MP-1）；BuffersDrain（MP-3：事实队列排空）；AttemptsSettle（MP-2）；GapMarked（MS-4 的最终可见） | 1 个订阅、2 条事实；弱公平加在事实投递、缺口投递、瞬态投递、对账、订阅与 attempt 收尾；5.0 万不同状态、16 秒，通过（3 条事实的活性检查超过 5 分钟，未登记） |
| CursorNoFill.cfg（否定，不登记） | 铃只转发自身、不从订阅水位补：期望违反 CursorComplete | 找到反例（数百状态、1 秒内；反例前探索的状态数随 worker 数变化）：订阅后丢第 1 次铃、听到第 2 次，游标越过未投递的事实 |
| CursorBuffered.cfg（否定，不登记） | 补齐来自最近 1 条的流缓冲而非投影：期望违反 CursorComplete | 找到反例（不到一百状态、1 秒内）：离线期间两条事实，续订只拿到最后一条 |

模型发现：(1) 首稿订阅建立把整个补齐区间一次塞进缓冲，3 条事实、缓冲 2 的配置立刻给出
`TypeOK` 反例；补齐改为分页、余下由对账续推，提案的背压表随之从"缓冲满关订阅"改为"水位
停住、有空位再续"。(2) 首稿把事实帧与瞬态帧放在同一个队列，进展检查给出反例：无穷多次
attempt 的 `started / ended` 帧一直占满队列，事实帧永远进不来（`EventuallyDelivered` 与
`BuffersDrain` 同时违反）；模型改为事实队列与瞬态环分开，与提案背压表的两行一致，
`ended{committed}` 因此进瞬态环、客户端按位置读消息而不依赖两类帧的顺序。(3) 单队列
模型下两订阅加崩溃的配置 5 分钟内未完成；分开后两订阅 2 条事实含崩溃 1.5～3 分钟完成，登记的
安全配置仍取 1 个订阅、3 条事实、含崩溃（单配置 ≤ 1 分钟）。

## 条款覆盖

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [SE-01](v1/contract.md) 身份、不可变字段、列表过滤 | 无模型；提供者验收（[设计 §2.2](../../../packages/session/session/design.md#22-权威对象)） | 全部为数据形状与读面 |
| [SE-02](v1/contract.md) 生命周期 | Lifecycles.cfg（S2：非终态 Run 下不可归档；[场景 S01](../../compositions/session-run-agent-lifecycles/v1/scenarios.md)）；Inbound.cfg（ArchiveClean、Archive/Restore/Delete 动作） | 删除后的墓碑与审计披露 |
| [SE-03](v1/contract.md) 历史 | 无模型；提供者验收 | 水位读面与切点可见性 |
| [SE-04](v1/contract.md) 队列项与 closed 原因 | QueueControl（TakenInputStable：取批后内容不再变）；Inbound.cfg（Withdraw 同步减队列） | closed 原因词表逐项、附件占用 |
| [SE-05](v1/contract.md) edit / reorder / withdraw 修订 | QueueControl（Edit 只对 queued 项） | reorder 的完整成员校验 |
| [SE-06](v1/contract.md) takeBatch | QueueControl（SingleClaim、ExactSlot）；RunDriverSched.cfg（取项建 Run）；[run-driver 场景 S01/S02](../run-driver/v2/scenarios.md) | 队首失权 blocked 不跳过 |
| [SE-07](v1/contract.md) 有序命令 | QueueControl（CommandHasExecutionRight）；[场景 S17](../run-driver/v2/scenarios.md) | 让行位置与清除集合 |
| [SE-08](v1/contract.md) interrupt_then_run | Lifecycles.cfg（LC-04 行 8 的同提交）；[场景 S16](../run-driver/v2/scenarios.md) | 停止未知时的 pending 显示 |
| [SE-09](v1/contract.md) 会话级强停 hold | QueueControl（HoldRespected、SafeRelease）；Lifecycles.cfg（L1：旧 epoch 迟到提交被拒；[场景 S03](../../compositions/session-run-agent-lifecycles/v1/scenarios.md)） | continueQueue 的目标列表语义 |
| [SE-10](v1/contract.md) 状态贡献注册 | 无模型；提供者验收（[persistence](../../../packages/session/persistence/design.md)） | 全部 |
| [SE-11](v1/contract.md) 恢复顺序 | Lifecycles.cfg（Crash 动作后 L1/I1）；Inbound.cfg（ScanBeforeDrive）；[场景 S07](../../compositions/session-run-agent-lifecycles/v1/scenarios.md)、[S15](../run-driver/v2/scenarios.md) | 前缀校验、版本校验、投影重建（崩溃注入验收） |
| [SE-12](v1/contract.md) arrival 账本与去重 | Inbound.cfg（Dedup、IntentOnce）；RunDriver.cfg（I-22/I-23 消费恰一次） | payloadRef 与 refs 的形状 |
| [SE-13](v1/contract.md) 意图与来源 | Inbound.cfg（三类来源折叠）；RunDriver.cfg（I-23：已结算前台调用不再是等待位置）；[场景 S04/S18/S19](../run-driver/v2/scenarios.md) | 十种来源逐一区分（模型折叠为三类）；control 意图不建模 |
| [SE-14](v1/contract.md) 决定表 | Inbound.cfg（Decide 的 A/B/C/D1/D2 列、ClassifyRule）；RunDriverSched.cfg（终态晚到）；[场景 S11](../run-driver/v2/scenarios.md) | schedule_due 按 originWork 判 refused_origin_cancelled；isolated（stopping）与 cancelled_run 在模型中同为 closed |
| [SE-15](v1/contract.md) 调度与激活 | LifecyclesProgress.cfg（LP1a/LP1b）；RunDriverSchedProgress.cfg（P-2）；Inbound.cfg（StartRun 要求 Pending 空） | 先找 ready 实例再激活（提供者验收，[场景 S04](../../compositions/session-run-agent-lifecycles/v1/scenarios.md)） |
| [SE-16](v1/contract.md) context 水位与容量 | Inbound.cfg（Capacity、wm 单调；OpenStep 消费全部 context）；[场景 S18](../run-driver/v2/scenarios.md) | lowerBound 推进与保留期 |
| [SE-17](v1/contract.md) 结算时接续处理 | Inbound.cfg（NoStaleContinuation、Settle 同步转换/关闭）；Lifecycles.cfg（I14）；RunDriver 否定变体 splitSettle；[场景 S05](../../compositions/session-run-agent-lifecycles/v1/scenarios.md)、[S12](../run-driver/v2/scenarios.md) | — |
| [SE-18](v1/contract.md) 两次提交与启动扫描 | Inbound.cfg（Accept 与 Classify 分离；ScanBeforeDrive）；InboundProgress.cfg（EveryArrivalAdjudicated） | 扫描分页与幂等（提供者验收） |

刻意未覆盖：租户与权限（[设计 §11](../../../packages/session/session/design.md#11-当前调用者对象权限与运行委托)
按 TG 契约验收）、多 Session、control 意图的映射、十种来源的逐一区分、出站流与通知
（[U-36](../../../docs/proposals/session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)）、
真实提供者的装卸与清理失败。检查是有限状态证据，不是无界系统或真实实现的证明；
实现符合性按上列场景另行验收。
