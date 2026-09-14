# Session Inbound：到达账本与投递裁决

[提案索引](README.md) · [Loop](loop.md) · [不变式](invariants.md)

## 问题

一次 Run 中途会异步到达的事情很多：connector 通知、后台工具回调、暂行效用的
人类决定回传、子代理结果、跨会话消息、日程到期、用户新输入与控制。它们与 Run
的生命周期不对齐（U-10）：可能在 Step 中途到达、在 Run 等待时到达、在 Run 已
终态后到达。已接受的 SR-08 承认 Run 可由"触发依据"启动，但 SR-04 的队列只定义
了 text/command，触发与队列的相对顺序、容量、可见性、撤回都没有正文。本文件
补这一块。

## 定义

每个 Session 有一份耐久的 **Inbound（到达账本）**。任何要投递给该 Session 的
东西先受理成一条 arrival 事实，再由一次短提交在"裁决时刻观察到的 Run 状态"下
决定它的**投递意图**。意图只有四种：

| 意图 | 含义 | 消费者 |
|---|---|---|
| `queue` | 进入 SR-04～07 的有序队列，作为下一个 Run 的启动依据 | E0/E1 的 `takeBatch` / `takeCommand` / `takeTrigger` |
| `continuation` | 让当前非终态 Run 的某个待答位置就绪 | E5/E6 |
| `context` | 不启动、不唤醒任何工作，只在下一次装配时按水位可见 | E1 |
| `control` | 改变执行权或阻塞集合；是 SR-10～12 的 operation，不是 arrival 项 | E7 |

用户文本与 slash command 仍走 SR 队列，语义不变；Inbound 是其上层统一受理面，
队列是其中意图为 `queue` 的那一段。trigger 项也进这段队列（U-7）。

**核心规则：arrival 的意图由裁决时刻的 Run 状态决定并耐久记录；之后 Run 状态再变，
只能触发有记录的转换，不能丢也不能双投**（I-13、I-14）。

## arrival 对象

| 字段 | 含义 |
|---|---|
| `arrivalId` | 不复用身份，由 Inbound 分配 |
| `tenantId`、目标 `SessionRef`（无会话的系统工作用 `WorkRef`） | CD-01 |
| `source` | 封闭枚举，见下 |
| `dedupKey` | 逻辑到达身份；`(source, dedupKey)` 相同只有一条 arrival（I-15） |
| `payloadRef` | 内容或指向来源事实的引用；被动订阅只记指针与水位（U-9），不复制原件 |
| `observedRun` | 裁决时的 RunRef、epoch、状态 |
| `intent` | 四种之一 |
| `state` | `accepted → classified → delivered | consumed | converted | withdrawn_by_user | closed_by_archive | closed_by_delete` |
| `policy` | 来源配置的忙时处理与有界策略 |

## 来源枚举

`user_text`、`user_command`（slash）、`user_control`（含 keyboard command，不入队）、
`call_settlement`、`call_frame`、`provisional_outcome`、`human_answer`、
`subagent_result`、`subagent_message`、`handoff_result`、`connector_passive`、
`connector_condition`、`schedule_due`、`cross_session_message`。

## 裁决决定表

| 来源 | Run 非终态且引用本 Run 待答位置 | Run 非终态、不引用待答位置 | Run 终态或无 Run |
|---|---|---|---|
| `call_settlement` / `call_frame` | `continuation` | 不可能（结算必引用 call） | `queue`（trigger，U-10） |
| `provisional_outcome` | 策略"一次接续"→ `continuation`；"下次运行可感知"→ `context` | 同左 | "一次接续"降级为 `queue`（trigger），记 `converted_after_completion` |
| `human_answer` | `continuation`（经 HD-08） | 迟到答复按 HD-02 返回当前结果，不生成 arrival | 同左 |
| `subagent_result`（delegate/spawn） | `continuation`（master 前台等待） | `context`（U-9；SR-09 晚到结果归原 Step、后续感知为新事实） | `queue`（trigger） |
| `subagent_message` | `context` | `context` | `queue`（trigger）或按目标配置 |
| `handoff_result` / 定时派发结果（PF-004.C7） | 不适用 | `queue`（trigger），忙碌时有界等待 | `queue`（trigger） |
| `connector_passive`（PF-002.C8） | `context` | `context` | `context`；永不启动或唤醒 |
| `connector_condition`（PF-002.C9） | 按 `policy`：`queue`（trigger）或系统发起 `interrupt_then_run` | 同左 | `queue`（trigger） |
| `schedule_due` 执行（PF-011.C4/C5） | `queue`（trigger）；"继续同一件工作"引用原工作 | 同左 | `queue`（trigger） |
| `schedule_due` 纯通知（PF-011.C10） | 不进 Inbound，进通知落点 | 同左 | 同左 |
| `cross_session_message`（PF-017.C6） | 按目标权限与配置：`queue`（trigger）或 `context`；绝不自动打断 | 同左 | `queue`（trigger） |
| `user_text` / `user_command` | `queue`；或 `interrupt_then_run` = `control` + `queue` | 同左 | `queue` |
| `user_control` | `control` | `control` | `stale_target` / `ended` |

