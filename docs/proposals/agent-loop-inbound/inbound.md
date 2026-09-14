# Session Inbound：到达账本与投递裁决

[提案索引](README.md) · [Loop](loop.md) · [不变式](invariants.md) · [评审 r1](review.md)

## 问题

一次 Run 中途会异步到达的事情很多：connector 通知、后台工具回调、暂行效用的
人类决定回传、子代理结果、跨会话消息、日程到期、用户新输入与控制。它们与 Run
的生命周期不对齐（U-10）：可能在 Step 中途到达、在 Run 等待时到达、在 Run 已
终态后到达。已接受的 SR-08 承认 Run 可由"触发依据"启动，但 SR-04 的队列只定义
了 text/command，触发与队列的相对顺序、容量、可见性、撤回都没有正文。本文件
补这一块；接受后进入 session-run 的新版本（U-16）。

## 定义

每个 Session 有一份耐久的 **Inbound（到达账本）**，由 session-run 能力拥有，包含
一个不依赖 Loop 存在的 **Session 级裁决者**。任何要投递给该 Session 的东西先受理
成一条 arrival 事实，再由裁决者在一次短提交内、在"裁决时刻观察到的 Run 状态"下
决定它的**投递意图**。意图只有四种：

| 意图 | 含义 | 消费者 |
|---|---|---|
| `queue` | 进入 SR-04～07 的有序队列，作为下一个 Run 的启动依据 | E0 的 `takeBatch` / `takeCommand` / `takeTrigger` |
| `continuation` | 让当前非终态 Run 的某个等待位置就绪 | E5W/E6 |
| `context` | 不启动、不唤醒任何工作，只在下一次装配时按水位可见 | E1 |
| `control` | 改变执行权或阻塞集合；是 SR-10～12 的 operation，不是 arrival 项 | E7 |

用户文本与 slash command 仍走 SR 队列，语义不变；Inbound 是其上层统一受理面，
队列是其中意图为 `queue` 的那一段。trigger 项也进这段队列（U-7）。

**核心规则：arrival 的意图由裁决时刻的 Run 状态决定并耐久记录；之后 Run 状态再变，
只能触发有记录的转换，不能丢也不能双投**（I-13、I-14）。

## arrival 对象

| 字段 | 含义 |
|---|---|
| `arrivalId` | 不复用身份，由 Inbound 分配；裁决提交的 operationId 从它派生 |
| `tenantId`、目标 `SessionRef`（无会话的系统工作用 `WorkRef`） | CD-01；跨会话消息（PF-017.C3）的目标授权在受理时检查，未获准不受理也不泄漏存在 |
| `source` | 封闭枚举，见下 |
| `dedupKey` | 逻辑到达身份；`(source, dedupKey)` 相同只有一条 arrival（I-15） |
| `payloadRef` | 内容或指向来源事实的引用；被动订阅只记指针与水位（U-9），不复制原件 |
| `refs` | 可选：本 arrival 引用的 Run 等待位置（call/attempt、requestId、continuationId、门） |
| `observedRun` | 裁决时的 RunRef、epoch、状态：有 `refs` 取被引用的 Run；无 `refs` 取当前持有占位的 Run，没有则 `none` |
| `intent` | 四种之一 |
| `state` | `accepted → classified → consumed | converted | closed | withdrawn_by_user`；`closed` 附原因（`cancelled_run`、`closed_by_archive`、`closed_by_delete`、`superseded`） |
| `policy` | 来源配置的忙时处理与有界策略 |

`consumed` 由消费它的 Step 或 Run 在同一提交写入；不设 `delivered` 之类的非权威
中间态（U-2）。

## 来源枚举

| 来源 | 说明 |
|---|---|
| `user_text` | 用户文本（含附件引用） |
| `user_command` | slash command；keyboard command 是 `control`，不是 arrival |
| `call_settlement` | 任何工具调用的结算，含子代理派发调用、handoff 派发调用、定时派发在 WorkRef 下创建的派发调用（U-15：子代理本质是工具，前后台与晚到规则统一沿 TL-10/11）；帧（TL-12）不是 arrival |
| `provisional_outcome` | HD-12 暂行决定的回传 |
| `human_answer` | 经 HD-08 提交的人类答复及其 continuation 意图 |
| `gate_restored` | 预算或依赖恢复的事实（PF-019、PF-020.C5），由相应能力发出 |
| `connector_passive` | PF-002.C8 被动订阅 |
| `connector_condition` | PF-002.C9 条件触发 |
| `schedule_due` | PF-011 到期执行；纯通知不进 Inbound |
| `cross_session_message` | PF-017 跨会话消息与答复，含子代理会话发来的消息 |

