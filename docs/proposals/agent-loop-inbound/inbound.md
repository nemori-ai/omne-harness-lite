# Session Inbound：到达账本与投递裁决

[提案索引](README.md) · [Loop](loop.md) · [不变式](invariants.md) · [评审 r1](review.md) · [评审 r2](review-r2.md)

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
| `continuation` | 让当前非终态 Run 的某个等待位置（或 Run 本身，见暂行回传）就绪 | E1 / E4A / E5 / E5W / E6 |
| `context` | 不启动、不唤醒任何工作，只在下一次装配时按水位可见 | E1 |
| `control` | 改变执行权或阻塞集合；是 SR-10～12 的 operation，不是 arrival 项 | E7 |

用户文本与 slash command 仍走 SR 队列，语义不变；Inbound 是其上层统一受理面，
队列是其中意图为 `queue` 的那一段。trigger 项也进这段队列（U-7）。

**核心规则：arrival 的意图由裁决时刻的 Run 状态决定并耐久记录；之后 Run 状态再变，
只能触发有记录的转换，不能丢也不能双投**（I-13、I-14）。**同一事实只有一条进入
Loop 的路径**（X3）：调用结算、人类答复、暂行回传、门恢复只以已裁决的 arrival 被
Loop 消费；Loop 直接读工具/人类决定权威的状态只用于 fold 非结算视图（executing、
detach、pending gate）、E7 收口的 `inspect` 与 E0 的重连。

## arrival 对象

| 字段 | 含义 |
|---|---|
| `arrivalId` | 不复用身份，由 Inbound 分配；裁决提交的 operationId 从它派生 |
| `tenantId`、目标 `SessionRef`（无会话的系统工作用 `WorkRef`） | CD-01；跨会话消息（PF-017.C3）的目标授权在受理时检查，未获准不受理也不泄漏存在 |
| `source` | 封闭枚举，见下 |
| `dedupKey` | 逻辑到达身份；`(source, dedupKey)` 相同只有一条 arrival（I-15） |
| `payloadRef` | 内容或指向来源事实的引用；被动订阅只记指针与水位（U-9），不复制原件 |
| `refs` | 可选：本 arrival 引用的 Run 等待位置（call/attempt、requestId、continuationId、`gateRef`），或 `run`（Run 级位置，仅暂行回传使用） |
| `originWork` | 可选：`schedule_due` 引用的原工作（WorkRef/RunRef），用于装配与 D 列判定；不是等待位置 |
| `observedRun` | 裁决时的 RunRef、epoch、状态：有 `refs` 取被引用的 Run（`call_settlement` 即**发起该调用的 Run**；WorkRef 下派发的调用没有 Run，记 `none`）；无 `refs` 取当前持有占位的 Run，没有则 `none`；只作溯源，不改变 `originWork` 决定的判定 |
| `intent` | 四种之一 |
| `state` | `accepted → classified → consumed | converted | closed | withdrawn_by_user`；`closed` 附原因（`cancelled_run`、`isolated`、`closed_by_archive`、`closed_by_delete`、`superseded`、`refused_capacity`、`refused_origin_cancelled`） |
| `policy` | 来源配置：有界、去抖与合并参数，以及条件触发/跨会话消息的投递偏好；调用结算没有来源策略，一律按发起者判定 |

`consumed` 由消费它的 Step、E4A 提交或 Run 在同一提交写入；不设 `delivered` 之类
的非权威中间态（U-2）。意图为 `queue` 的 arrival 与 SR-04 队列项一一对应：队列项
状态沿 SR-04（`queued/held/taken/withdrawn/closed`），`converted` 的 continuation 生成
的 trigger 项记录其来源 arrival。

## 来源枚举