## 队列消费（U-7、U-8）

- `takeBatch`：固定队首连续合格的 `user_text` 项为一批，开一个 Run；遇到
  `user_command` 或 trigger 项停止（SR-06）。
- `takeCommand`：队首为 slash command 时，一项一 Run 依次消费（SR-07）。
- `takeTrigger`：队首为 trigger 项时，一项一 Run；trigger 与 command 同为分隔符。
- 三者互斥，一个 Run 恰有一个启动依据（I-5）。
- 队列内的任何项（含 trigger）在 `queued/held` 状态随时可撤回，留 `withdrawn_by_user`
  记录；撤回只关闭这次投递，来源事实仍在各自权威处。一旦被取走启动 Run，只能对
  Run 施加 SR-10～12 的控制（I-6）。
- keyboard command 是即时控制，不入队。

## 有界与去重义务

- 每类来源的未消费 arrival 数量有界；满时拒绝并记录，不覆盖已受理项（I-17）。
  去抖与合并（PF-002.C9）、错过政策（PF-011.C9）在受理时执行。
- `(source, dedupKey)` 去重返回原 arrival；重启、重扫、重投收敛到同一逻辑到达
  （CC-05、PF-002.C9、PF-011.C9、PF-004.C3）。
- `context` 意图只记指针与水位，"内容可见、已交给模型、模型理解"分别记录（PF-002.C8）。

## 与 Run 终态的协调

裁决与目标 Run 的终态转移在同一协调域全序（CC-01）。E8 结算前先处理所有指向本
Run 的 `continuation`：未消费者转为 `queue`（trigger）并记 `converted`；结算后到达
者直接裁决为 `queue`。这就是 SR-09"没有未处理就绪接续"的落实。

## 覆盖核对

按全部产品与系统要求逐条核对投递落点，未发现落不进四种意图的投递。

| 要求 | 投递物 | 落点 |
|---|---|---|
| PF-002.C8 / C9 | 被动订阅内容；条件触发 | `connector_passive` → `context`；`connector_condition` → `queue` 或系统控制 |
| PF-003.C1～C6 | 状态、帧、结果、后台回执、重建后重连 | `call_frame` / `call_settlement`；重连在 E0 |
| PF-004.C3 / C5 / C7 | 子结果、子消息、handoff 与定时派发结果 | `subagent_result` / `subagent_message` / `handoff_result` |
| PF-005、PF-007、PF-008 | 人类答复、池内答复、暂行决定 | `human_answer` → HD-08；暂行 → `provisional_outcome` |
| PF-009 | 文本、附件、slash 命令、keyboard | `queue`；keyboard → `user_control` |
| PF-011.C4 / C5 / C9 / C10 | 到期执行、继续同一工作、纯通知 | `schedule_due` → `queue`；纯通知不进 Inbound |
| PF-013 全部 | 队列、到达行为、打断、强停、撤回 | `queue` + `user_control` |
| PF-017.C2 / C5 / C6 | 跨会话消息与答复 | `cross_session_message` |
| PF-012、PF-016、PF-020、PF-021 | 环境、插件、依赖、机器变化 | 门与就绪条件的输入，不是投递；恢复在 E6 感知 |
| PF-019 | 额度变化 | 门的输入；耗尽走 E7，恢复在 E6 |
| PF-023 | 会话模型切换 | Session 事实，本 Run 固定、下一 Run 生效；不进 Inbound |
| PF-001、PF-006、PF-010 | 租户、授权、资产变化 | CC-02/04 撤销屏障，只影响后续准入 |
| PF-014、PF-015、PF-018、PF-022、PF-024 | 发现装载、制品、知识、输出、多命令 | 工具调用或输出面消费，不产生 arrival |
| SYS-RUNTIME-CONTINUITY、SR-14、CC-06 | 运行时重建 | E0：新 epoch、重连、从已裁决意图继续 |
| SYS-OBSERVABILITY.C2 | 跨边界关联 | arrival 携带 tenant、来源身份、dedupKey、observedRun、消费它的 Run/Step |
| SYS-LONG-RUNNING | 无限唤醒与饿死 | 来源有界、去重、合并；`context` 永不唤醒 |
