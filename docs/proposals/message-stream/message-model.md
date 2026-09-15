# 消息模型：一份记录，三种投影

[提案索引](README.md) · [增量协议](delta-protocol.md) · [信封与游标](envelope-and-cursor.md) · [不变式](invariants.md)

目标：历史投影、模型请求装配（[MC-07](../../../spec/capabilities/model-execution/v1/contract.md)）和
客户端呈现消费同一份 `Message` / `ContentBlock` 定义，差异只在投影（[MS-8](invariants.md#安全性质)）。
本文件在 [CD-03](../../../spec/data/core-work/v1/contract.md) 的内容块上补齐，不另造第二套
词汇；DSH 的 `Message{id, role, content, source}` 与 `ContentBlockMap`
（[研究 dsh 笔记 §1](../../research/client-message-stream/notes/dsh.md#1-消息与内容块packagesllm)）
是形状起点，本项目 fork 的 `@omne-harness-lite/llm/baseline` 已带这套类型
（[fork 说明](../core-capabilities/fork/llm-source.md)）。

## 1. `Message` 记录

`Message` 不是新的耐久流：它是从各耐久流的事实**派生**出来的记录，派生规则在 §4；
派生结果由 [projection 包](../../../packages/session/projection/design.md)按 fold 重建，缓存只加速。

```text
Message = {
  messageId: OpaqueId,               // 由 (eventId, ordinal) 确定地派生，不另发号（评审 B4）
  session: SessionRef,
  position: {domain, seq, ordinal},  // 产生它的提交在协调域里的位置（DR-01 envelope 单调序号）+ 同一事实派生多条时的序数
  role: user | assistant | system,   // 供应方无关的角色；工具结果与 system_reminder 的角色由投影决定（§5）
  origin: Origin,                    // 谁产生、经哪个 Step / attempt（出处）
  step: StepRef | null,              // 进入模型的 Step；用户输入在被取批前为 null
  content: ContentBlock[],           // 有序块；每块稳定 blockId
  settlement: {status: success | partial | failed | cancelled | unknown,
               missing: [{blockId, kind, reason}]} | null,  // 助手消息的结算状态与缺失块（评审 B6）；其余为 null
  supersededBy: {domain, seq} | null // 被压缩摘要、编辑或撤回取代时指向取代它的事实（SE-03：摘要是引用原切点的新事实）
}
```

`ordinal` 是派生表（§4）里同一事实派生第 n 条消息的序数，按事实内的顺序（取批的 items
顺序、切点里的 reminder 顺序）编号，跨重建稳定；它与帧信封的 `batch.index` 无关（后者是
订阅局部的投递计数）。

```text
Origin =
  | { kind: user_input, input: {inputId, revision}, acceptedBy: Principal }
  | { kind: model_attempt, attempt: AttemptRef, provider, model, actualModel }
  | { kind: tool_settlement, call: CallRef, attempt: AttemptId }
  | { kind: human_answer, request: RequestRef, answeredBy: Principal }
  | { kind: hook, handler: HandlerRef, site }
  | { kind: system, notice: string }
```

`origin.kind` 回答"谁产生"；DSH 另有 `form` 轴回答"是什么信息"（instructions / catalog /
snapshot / notice / relay / recall），本项目当前没有消费者，不引入，记入
[未决项](README.md#未决项)。`messageId` 从事实的 `eventId` 派生，去重键沿
[U-34](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)。

## 2. 内容块补齐

在 CD-03 的 `text / image / audio / video / file / tool_call / tool_result / deferred_receipt`
上补三处；每块仍有稳定 `blockId`，`additionalProperties: false`：

| 块 | 形状 | 补齐说明 |
|---|---|---|
| `reasoning` | `{blockId, kind: "reasoning", form: text \| summary \| encrypted, text: string \| null, opaque: string \| null, format: string \| null, signature: string \| null}` | 新增（决定 B，用户裁决 [U-49](README.md#裁决记录2026-09-15用户)）。三种形态都耐久：加密形态必须存，因为下一次模型请求要原样带上才能保证上下文完整、prompt cache 真正命中；模型请求投影在同一供应方族原样回传（OpenRouter `reasoning_details` 的三型与 `format`，[研究 openrouter 笔记 §4](../../research/client-message-stream/notes/openrouter.md#4-推理内容)）。面向用户的投影与出站流只给明文，没有明文时退回摘要，加密形态从不流出，历史投影只显示"有加密推理"；模型未提供的推理不被构造（CD-03） |
| `tool_result` | `{blockId, kind: "tool_result", call: CallRef, outcome, value: Result}` | `value` 的形状按 [工具提案结果形状](../tool-execution/schema.md#结果形状)（候选）：`{outcome, output, content: ContentBlock[], error, possibleEffect}`；`content` 里的媒体块带 `delivery`，投影按 [MC-11](../../../spec/capabilities/model-execution/v1/contract.md) 交集处理 |
| `system_reminder` | `{blockId, kind: "system_reminder", reminderKind: late_result \| human_answer \| hook_context \| system_notice, ref: {call, attempt} \| {request} \| {handler} \| null, outcome, content: ContentBlock[]}` | 由[工具提案](../tool-execution/lifecycle.md#占位与迟到结果的投影)提出（候选，用户裁决 [U-46](../tool-execution/README.md#裁决记录2026-09-14用户)）；系统产生、不能经用户输入导入（与 `deferred_receipt` 同一规则）；一份耐久记录，按模型族投影（§5） |

`deferred_receipt` 按[工具提案的占位](../tool-execution/lifecycle.md#占位与迟到结果的投影)取形：
`{blockId, kind: "deferred_receipt", call: CallRef | null, request: RequestRef | null, continuationId,
status: pending, reason: background | waiting_human | superseded, notice: string}`——启动即后台的
调用没有 `request`，`reason` 与 `notice` 让模型知道为什么还没有结果（评审 B5 指出两套形状
不一致，以工具提案为准，进 CD 下一版）。客户端呈现时用调用当前状态
（[工具提案五维状态](../tool-execution/lifecycle.md#五个正交维度)）标注它已结算与否，块本身
不改写（MS-11）。占位不放在 `tool_result.value` 里：`tool_result` 只承载真实结果。

`tool_call{blockId, kind: "tool_call", call: CallRef | null, action: Action | null, validation: accepted |
rejected{reason}, raw: {name, arguments} | null}` 由 `tools.call.proposed` 派生：[TL-01](../../../spec/capabilities/tools/v1/contract.md)
校验通过的片段带 `call` 与 `action`；被拒的片段保留 `raw` 与 `rejected{reason}`（模型确实
提了这个调用，真实结局不能丢，也不能变成可执行的 Action）。流式的参数片段
（[delta-protocol.md](delta-protocol.md)）不是 `tool_call` 块，客户端不得据片段渲染为一次调用。

## 3. 用户消息与附件

用户消息来自队列项：`Input{inputId, revision, content: InputBlock[], busyBehavior, literal}`
（CD v1）。`InputBlock` 只允许 text / image / audio / video / file，媒体块带 `delivery`；
`file` 的 `model_native` 与 `agent_attachment` 分别表示"直喂模型"与"只给 Agent 工具用"
（[PF-009.C4](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md#已确认要求)）。
媒体只有引用 `MediaRef{tenantId, mediaId}`，字节沿 [CT-04](../../../spec/capabilities/media-content/v1/contract.md)
取回；客户端在 [PF-009.C3](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md#已确认要求)
的读权下下载。

一条用户输入从受理起就派生历史消息（`queue.item.enqueued` → `step: null` 的用户消息；
`edited` → 新 revision 的消息并把旧消息 `supersededBy` 指向它；`withdrawn` → 旧消息
`supersededBy` 指向撤回事实、没有后继）；取批（`queue.items.taken`）后该消息的 `step` 指向
消费它的 Step，成为进入模型的消息。这样从未取批就撤回的输入也有历史派生路径（评审 B4
第 2 点）。历史保留原始受理版本与编辑关系（[SE-03](../../../spec/capabilities/session/v1/contract.md)），
普通模型上下文只用已取批的有效版本；客户端历史投影按 `supersededBy` 显示"已编辑 / 已撤回"
而不复活旧版（[PF-013.C10](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求)）。

## 4. 从事实派生消息

同一协调域内所有流共享 DR-01 envelope 的单调序号，历史顺序 = 提交顺序；跨域部署前不需要
另一个全序（[LC-09](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 的义务
清单到时补）。派生表（对应 DSH `deriveMessages()`，[研究 dsh 笔记 §4](../../research/client-message-stream/notes/dsh.md#4-session-日志surface-与派生历史)）：

| 事实（流.对象.事实） | 派生的消息 | 说明 |
|---|---|---|
| `queue.item.enqueued / edited / withdrawn` | `enqueued`：一条 `step: null`、`role: user`、`origin: user_input` 的消息，`content` = 该 revision 的 `InputBlock[]`；`edited`：新消息，旧消息 `supersededBy` 指向它；`withdrawn`：旧消息 `supersededBy` 指向撤回事实 | 只进历史投影；模型请求投影不取未取批消息（评审 B4） |
| `queue.items.taken{items, run}` | 每个 item 把已派生的用户消息 `step` 指向消费它的 Step（`ordinal` 按 items 顺序） | 内容本体在队列项，消息只引用；`literal` 输入不解析命令 |
| MC attempt 结算事实（MC 提供者设计待写，见 [cordis.md](cordis.md#能力侧)；要求携带 `purpose`（[RD-07](../../../spec/capabilities/run-driver/v2/contract.md)：`reply \| title \| compression \| auxiliary`）、装配后的 `ContentBlock[]`、`actualModel`、usage、紧凑流记录与缺失块清单） | `purpose = reply`：`role: assistant`、`origin: model_attempt`，`settlement` 记状态与缺失块；其余 `purpose` 不派生助手消息（压缩的摘要消息由压缩事实派生，见下；标题等辅助输出归各自读面） | `partial / cancelled` 也派生消息：保留全部**完整且已耐久**的块（文本、推理、媒体、已校验的 `tool_call`），未完成的块进 `settlement.missing`（[delta-protocol.md §4](delta-protocol.md#4-失败中断与部分内容)，评审 B6）；`failed / unknown` 无内容不派生消息但保留 usage 与状态（DSH 同规则） |
| `tools.call.proposed{attempt, proposals[]}`（候选，[转移表](../tool-execution/lifecycle.md#转移表)） | 给该 attempt 的助手消息追加 / 确定 `tool_call` 块（通过校验的带 `call` 与 `action`，被拒的带 `raw` 与 `rejected{reason}`） | 助手消息的 `tool_call` 只来自这条事实，不来自流片段（§2） |
| `tools.call.settled{call, attempt, result}`（候选） | 一律派生一条 `role: user`（供应方无关角色，投影见 §5）、`origin: tool_settlement`，`content: [tool_result]` 的消息，位置 = 结算提交 | 客户端在结算时就看到结果，与该调用是否已占位、Run 是否还会开 Step 无关（评审 B5：归档后结算也有消息）；模型请求投影按 §5 决定它以 `tool_result` 还是经 reminder 进入 |
| `run.step.opened{cutpoint}` 且切点包含 `deferred_receipt` 或 `system_reminder` 输入（[RD-09](../../../spec/capabilities/run-driver/v2/contract.md)、工具提案候选） | `role: user`、`origin: system` 的占位消息；`role: user`、`origin: tool_settlement \| human_answer \| hook \| system` 的 `system_reminder` 消息，其 `content` 是对已派生结果消息的**引用**（`ref`），不复制正文 | 一个调用的最终结果在客户端视图里恰出现一次——结果消息；reminder 在历史投影里只显示"已于上方结果处呈现"（MS-11，对应工具提案 T-14）；同一 Step 输入里多条 reminder 排在新用户文本之前 |
| `hd.decision.recorded{request, decision}`（候选） | 不单独派生消息：问答型答复经 `human` 工具的 `tools.call.settled` 成为 `tool_result`；审批型决定是系统门事实，不进模型 | [U-44](../tool-execution/README.md#裁决记录2026-09-14用户) |
| `session.*`、`inbound.*`、`run.*`（其余）、`tools.control.*`、`tools.relation.*` | 不派生消息 | 结构事实；客户端以事实提示帧呈现状态（[envelope-and-cursor.md](envelope-and-cursor.md)） |
| 压缩摘要（[MC-10](../../../spec/capabilities/model-execution/v1/contract.md)） | 一条 `role: user`、`origin: system` 的摘要消息，`supersededBy` 反向写到被摘要的消息 | 原历史保持；模型视图从摘要起 |

派生是纯函数、按 `(domain, seq)` 单调折叠；projection 的缓存按 [SE-10](../../../spec/capabilities/session/v1/contract.md)
携带 stateKey、reducer 版本与水位，越界即重建。

## 5. 三种投影

三种投影的完整输入（评审 N4）：`Message[]` 之外还有目标模型族与有效能力（MC-11 交集）、
本次请求的固定切点（RD-06）、每个调用的当前状态（占位标注）、当前主体的读权（历史与
呈现投影逐次裁剪）。`delivery` 只表达投递意图；"模型实际收到了什么"由 MC attempt 记录的
实际送达模态给出（[PF-009.C4](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md#已确认要求)
的读面，MC 下一版）。

| 投影 | 消费者 | 规则 |
|---|---|---|
| 历史投影（用户可见） | 客户端历史、`history(session, range)` 读面（[Session 设计 §2.5](../../../packages/session/session/design.md#25-读面)） | 全部消息按提交顺序；`reasoning.encrypted` 只显示"有加密推理"；`system_reminder` 显示为系统行（默认折叠与否归 UI）；`deferred_receipt` 标注调用当前状态；被取代的消息标 `supersededBy`；每次读取按当前读权裁剪正文 |
| 模型请求投影 | MC-07 装配 | 只取已取批有效版本与明确切点；`tool_result` 按模型族投影为 Anthropic 的 user 消息 `tool_result` 块或 OpenAI 的 `role: tool` 消息；`system_reminder` 投影为 Anthropic 类的带系统提醒框架的 user message 或 OpenAI 类的 developer message；`reasoning` 按供应方族回传或省略；媒体按 MC-11 交集与 `delivery` 决定原生送达或句柄文本；`deferred_receipt` 满足供应方"每个 tool_use 配一个 tool_result"的成对格式，不伪造答案（CD-03） |
| 客户端实时呈现 | 出站流 | 与历史投影同一形状；正在生成的助手消息用 `model.attempt.*` 瞬态帧作草稿，收到 `ended{committed}` 后以派生消息替换（[delta-protocol.md §3](delta-protocol.md#3-瞬态与耐久的接头)）；推理只流出明文片段，供应方只给摘要时流出摘要，加密形态不流出（U-49） |

三种投影是同一 `Message` 的纯函数；单测义务见 [invariants.md](invariants.md#证据义务)。

## 6. 权威落点与消费者影响

| 内容 | 落点 | 受影响消费者 |
|---|---|---|
| `reasoning`、`system_reminder`、`tool_result.value` 形状、`Origin` | core-work CD 下一版（与工具闭环的 CD 改动同批，[工具提案缺口表](../tool-execution/lifecycle.md#契约措辞缺口表)） | MC-07 装配、tools 结果记录、HD 答复、hooks 上下文注入、projection |
| `Message` 派生规则（含 `(eventId, ordinal)` 身份、未取批输入、`purpose` 分流、`tool_call` 与结算消息）与 `supersededBy` | session 下一版（SE-03 的历史读面明确派生表） | projection 提供者设计、SE-03 消费者 |
| attempt 记录的 `purpose`、缺失块清单与实际送达模态 | model-execution 下一版（MC-06 的记录字段） | MC 提供者设计、PF-009.C4 读面 |
| `deferred_receipt` 的 `reason / notice`、`tool_call.validation` | core-work CD 下一版 | tools 结果记录、run-driver 切点 |
| 模型族投影规则 | model-execution 下一版或 MC 提供者设计 | OpenRouter adapter |