| 来源 | 说明 |
|---|---|
| `user_text` | 用户文本（含附件引用；PF-009.C6 上下文装载型命令解析后的产物随本项） |
| `user_command` | SR-07 有序 slash command；keyboard command 是 `control`，不是 arrival |
| `call_settlement` | 任何工具调用的 TL-07 终态结算，含子代理/handoff 派发调用与 PF-004.C7 定时派发在 WorkRef 下创建的派发调用（U-15：结果路由统一沿 TL-10/11；终止传播不在此列）；帧（TL-12）不是 arrival |
| `provisional_outcome` | HD-12 暂行决定按动作预先声明的回传（PF-007.C7 的"供下次运行感知"与"触发一次接续"）；"仅改变产物"不生成，"触发补偿"进入独立 WorkRef |
| `human_answer` | 经 HD-08 提交的人类决定：问答型（答复内容）与审批型（approve/reject 决定）。审批型只承载决定；获批调用后来的结算另作 `call_settlement` |
| `gate_restored` | 预算额度恢复（PF-019.C6）或依赖恢复（PF-020.C5）的事实，只在存在等待该门的 Run 时由相应能力发出 |
| `connector_passive` | PF-002.C8 被动订阅 |
| `connector_condition` | PF-002.C9 条件触发 |
| `schedule_due` | PF-011 到期执行，带 `originWork`；纯通知（PF-011.C10）不进 Inbound |
| `cross_session_message` | PF-017 跨会话消息与答复，含子代理会话发来的消息 |

每种人类请求只对应一个来源：问题 → `human_answer`；审批 → `human_answer`（决定）
再 → `call_settlement`（执行结局）；暂行 → `provisional_outcome`（回传）与
`call_settlement`（原调用结局）分别对应不同事实，互不重复。

## 裁决决定表

列的含义：

- A：存在被 `refs` 引用且尚在等待该位置的非终态 Run；
- B：Run 非终态但无引用、引用的位置已不在等待，或 Run 正在运行不等待；
- C：Run 为 `completed`/`failed`，或 Session 无 Run；
- D1：Run 为 `cancelled`（含 force_stopped）或 `stopping`，Session 仍 open；
- D2：Session 已 archived/deleted（SR-02），其 Run 级联终止。

U-11：D1/D2 都是人主动终止的意图，晚到回调不得恢复。D2 下 Session 不能受理新的
排队输入（SR-02），因此 D2 列没有 `queue`。

列的判定对象是**被引用的 Run**：对 `call_settlement` 就是发起该调用的 Run，不是
当前恰好占位的 Run（U-15 的工具视角，2026-09-14 用户确认）。因此已终态 Run 或
WorkRef 定时派发的调用结算落 C 列排队，哪怕此刻另一个 Run 正在运行；当前活跃
Run 自己发起、但已不在该位置等待的调用落 B 列。子代理、handoff、定时派发都不
另设忙时策略。

| 来源 | A | B | C | D1 | D2 |
|---|---|---|---|---|---|
| `call_settlement` | `continuation` | `context`（发起 Run 非终态但不在此位置等待：U-9；SR-09 晚到结果归原 Step，后续感知为新事实） | `queue`（trigger：发起 Run 已终态，或 WorkRef 派发无发起 Run；U-10、PF-004.C7） | `closed(cancelled_run)`；发起 Run 为 `stopping`/`cancelled(force_stopped)` 时 `closed(isolated)`，结算只作 SR-12 的隔离证据 | `closed(closed_by_archive | closed_by_delete)` |
| `provisional_outcome` | "一次接续" → `continuation`；"下次运行可感知" → `context` | "一次接续" → `continuation`，`refs = run`：不唤醒进行中的 Step，在下一次 E5 判定时作为就绪接续（M5 裁决，保持 HD-12 的承诺）；"下次运行可感知" → `context` | "一次接续" → `queue` 并记 `converted`；"下次运行可感知" → `context` | `closed` | `closed` |
| `human_answer` | `continuation`（问答型 → E1；审批型 → E4A） | 不可能（答复必引用请求）；迟到答复按 HD-02 返回当前结果，不生成 arrival | 同左 | 同左 | 同左 |
| `gate_restored` | `continuation`（Run 在 `waiting_gate` 且 `gateRef` 匹配） | 不生成（门状态在下次准入时重查） | 不生成 | 不生成 | 不生成 |
| `connector_passive` | `context` | `context` | `context`；永不启动或唤醒 | `context` | 不受理 |
| `connector_condition` | 按 `policy`：`queue`（trigger）或系统发起 `interrupt_then_run`（`control` + `queue`） | 同左 | `queue` | `queue` | 不受理 |
| `schedule_due` | `queue`（trigger）；判定依据是 `originWork` 而非 `observedRun`："继续同一件工作"按 U-14 要求原 Run 已结算 | 同左 | `queue` | `originWork` 被人取消或强停 → `closed(refused_origin_cancelled)`（PF-011.C9）；否则 `queue` | 不受理 |
| `cross_session_message` | 按目标权限与配置：`queue`（trigger）或 `context`；绝不自动打断 | 同左 | `queue` | `queue` | 不受理 |
| `user_text` / `user_command` | `queue`；或用户发起 `interrupt_then_run` = `control` + `queue` | 同左 | `queue` | `queue` | 不受理 |