## 裁决决定表

列的含义：A = 存在被 `refs` 引用且尚在等待该位置的非终态 Run；B = Run 非终态但
无引用或引用的位置已不在等待；C = Run 为 `completed`/`failed` 或无 Run；D = Run 为
`cancelled`（含 force_stopped）或 Session 归档/删除级联关闭（U-11：人主动终止的意图
是终态，不因晚到回调恢复）。

| 来源 | A | B | C | D |
|---|---|---|---|---|
| `call_settlement` | `continuation` | `context`（U-9；SR-09 晚到结果归原 Step，后续感知为新事实） | `queue`（trigger，U-10） | `closed(cancelled_run)`，来源事实保留在工具权威处 |
| `provisional_outcome` | "一次接续" → `continuation`；"下次运行可感知" → `context`；"只改变产物" → 不生成 arrival；"显式补偿流程" → 独立 WorkRef，不进本 Session Inbound | 同左（"一次接续"降为 `context`） | "一次接续"降为 `queue` 并记 `converted`；"下次运行可感知" → `context` | `closed` |
| `human_answer` | `continuation` | 不可能（答复必引用请求）；迟到答复按 HD-02 返回当前结果，不生成 arrival | 同左 | 同左 |
| `gate_restored` | `continuation`（Run 在 `waiting_gate`） | `context` | 不生成 arrival | 不生成 arrival |
| `connector_passive` | `context` | `context` | `context`；永不启动或唤醒 | `context` |
| `connector_condition` | 按 `policy`：`queue`（trigger）或系统发起 `interrupt_then_run`（视为 `control` + `queue`） | 同左 | `queue` | `queue` |
| `schedule_due` | `queue`（trigger）。"继续同一件工作"按 U-14 要求原 Run 已结算，到期项引用原工作以便装配（不是 `refs` 等待位置） | 同左 | `queue` | 若原工作被人取消，按 PF-011.C9"已取消或强停的工作不能届时复活"记 `closed`；否则 `queue` |
| `cross_session_message` | 按目标权限与配置：`queue`（trigger）或 `context`；绝不自动打断 | 同左 | `queue` | `queue` |
| `user_text` / `user_command` | `queue`；或 `interrupt_then_run` = `control` + `queue` | 同左 | `queue` | `queue`（Session 未关闭时） |

系统发起的 `interrupt_then_run` 是 SR-11 之外的新用法：SR-11 的"新 input"定义
只覆盖用户输入；本提案要求 session-run 新版本把"系统按获准配置发起的复合打断"
纳入同一语义（U-16 的落点之一）。

## 队列消费（U-7、U-8）

- `takeBatch`：固定队首连续合格的 `user_text` 项为一批，开一个 Run；遇到
  `user_command` 或 trigger 项停止（SR-06）。
- `takeCommand`：队首为 slash command 时，一项一 Run 依次消费（SR-07）。
- `takeTrigger`：队首为 trigger 项时，一项一 Run；trigger 与 command 同为分隔符。
- 三者互斥，一个由本提案路径启动的 Run 恰有一个启动依据（I-5）；取批与 Run 建立、
  占位、epoch 在同一提交。
- 队列内的任何项（含 trigger）在 `queued/held` 状态随时可撤回，记 `withdrawn_by_user`；
  撤回只关闭这次投递，来源事实仍在各自权威处。一旦被取走启动 Run，只能对 Run 施加
  SR-10～12 的控制（I-6）。
- keyboard command 是即时控制，不入队。
- Session 级调度：无活动占位且队列有合格项时，由 Inbound 拥有的调度启动下一 Run
  （P-2），不依赖某个 Loop 实例存活。

## context 水位

