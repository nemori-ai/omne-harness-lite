---
kind: research
id: R-client-message-stream
scope: DSH、OpenRouter、Codex、OpenCode、pi 与 omne-next 在消息模型、流式增量、事实与瞬态接头、客户端游标与重连、作用域投递上的来源核对与横向比较
---

# 客户端消息流：消息模型、增量协议与断线后的同一事实

[研究索引](../README.md) · [六系统循环研究](../agent-loop-events-and-hooks/README.md) · [出站流边界稿](../../proposals/outbound-stream/README.md) · [工具帧候选](../../proposals/tool-execution/frames.md)

本项目要让客户端只认一个消息模型，同时承载助手消息的流式增量、工具调用的帧与结果、用户消息与附件、人类请求卡片，并在断线后恢复到同一事实（[PF-013.C10](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求)、[PF-003.C2](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md#已确认要求)、[PF-009.C3/C4](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md#已确认要求)、[PF-022.C4](../../requirements/product/agent/PF-022-multimodal-response-and-output.md#已确认要求)）。[六系统研究](../agent-loop-events-and-hooks/README.md)已回答"循环怎么走、发生了什么、外部在哪插手"，但没有写客户端流这一层。本专题补这一层：各系统怎样表示消息与内容块，供应方 delta 长什么样，中途增量与已提交事实怎样接头，客户端靠什么游标重连，作用域在哪核对。

本文是研究证据：只说各系统在固定版本上做了什么、为什么，不批准本项目的设计选择。带「推断」的判断只从源码结构或跨系统比较得出；带「未覆盖」的是本轮没读到的部分。分系统逐条核对（含路径与行号）在 [notes/](notes/) 六份笔记里。

## 0. 结论先行

1. **权威内容一律来自结算或完成事件，中途增量不是事实。** DSH 的 `end` 帧携带已提交 `seq`；Codex 的 `item/completed` 带整项；OpenCode 的 `*.ended` 带整值且 `*.delta` 明确非耐久；pi 的 `message_end.message` 为权威。OpenRouter 只是供应方 delta，没有这一层。
2. **模型 chunk 的耐久形式只有 DSH 做成了无损紧凑记录嵌进结算事件**，历史翻页与实时展示由同一份记录重建；OpenCode、Codex 只存整值，token 级片段不落盘；pi 未核实。
3. **瞬态与耐久的接头只有 DSH 显式做了**：`end{committed{eventType, seq}}` 加进程内 `revision` 连续性，断裂即整体重基线。其余系统靠"完成项整体到达"隐式取代增量。
4. **游标各家不同**：DSH 一个 Session 一个 `seq`，投影 `asOfSeq` 与 follow `cursor` 同坐标；pi 用 append-only 条目 id 作 `since` 游标；OpenCode 的 SSE 不用 `id:` 字段、无游标；Codex 通知无游标，重连靠重读线程。
5. **重连都不是重放通知。** DSH 用打开快照整体替换窗口、按闭区间修复缺口、无游标通知从不推进游标；OpenCode 指数退避重开后重拉；Codex `thread/read`；pi 进程 stdout 无重连概念。
6. **五家都没有租户或多用户读权。** DSH 作用域到 Session 地址（含 subagent 地址校验），OpenCode 到 `directory`/`workspaceID`；投递前权限核对没有现成参照。
7. **工具中间材料的处理分三路**：Codex 按 item 发 `outputDelta`、不落盘；OpenCode `tool.progress` 是耐久的有界检查点（"不要持久化每个 stdout 块"）；pi `partialResult` 是累计快照、客户端整体替换。DSH 没有通用工具帧，工具事件家族由插件定义并按稳定业务 id 关联。
8. **OpenRouter 的 delta 不等于 DSH `StreamChunk`。** OpenAI 兼容协议没有块开始/结束标记，`block-start`/`block-end` 须由 adapter 合成；`reasoning_details` 的 `signature`/`encrypted`/`format` 要求原样回传，DSH `ReplayEnvelope` 正是这个槽位；`finish_reason: content_filter` 在 DSH 词表里无对应。
9. **事件形状演化各有机制**：OpenCode 按 `type@version` 合并耐久事件清单；DSH 用 `ignorable` 标记加 `SESSION_FORMAT_VERSION`；Codex 用分页 rollout 新格式。
10. **本项目 fork 覆盖了 `packages/llm` 的词汇、装配与紧凑记录和 loop 的 attempt 帧**，没有 fork Host→Web 的 `follow`/`page`/journal/mux 层（[dsh 笔记 §10](notes/dsh.md#10-本项目已-fork-的部分)）。

## 1. 证据基线

| 系统 | 来源与固定版本 | 阅读方式 | 笔记 |
|---|---|---|---|
| DeepSeek Harness | `deepseek-ai/deepseek-harness` 提交 `c291e79`（2026-09-10） | 读 `docs/subsystems/{llm-streaming,session,session-projection,session-query,conversation,web-client,web-server,attachment,spill}.md`、`docs/api-gateway.md`、`packages/llm/llm`、`packages/core/{agent,agent-loop}` 的流文件、`packages/api/session-controller` 及其 client、`packages/api/gateway`、`packages/client/connection` 的 README | [notes/dsh.md](notes/dsh.md) |
| OpenRouter | 官方文档 2026-09-15 抓取（streaming、api-reference overview 与 chat-completion、reasoning-tokens） | 文档；无版本号；未做真实请求 | [notes/openrouter.md](notes/openrouter.md) |
| OpenAI Codex | `openai/codex` 提交 `d77ebc7`（2026-09-14） | 读 `app-server-protocol` 的 `ServerNotification` 宏表、v2 `item/turn/thread` 结构、`thread_history_projection.rs`、`app-server/README.md` | [notes/codex.md](notes/codex.md) |
| OpenCode | `anomalyco/opencode` 提交 `228e909`（2026-09-14） | 读 SSE handler、TUI SDK 上下文、`packages/schema` 的 V2 事件定义、`packages/core` projector 头部 | [notes/opencode.md](notes/opencode.md) |
| pi | `badlogic/pi-mono` 提交 `ceea48f`（2026-09-14，0.85.1） | 读 `packages/ai` 事件类型、`packages/agent` 事件类型、`coding-agent/docs/rpc.md` 与 RPC 源码的 `get_entries` | [notes/pi.md](notes/pi.md) |
| omne-next / omne_harness | `/data/qiwei/repos/omne-next` 提交 `6263fed54` 及其工作树 | 由只读调研 subagent 读 state 子系统、事件框架标准、网关帧契约、runtime plane 的 tool progress 账本、系统通知框架 | [notes/omne-next.md](notes/omne-next.md) |

全部为静态阅读；未运行上游代码，未做断线、并发或故障实验。版本只是本次研究基线，不是依赖声明。上游克隆位于仓库 Git 忽略的临时目录，可按提交重建。

## 2. 先统一语言

| 词 | DSH | OpenRouter | Codex | OpenCode | pi |
|---|---|---|---|---|---|
| message | `Message{id, role, content[], source}` | `messages[]` 请求项 / `choices[].message` | `ThreadItem`（含 agentMessage、reasoning、commandExecution…） | `message` + `part` 表（投影） | `AgentMessage`（user / assistant / toolResult / bashExecution） |
| block | `ContentBlock`：text / reasoning / image / file / tool-call / tool-result | 无块概念；`content`、`reasoning`、`tool_calls[]` 并列字段 | item 种类 | `part` | `content[]` 元素，按 `contentIndex` |
| chunk / delta | `StreamChunk`（带 `index`、`block-start/end`） | `choices[].delta` | `item/*/delta` 通知 | `session.next.*.delta` 事件（非耐久） | `AssistantMessageEvent`（`*_start/_delta/_end`） |
| frame | `agent/assistant-stream` 进程内帧 `start/chunk/end`；线上 `SessionFollowFrame` | — | `ServerNotification` | SSE `{id, type, properties}` | stdout JSONL 事件 |
| event（事实） | `SessionEvent{type, seq, time, data}` | — | rollout 里的 `ItemCompleted` 记录 | `session.next.*` 耐久事件 `{aggregateID, seq, version}` | 会话文件条目（带稳定 id 的 append-only 树） |
| projection | `ProjectionDefinition` 纯 fold，`asOfSeq` | — | `thread_history_projection` | `SessionProjector` 折进表 | `get_state` / `get_messages` |
| cursor | `SessionSeq` / `SessionSeqCursor(-1)` | — | 无（`thread/read`） | 无（SSE `id:` 未用） | 条目 id（`since`） |

## 3. 横向比较

### 3.1 消息模型

| 维度 | DSH | Codex | OpenCode | pi |
|---|---|---|---|---|
| 角色 | system / user / assistant；工具结果是 **user 角色**消息携带 `tool-result` 块 | item 种类而非角色 | message + part | `toolResult` 是独立消息种类 |
| 推理 | `reasoning` 块，与可见文本区分 | `item/reasoning/*` 分 summary 与 text | `session.next.reasoning.*` | `thinking_*` 事件 |
| 媒体 | `image{attachment: ImageAttachmentRef}`（不透明 id、已验证元数据）、`file` 投影成句柄文本 | 未覆盖 | 未覆盖 | `Attachment` 类型（未展开） |
| 来源与出处 | `source.kind`（谁产生）与 `form`（是什么信息）两轴独立；助手消息记 `provider/model/replayState` | item 自带种类 | `provider{executed, metadata?}` 在 `tool.called` 上 | 未覆盖 |
| 工具调用参数 | 原始 JSON 字符串端到端 | `item/completed` 整项 | `tool.input.ended.text` 原文 + `tool.called.input` 对象 | `toolcall_end.toolCall` |

### 3.2 增量协议

| 维度 | DSH `StreamChunk` | OpenRouter delta | Codex 通知 | OpenCode V2 | pi |
|---|---|---|---|---|---|
| 块身份 | `index` | `tool_calls[].index`；文本/推理无索引 | `itemId` | `textID` / `callID` | `contentIndex` |
| 开始/结束标记 | `block-start`、`block-end{block}` | 无 | `item/started`、`item/completed` | `*.started`、`*.ended{整值}` | `*_start`、`*_end{content}` |
| 参数增量 | `tool-call-delta.argumentsDelta` | `function.arguments` 片段 | 未覆盖 | `tool.input.delta` | `toolcall_delta.delta` |
| usage 时机 | `usage` 在 `finish` 前 | 最终 chunk 总带 `usage` | `thread/tokenUsage/updated` | `step.ended`（推断） | 每个 `message_update` 带累计 `usage` |
| 中途错误 | `finish{error \| aborted, failure}` 或抛出 | 顶层 `error` + `finish_reason: 'error'`，HTTP 200 | `error` 通知 | `step.failed` | `error` 事件 |
| 权威内容 | `block-end.block` 与结算事件 | 无 | `item/completed.item` | `*.ended` 整值 | `message_end.message` |

### 3.3 事实与瞬态的接头

| 系统 | 接头 | 断裂时 |
|---|---|---|
| DSH | `end{committed{eventType, seq}}` 指向已提交事件；`revision` 单调；客户端用一条耐久事件原子取代该 attempt 的全部瞬态行 | `revision` 断裂 → 重开 follow 取新基线；无 `end` 的尝试在基线里以紧凑流重建 |
| Codex | `item/completed` 整项到达 | 未覆盖 |
| OpenCode | `*.ended` 整值是可重放边界；delta 非耐久 | 重拉投影 |
| pi | `message_end` 权威；工具进度累计替换 | 进程内无断裂 |

### 3.4 游标与重连

| 系统 | 游标 | 重连补齐 | 通知重放 |
|---|---|---|---|
| DSH | 单 `seq`；投影 `asOfSeq` 同坐标 | 打开快照整体替换窗口；`page()` 补更早历史与缺口；journal 拒绝缺口、倒序、部分重叠 | 否；有状态域各自基线/游标 |
| Codex | 无 | `thread/read` / `thread/resume` 重取 | 否 |
| OpenCode | 无（事件 id 在 data 内） | 退避重开后重拉 | 否 |
| pi | 条目 id `since` | `get_entries{since}` 严格之后的条目 | 不适用 |

### 3.5 作用域与投递

| 系统 | 流的粒度 | 过滤 | 缓冲与保活 |
|---|---|---|---|
| DSH | `follow` 每 Session 一条；`control` 全 Host 一条 | Session 地址校验（subagent 地址须匹配父与模式） | 每个 follower 一个无界 `Deque`；WebSocket Ping 2s；连接退避 500ms–10s |
| OpenCode | 每实例一条 `/event`，另有 `/global/event` | `directory` / `workspaceID` | 无界队列；心跳 10s；TUI 16ms 批处理 |
| Codex | 未覆盖 | 未覆盖 | 未覆盖 |
| pi | 进程 stdout | 无 | 无 |

### 3.6 工具中间材料

| 系统 | 形式 | 耐久 |
|---|---|---|
| DSH | 插件定义事件家族（start / progress / end），按稳定业务 id 关联；无通用帧 | 由插件决定，多为 Session 事件 |
| Codex | `item/commandExecution/outputDelta`、`item/fileChange/outputDelta`、`item/mcpToolCall/progress` | 否（rollout 只存完成项） |
| OpenCode | `session.next.tool.progress{structured, content}` | 是，要求有界检查点 |
| pi | `tool_execution_update.partialResult` 累计快照 | 未覆盖 |

## 4. 对本项目的观察

以下把事实对到本项目已接受的契约，标「推断」的是比较得出的判断，不是政策。

- **游标必须是集合，不是一个数。** 本项目一个 Session 有 `session(S)` / `queue(S)` / `inbound(S)` 三条流各带水位（[SE-16](../../../spec/capabilities/session/v1/contract.md)），工具帧还要作第四条流（[U-42](../../proposals/tool-execution/README.md#裁决记录2026-09-14用户)）；DSH 的"单 `seq` 即游标"不能直接搬（推断）。pi 的"append-only 条目 id 即游标"和 DSH 的"投影 `asOfSeq` 与 follow `cursor` 同坐标"都是单流前提。
- **提交后广播与 DSH `session/event` 同型。** `records.envelope.committed`（[LC-06](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）与 DSH `session/event` 都是进程内、提交后、fire-and-forget、观察者失败隔离；DSH 的 follower 在此之上自己缓冲并校验连续性，缺口直接抛错关流而不是修补。
- **瞬态接头的现成参照只有 DSH。** `end` 帧带已提交位置、`revision` 断裂整体重基线、无 `end` 的尝试以紧凑流重建——这三条是 [MC-06](../../../spec/capabilities/model-execution/v1/contract.md)"部分内容明确可见、迟到计量入原账"在客户端侧的对应物（推断）。本项目 fork 的 `AssistantStreamAttempt` 已带 `revision` 与 `outcome`，但 `attemptId` 不是租户级身份、settle 的同步回调不证明耐久确认（[fork 说明](../../proposals/core-capabilities/fork/loop-source.md)）。
- **占位与迟到结果没有先例。** 五家都没有"工具转后台给模型一条占位结果、迟到结果再进下一步"的机制；DSH 的 spill 是工具侧把大文本存成制品、模型按提示取回，不是系统级占位。工具提案的 `deferred_receipt` 与 `system_reminder`（[占位与迟到结果的投影](../../proposals/tool-execution/lifecycle.md#占位与迟到结果的投影)）要自己设计客户端呈现。
- **工具帧耐久有一个同向先例。** OpenCode 把 `tool.progress` 做成耐久的有界检查点并明说不持久化每个 stdout 块；这与 [TL-12](../../../spec/capabilities/tools/v1/contract.md)"frame limits 按条数、字节和保留期限配置，溢出有明确 gap"以及 U-42 的耐久帧方向一致；Codex 的不落盘和 pi 的累计替换是另外两种取舍。
- **媒体引用形状可对照。** DSH `ImageAttachmentRef` 的"不透明 id、已验证元数据、每次权威读重验"与 [CT-02/03/04](../../../spec/capabilities/media-content/v1/contract.md) 的引用、原件顺序、读取治理同向；本项目 fork 的媒体引用由 `media/content` 拥有，不是 core-work v1 的 `MediaRef`（[fork 说明](../../proposals/core-capabilities/fork/llm-source.md)）。
- **OpenRouter adapter 是本项目要写的一层。** `block-start`/`block-end` 合成、`reasoning_details` 回传、`content_filter` 的词表落点、流中途 `error` 到 `finish{error}` 的映射，都不在 DSH 现有 adapter 里（DSH 只有 DeepSeek 与 pi-ai 两个 adapter）；对应关系见 [openrouter 笔记 §5](notes/openrouter.md#5-与-dsh-streamchunk-的对应推断)。
- **事件形状演化要有机制。** 本项目事件带三段式名与去重键（[D-014](../../decisions/D-014-session-run-agent-lifecycles.md)）；OpenCode 的 `type@version` 清单与 DSH 的 `ignorable` 标记是两种可比较的做法，本轮不选。
- **omne-next 的对应观察**见 [notes/omne-next.md](notes/omne-next.md) 第 10 节；它按"沿用 / 改形 / 不要"逐项列旧设计的字段与规则，供提案做特性不丢不漏的核对。

## 5. 验证范围与局限

- 只做静态阅读与文档抓取；没有运行任何系统，没有观测真实断线、并发写入或崩溃恢复。
- OpenRouter 的 tool-calling 功能页两个候选 URL 都未取到流式内容，工具参数片段的批次粒度靠 chat-completion 参考页一句话（"sent as incremental string fragments"）。
- Codex 只读了协议定义与 README，未读 app-server 传输与客户端；OpenCode 未读 V2 runner 发布器与 SDK SSE 客户端；pi 未读 RPC 事件发射源码。
- DSH 的 `ui-conversation` 装配器只读文档；`assistant/live-chunk` 的客户端 `seq` 分配规则未核实到源码。

## 6. 来源

- DSH：`docs/subsystems/llm-streaming.md`、`session.md`、`session-projection.md`、`session-query.md`、`conversation.md`、`web-client.md`、`web-server.md`、`attachment.md`、`spill.md`、`docs/api-gateway.md`；`packages/llm/llm/src/*.ts`；`packages/core/agent/src/runtime-types.ts`；`packages/core/agent-loop/src/assistant-stream.ts`；`packages/api/session-controller/src/**`；`packages/api/gateway/README.md`；`packages/client/connection/README.md`（均 `@c291e79`）。
- OpenRouter：见 [notes/openrouter.md](notes/openrouter.md) 头部 URL 列表。
- Codex：`codex-rs/app-server-protocol/src/protocol/{common.rs, v2/item.rs, v2/turn.rs, v2/thread.rs, thread_history_projection.rs}`、`codex-rs/app-server/README.md`（`@d77ebc7`）。
- OpenCode：`packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts`、`packages/tui/src/context/sdk.tsx`、`packages/schema/src/{session-event,event,durable-event-manifest}.ts`、`packages/core/src/session/projector.ts`（`@228e909`）。
- pi：`packages/ai/src/types.ts`、`packages/agent/src/types.ts`、`packages/coding-agent/docs/rpc.md`、`packages/coding-agent/src/modes/rpc/{rpc-types,rpc-mode}.ts`（`@ceea48f`）。
- 本项目：[llm fork 说明](../../proposals/core-capabilities/fork/llm-source.md)、[loop fork 说明](../../proposals/core-capabilities/fork/loop-source.md)、[session projection 提供者设计](../../../packages/session/projection/design.md)。