系统发起的 `interrupt_then_run` 是 SR-11 之外的新用法：SR-11 的"新 input"定义
只覆盖用户输入；本提案要求 session-run 新版本把"系统按获准配置发起的复合打断"
纳入同一语义（U-16 的落点之一）。后果沿 SR-11：旧 Run 尚待批准的调用结算
`cancelled_before_execution`，相关审批 `superseded`。

## 队列消费（U-7、U-8）

- `takeBatch`：固定队首连续合格的 `user_text` 项为一批，开一个 Run；遇到
  `user_command` 或 trigger 项停止（SR-06）。
- `takeCommand`：队首为有序 slash command 时，一项一 Run 依次消费（SR-07）。
- `takeTrigger`：队首为 trigger 项时，一项一 Run；trigger 与 command 同为分隔符。
  门 = SR-06 条件 + trigger 来源权威在取用时仍有效（到期重查权限、依赖、资源）。
- 三者互斥，一个由本提案路径启动的 Run 恰有一个启动依据（I-5）；取批与 Run 建立、
  占位、epoch 在同一提交，operationId 从 `(SessionRef, queueRevision, kind)` 派生。
- 队列内的任何项（含 trigger）在 `queued/held` 状态随时可撤回，记 `withdrawn_by_user`；
  撤回只关闭这次投递，来源事实仍在各自权威处。一旦被取走启动 Run，只能对 Run 施加
  SR-10～12 的控制（I-6）。
- keyboard command 是即时控制，不入队。
- Session 级调度：无活动占位且队列有合格项时，由 Inbound 拥有的调度启动下一 Run
  （P-2），不依赖某个 Loop 实例存活；占位被 Yield 后的 Run 持有时，调度只能重取
  该 Run（loop.md E0）。调度启动经 live-agent 的激活与工作许可（AR）后进入 E0。

## context 水位

context 意图的 arrival 按受理序号形成 Session 级序列，水位由 Inbound 拥有。E1 开
Step 时读取当前水位并把水位值记入切点；同一 Session 的多个非终态 Run 共享序列，
各自记录自己消费到的水位。"可见"与"消费到的水位"是两个概念：可见范围是
`(不再可见下界, 当前水位]`，由撤回与保留期推进下界；Run 记录的消费水位只作溯源，
不缩小可见范围。context 项在可见范围内对后续 Step 持续可见；装配按
`payloadRef`/callId 去重已进入历史的结果，不重复喂给模型。撤回与到期只推进下界，
不改写已记录的切点。

## 有界与去重义务

- 外部来源（`user_text`、`user_command`、`connector_passive`、`connector_condition`、
  `schedule_due`、`cross_session_message`）的未消费 arrival 数量有界；满时拒绝并记录
  `closed(refused_capacity)`，不覆盖已受理项（I-17；PF-013.C7）。去抖与合并
  （PF-002.C9）、错过政策（PF-011.C9）在受理时执行。
- 内部事实来源（`call_settlement`、`provisional_outcome`、`human_answer`、`gate_restored`）
  不适用"满时拒绝"：它们的数量由各自权威的有界性（已准入调用数、待决请求数、
  等待中的门数）承担，拒绝会丢失真实结局（PF-004.C3、TL-11）。
- `(source, dedupKey)` 去重返回原 arrival；重启、重扫、重投收敛到同一逻辑到达
  （CC-05、PF-002.C9、PF-011.C9、PF-004.C3）。