context 意图的 arrival 按受理序号形成 Session 级序列，水位由 Inbound 拥有。E1 开
Step 时读取当前水位并把水位值记入切点；同一 Session 的多个非终态 Run 共享序列，
各自记录自己消费到的水位。context 项不是一次性消费：它在水位内对后续 Step 持续
可见，直到来源撤回或保留期到期；撤回与到期只推进"不再可见"的边界，不改写已
记录的切点。

## 有界与去重义务

- 每类来源的未消费 arrival 数量有界；满时拒绝并记录，不覆盖已受理项（I-17）。
  去抖与合并（PF-002.C9）、错过政策（PF-011.C9）在受理时执行。
- `(source, dedupKey)` 去重返回原 arrival；重启、重扫、重投收敛到同一逻辑到达
  （CC-05、PF-002.C9、PF-011.C9、PF-004.C3）。
- `context` 意图只记指针与水位，"内容可见、已交给模型、模型理解"分别记录（PF-002.C8）。

## 恢复时的裁决

受理与裁决是两次提交。非预期退出可能留下 `accepted` 而未 `classified` 的 arrival。
裁决者不依赖 Loop：Session 恢复读取时（无论有无 Run）先把它们在当前 Run 状态下
裁决；E0 第 3 步只是等待这件事完成。空闲 Session 因此不会留下永不裁决的 arrival
（I-21 的进展侧）。`decide` 只读 `classified` 的 arrival（I-21 的安全侧）。

## 与 Run 终态的协调

裁决与目标 Run 的终态转移在同一协调域全序（CC-01）。E8 结算与接续处理在**同一
提交**：终态为 `completed`/`failed` 时，未消费 `continuation` 转为 `queue` 并记
`converted`；终态为 `cancelled` 或级联关闭时 `closed`。结算后到达者按决定表 C/D 列
裁决。这是 SR-09"没有未处理就绪接续"与 U-11 的落实（I-14）。

## 覆盖核对

按全部产品与系统要求逐条核对投递落点，未发现落不进四种意图的投递。

| 要求 | 投递物 | 落点 |
|---|---|---|
| PF-002.C8 / C9 | 被动订阅内容；条件触发 | `connector_passive` → `context`；`connector_condition` → `queue` 或系统控制 |
| PF-003.C1～C6 | 状态、帧、结果、后台回执、重建后重连 | 帧走 TL-12 披露面；结算为 `call_settlement`；重连在 E0 |
| PF-004.C3 / C5 / C7 | 子结果、子消息、handoff 与定时派发结果 | 派发是工具调用：结果为 `call_settlement`；子消息为 `cross_session_message` |
| PF-005、PF-007、PF-008 | 人类答复、池内答复、暂行决定 | `human_answer` → HD-08；暂行 → `provisional_outcome` |
| PF-009 | 文本、附件、slash 命令、keyboard | `queue`；keyboard → `control` |
| PF-011.C4 / C5 / C9 / C10 | 到期执行、继续同一工作、纯通知 | `schedule_due` → `queue`；纯通知不进 Inbound |
| PF-013 全部 | 队列、到达行为、打断、强停、撤回 | `queue` + `control` |
| PF-017.C2 / C5 / C6 | 跨会话消息与答复 | `cross_session_message` |
| PF-019.C6、PF-020.C5 | 额度恢复、依赖恢复 | `gate_restored` → 唤醒 `waiting_gate` |
| PF-012、PF-016、PF-021 | 环境、插件、机器变化 | 门的输入，不是投递；缺失时 Run 进入 `waiting_gate` |
| PF-023 | 会话模型切换 | Session 事实，本 Run 固定、下一 Run 生效；不进 Inbound |
| PF-001、PF-006、PF-010 | 租户、授权、资产变化 | CC-02/04 撤销屏障，只影响后续准入 |
| PF-014、PF-015、PF-018、PF-022、PF-024 | 发现装载、制品、知识、输出、多命令 | 工具调用或输出面消费，不产生 arrival |
| SYS-RUNTIME-CONTINUITY、SR-14、CC-06 | 运行时重建 | Session 级裁决先行；E0 新 epoch、重连、从已裁决意图继续 |
| SYS-OBSERVABILITY.C2 | 跨边界关联 | arrival 携带 tenant、来源身份、dedupKey、observedRun、消费它的 Run/Step |
| SYS-LONG-RUNNING | 无限唤醒与饿死 | 来源有界、去重、合并；`context` 永不唤醒 |