- `context` 意图只记指针与水位，"内容可见、已交给模型、模型理解"分别记录（PF-002.C8）。

## 恢复时的裁决

受理与裁决是两次提交。非预期退出可能留下 `accepted` 而未 `classified` 的 arrival。
裁决者不依赖 Loop：session-run 提供者在启动时扫描其拥有的全部 Session（含没有
Run、没有 live-agent 的空闲 Session），把未裁决的 arrival 在当前 Run 状态下裁决；
这是提供者义务，E0 第 3 步只是等待这件事对本 Session 完成。空闲 Session 因此
不会留下永不裁决的 arrival（I-21 的进展侧）。`decide` 只读 `classified` 的
arrival（I-21 的安全侧）。

## 与 Run 终态的协调

裁决与目标 Run 的终态转移在同一协调域全序（CC-01）。E8 结算与接续处理在**同一
提交**：终态为 `completed`/`failed` 时，未消费 `continuation` 转为 `queue` 并记
`converted`；终态为 `cancelled` 或级联关闭时 `closed`。结算后到达者按决定表 C/D1/D2
列裁决。这是 SR-09"没有未处理就绪接续"与 U-11 的落实（I-14）。

一个已接受的代价：`failed(context_overflow)` 的 Run 若留有后台调用，每个晚到结算
都会 `queue` 一项 trigger，各自开一个大概率再次超限的 Run；数量受该 Run 已准入
调用数约束，成本可见但不为零（M13）。

## 覆盖核对

按全部产品与系统要求逐条核对投递落点，未发现落不进四种意图的投递。

| 要求 | 投递物 | 落点 |
|---|---|---|
| PF-002.C8 / C9 | 被动订阅内容；条件触发 | `connector_passive` → `context`；`connector_condition` → `queue` 或系统控制 |
| PF-003.C1～C6 | 状态、帧、结果、后台回执、重建后重连 | 帧走 TL-12 披露面；结算为 `call_settlement`；重连在 E0 |
| PF-004.C3 / C5 / C7 | 子结果、子消息、handoff 与定时派发结果 | 派发是工具调用：结果为 `call_settlement`，定时派发无发起 Run 而落 C 列排队；子消息为 `cross_session_message` |
| PF-005、PF-007、PF-008 | 人类答复、池内答复、暂行决定 | `human_answer` → HD-08；暂行 → `provisional_outcome` |
| PF-009 | 文本、附件、slash 命令、keyboard | `queue`（上下文装载型命令随文本项）；keyboard → `control` |
| PF-011.C4 / C5 / C9 / C10 | 到期执行、继续同一工作、纯通知 | `schedule_due` → `queue`；纯通知不进 Inbound |
| PF-013 全部 | 队列、到达行为、打断、强停、撤回 | `queue` + `control` |
| PF-017.C2 / C5 / C6 | 跨会话消息与答复 | `cross_session_message`；Run 内等待答复只能是工具调用 |
| PF-019.C6、PF-020.C5 | 额度恢复、依赖恢复 | `gate_restored` → 唤醒 `waiting_gate` |
| PF-012、PF-016、PF-021 | 环境、插件、机器变化 | 门的输入，不是投递；Run 级缺失时进入 `waiting_gate`，调用级缺失沿 TL-06 结算 |
| PF-023 | 会话模型切换 | Session 事实，本 Run 固定、下一 Run 生效；不进 Inbound |
| PF-001、PF-006、PF-010 | 租户、授权、资产变化 | CC-02/04 撤销屏障，只影响后续准入 |
| PF-014、PF-015、PF-018、PF-022、PF-024 | 发现装载、制品、知识、输出、多命令 | 工具调用或输出面消费，不产生 arrival |
| SYS-RUNTIME-CONTINUITY、SR-14、CC-06 | 运行时重建 | Session 级裁决先行；E0 新 epoch、重连、从已裁决意图继续 |
| SYS-OBSERVABILITY.C2 | 跨边界关联 | arrival 携带 tenant、来源身份、dedupKey、observedRun、消费它的 Run/Step |
| SYS-LONG-RUNNING | 无限唤醒与饿死 | 外部来源有界、去重、合并；`context` 永不唤醒 |
