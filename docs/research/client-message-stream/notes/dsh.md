<!-- 分系统核对笔记：DeepSeek Harness 的客户端消息流层。2026-09-15 静态阅读固定提交产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# DeepSeek Harness（DSH）：消息模型、流式增量、Session 结算与 Web 链路

- 来源仓库：`github.com/deepseek-ai/deepseek-harness`，固定提交 `c291e7961a515f6d7af9304e7fd1d257929aef26`（2026-09-10）；克隆在仓库 Git 忽略的临时目录，可按提交重建。引用写作 `路径@c291e79`。
- 读取范围：`docs/subsystems/{llm-streaming,session,session-projection,session-query,conversation,web-client,web-server,attachment,spill}.md`、`docs/api-gateway.md`、`packages/llm/llm/src/{types,message,assembler,assistant-stream}.ts`、`packages/core/agent/src/runtime-types.ts`、`packages/core/agent-loop/src/assistant-stream.ts`、`packages/api/session-controller/src/{history,assistant-stream,control,types}.ts` 及其 `client/` 目录、`packages/api/gateway/README.md`、`packages/client/connection/README.md`。循环层已由[六系统研究的 DSH 笔记](../../agent-loop-events-and-hooks/notes/dsh.md)覆盖，本文只写消息与流。
- 未运行任何上游代码；未读 `packages/client/ui-conversation` 的装配器源码（只读其文档）。

## 1. 消息与内容块（`packages/llm`）

`docs/subsystems/llm-streaming.md@c291e79` §Content blocks and messages；源码 `packages/llm/llm/src/types.ts@c291e79`、`message.ts@c291e79`。

| 类型 | 字段 | 说明 |
|---|---|---|
| `Message` | `id: MessageId`、`role: 'system' \| 'user' \| 'assistant'`、`content: ContentBlock[]`、`source: MessageSource` | 一份不可变表示，投递、耐久历史、模型请求共用 |
| `ContentBlockMap` | `text{text}`、`reasoning{text}`、`image{attachment: ImageAttachmentRef}`、`file{attachment: FileAttachmentRef}`、`tool-call{id, name, arguments: string}`、`tool-result{toolCallId, content: ContentBlock[], isError?}` | 合并可扩展；新块必须同时带 adapter、UI、compaction、耐久回放支持。`arguments` 端到端保持原始 JSON 字符串；`file` 从不原生到达供应方，请求装配投影为句柄文本 |
| `MessageSourceMap` | `user`、`plugin{plugin} & ContextFormed`、`model: ModelMessageSource`、`tool: ToolMessageSource` | `kind` 回答"谁产生"，可选 `form` 回答"是什么信息" |
| `ContextForm` | `instructions \| catalog \| snapshot{sections} \| notice{summary} \| relay \| recall` | 语义词表而非视觉词表；未知值按默认作不透明内容呈现 |
| `AssistantProvenance` | `provider`、`model`、`replayState?` | 助手消息记录产出路由；`replayState` 只在同一 adapter 实例同时拥有历史与目标路由时回传 |

观察：工具结果在派生历史里是 **user 角色**消息携带一个 `tool-result` 块（`session.md@c291e79` §Derived history）。

## 2. `StreamChunk` 原始协议与 adapter 契约

`types.ts@c291e79`（`llm-streaming.md@c291e79` §StreamChunk）：

```ts
type StreamChunk =
  | { type: 'block-start'; index; blockType }
  | { type: 'text-delta'; index; text }
  | { type: 'reasoning-delta'; index; text }
  | { type: 'tool-call-delta'; index; id; name?; argumentsDelta }
  | { type: 'block-end'; index; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: FinishReason; replayState?: ReplayEnvelope }
```

- 封闭联合；`index` 关联交错的块，`block-end` 携带装配完的整块。
- `FinishReasonMap`：`stop | tool-calls | max-tokens | aborted{failure} | error{failure}`；`LlmFailure{message, code, status?, providerRetryAfterMs?, requestId?}`。
- `TokenUsage{inputTokens, outputTokens, totalTokens?, cacheReadTokens?, cacheWriteTokens?, reasoningTokens?}`，各项互斥不重复计。
- `ReplayEnvelope{response: unknown, blocks?: unknown[]}`：adapter 私有回放元数据，`blocks` 与发出的块序按位对齐，装配丢块时同位删除，长度不符则整份丢弃。
- adapter 契约（`llm-streaming.md@c291e79` §The adapter contract）：`usage` 在 `finish` 之前、之后无任何 chunk；失败要么 `stream()` 抛出要么以 `finish{error|aborted}` 结束，同一 `LlmFailure` 类型；一次 adapter 调用 = 一次供应方 attempt（库级重试关闭）；空补全是可重试错误 `EMPTY_RESPONSE`；上下文溢出统一码 `CONTEXT_WINDOW_EXCEEDED`；流空闲看门狗默认 5 分钟；`LlmRuntime.stream()` 把 adapter 抛错归一为终止 `error`/`aborted` finish。

## 3. 装配与紧凑记录

- `BlockAssembler`（`assembler.ts@c291e79`）：`push(chunk)`、`blocks()`、`interruptedBlocks()`（只保留非空白文本/推理，不伪造工具结果）、`usage`、`finish`、`replayState`、`message(source)`。容忍无 start/end 的纯 delta 协议；`block-end` 之后的迟到 delta 被忽略；`max-tokens` 丢弃全部工具调用并同位裁剪 replay 条目，`blocks()` 与 `replayState` 不会不一致。
- `AssistantStreamAccumulator`（`assistant-stream.ts@c291e79`）：把带时间戳的 chunk 折成 `AssistantStreamRecord[]`：`text-chunks | reasoning-chunks {time0, index, dt[], texts[]}`、`tool-call-chunks {time0, index, dt[], id, name?, args[]}`、其余 `chunk{time, chunk}`。`snapshot()` 返回分离冻结副本；`expandAssistantStream()` 是耐久边界的验证入口，精确恢复原 delta 边界与时间；记录级只读 helper（首 token 时间、可见内容、拼接文本等）一遍扫描、可早退。
- Session 日志把这份紧凑流嵌进 `assistant/message`（有 surface 消息）或 `assistant/attempt {turn, step, stream}`（无 surface 消息的尝试）（`session.md@c291e79` §Durability contract）。

## 4. Session 日志、surface 与派生历史

`session.md@c291e79` §`SessionEvent<T>`、§Surface types、§Derived history、§Durability contract。

- 事件信封：`{type, seq: SessionSeq, time, data, ignorable?: true} & (surface 事件 ? {surfaceOp, sourceEventSeqs?} : {})`。`seq = log.length`，单调、连续；`ignorable` 缺省即"必需"，读者遇到不认识的必需事件必须拒绝重建而不是静默丢弃。
- Surface 事件恰四种：`system/message`、`user/message`、`assistant/message`、`tool/result`；`surfaceOp = 'append' | {op: 'replace', startSeq, endSeq}`，replace 用于 compaction 等按位替换，被遮蔽范围须列入 `sourceEventSeqs`；`assistant/message` 不能带 `sourceEventSeqs`，其 `stream` 拥有精确供应方证据。
- `deriveMessages()`：`user/message` → user 消息；`assistant/message` → 带 provider/model/replayState 的助手消息，空内容的助手消息跳过；`tool/result` → user 角色 `tool-result` 块；注入上下文（非 `user` 来源的 `user/message`）按时间位置原样进入；`turn/*`、`step/*`、`assistant/attempt`、`llm/retry` 是结构事件，不投影成消息。
- 耐久契约：每个事件无损持久；每次助手尝试恰是一条 `assistant/message` 或 `assistant/attempt`；`seq` 跨结算与交错事件连续；JSONL 一行一事件；`Session.append` 在源头拒绝不可序列化数据。
- 事件通知：`session/event` 是提交后 fire-and-forget 的 emit（监听器快照在 push 前解析、回调在 push 后运行，观察者失败被隔离）；`session/flush` 是 awaited parallel 的耐久检查点；两者都按 `dsh-scope` 作用域过滤。

## 5. 进程内助手帧 `agent/assistant-stream`

`packages/core/agent/src/runtime-types.ts@c291e79:128-160`、`packages/core/agent-loop/src/assistant-stream.ts@c291e79:47-110`：

| 帧 | 字段 |
|---|---|
| `start` | `attemptId`、`revision`、`turn`、`step` |
| `chunk` | `attemptId`、`revision`、`index`（attempt 内稠密零起）、`time`（与耐久嵌入流复用的安全整数时间戳）、`chunk` |
| `end` | `attemptId`、`revision`、`index`（已发 chunk 数）、`outcome: {kind: 'committed', eventType: 'assistant/message' \| 'assistant/attempt', seq} \| {kind: 'abandoned'}` |

- `attemptId = LlmAttemptId(`${sessionId}:${attempt}`)`，只在附着的 Agent 生命周期内唯一；`revision` 在一次附着生命周期内单调，替换后从 1 重新开始。
- `settle(eventType, append)`：同步调用 `append()` 拿到已提交 `seq` 后才发 `committed` 的 `end`；`append` 抛错则发 `abandoned` 再抛。观察：这是"瞬态帧指向已提交事实位置"的接头，但 `append` 同步返回不证明磁盘已 fsync（本项目 fork 说明 `docs/proposals/core-capabilities/fork/loop-source.md` 已记）。

## 6. 投影（`session-projection`）

`docs/subsystems/session-projection.md@c291e79`：

- `ProjectionDefinition{key, stateSchema, init(header, inheritedEventCount), apply(state, event), wire?{viewSchema, view(state)}, stateVersion}`：纯同步 fold；不关心的事件必须返回同一引用；`state` 必须是纯 JSON。
- "整值事件规则"：携带状态的日志事件带完整后置状态，不带裸增量。
- `ProjectionSnapshot{asOfSeq: SessionSeqCursor, values}`：同步一致读切；变更推送 `onChanged(session, key, value, seq)` 只在 `view` 结果按 `Object.is` 变化时触发。
- 缓存：`(sessionId, key, ver, seq, val)` 行；强制检查点在 Session 创建、`turn/end`、Session 销毁；`restoreFloor` 取最低可用水位再减一作锚，空尾读即能发现日志被截短（crash repair）而拒绝陈旧行。

## 7. Host → Web：`follow` / `page` / `control`

`packages/api/session-controller/src/history.ts@c291e79`、`types.ts@c291e79:395-530`、`control.ts@c291e79`、`assistant-stream.ts@c291e79`。

| 操作 | 请求 | 输出 |
|---|---|---|
| `follow` | `{address, maxMessages?, assistantStream?: true}` | 首帧 `snapshot{header, cursor, records, hasMore, projections{asOfSeq, values}, assistantStream?}`；之后 `{type: 'event', event: SessionWireEvent}`（严格连续：`seq < 期望` 丢弃、`seq ≠ 期望` 抛 `gateway/internal`）与可选 `{type: 'assistant-stream', frame}` |
| `page` | `{address, throughSeq, beforeSeq?, maxMessages?}` | 向后一页 `{records, hasMore}`，按消息对齐（`user/message`、`assistant/message` 的 append surface 事件计数，`sourceEventSeqs` 把一组事件当整体切） |
| `control` | 无 | Host 级 `baseline{queues, jobs, projections…}` 之后 `projection{sessionId, key, value, seq}`、`queue{sessionId, items}`、`jobs{sessionId, jobs}` 替换帧 |

- `SessionWireEvent{type, seq, time, data, ignorable?, sourceEventSeqs?, surfaceOp?}`，未知 ignorable 事件的 surface 字段作不透明 JSON。
- 助手基线：Host 端 `SessionAssistantStreamAccumulator` 按 `revision` 折叠 `agent/assistant-stream` 帧，`snapshot()` 给出 `{revision, activeAttempt?{attemptId, startedAfterSeq, turn, step, nextIndex, stream}}`；`follow` 打开时把基线与 `cursor` 在同一同步切取出，切之前的帧由基线代表、之后的帧逐个下发；线上 `start` 帧多一个 `startedAfterSeq`。`revision` 不连续时 Host 累加器丢弃活动尝试。
- 观察：Web 的 `follow` 每 Session 一条流；`control` 全 Host 一条流；投影变化既进 `control`（Host 级）也可从 `follow` 首帧拿到基线。

## 8. 客户端：窗口、瞬态行、重连

`packages/api/session-controller/src/client/contract/events.ts@c291e79`、`client/sessions/{assistant-stream,session}.ts@c291e79`、`packages/api/gateway/README.md@c291e79`、`packages/client/connection/README.md@c291e79`、`docs/subsystems/{web-client,conversation}.md@c291e79`。

- 客户端窗口条目 `SessionEventLikeEntry = {type: 'event', event} | {type: 'transient', event: AssistantLiveChunkEvent}`；`assistant/live-chunk{seq, time, data{attemptId, turn, step, chunk}}` 是纯客户端行，`seq` 把它排在耐久 seq 之间。
- `ClientAssistantStream` 的决定：`publish`（耐久事件）、`settlement`（一条 `assistant/message | assistant/attempt` 原子取代该 attempt 的全部瞬态行）、`abandonment`、`transient`（追加 live chunk）、`rebaseline`（`revision` 断裂 → `events.restart()` 重开 follow）。
- 每个物理代次用 `snapshot` **整体替换**窗口，再按 `seq` 追加；`page()` 只用于更早历史与缺口修复；耐久缺口修复页没有助手基线，会清掉瞬态尝试并让一次通知重开 follow 以取得原子的 页/基线 对。
- `RemoteJournalStream`：follow 先于 page 打开、分页、重连追赶、按域定义的闭区间做缺口修复；去掉完整重复，拒绝缺口、倒序区间与部分重叠；无游标通知从不推进或修复耐久游标，缺口修复期间收到的通知在替换页提交后才发布，代次被更新代次取代时连同其页一起丢弃。
- 连接：`/api` 一元调用；`/api/remote.mux` WebSocket 承载可独立取消的逻辑流，Host 每 2 秒 Ping；内部 `$events` 逻辑流是"连接代次"的唯一来源，先收 `{type: 'ready', clientId, host}` 才发布代次，之后各控制器才开始基线读；重试 50%–100% 抖动，上限 500ms/1s/2s/4s/8s/10s；普通转发通知不重放，有状态域各自靠基线、游标或显式查询恢复。
- Web 未用 SSE：`webserver` 允许路由持有响应（SSE 可行），但 GUI 链路是 WebSocket 复用（`web-server.md@c291e79`、`gateway/README.md@c291e79:35`）。
- 会话装配器（`conversation.md@c291e79`）：每个 Node 家族按稳定业务 id 关联，客户端绝不把更新分配给"最近未完成的" Context；只含更新、缺 start 的 Context 保持 pending 直到翻页补到 start；增量事件若要在 start 未加载时渲染，终态或检查点事件必须自带完整回退状态；发布节奏 `immediate | animation-frame | none`。

## 9. 附件与转储

- `ImageAttachmentRef{attachmentId, mediaType, bytes, width, height, name?, originalDimensions?}`：`attachmentId` 不透明、不是路径或 URL；权威读每次重验摘要、媒体签名、尺寸（`attachment.md@c291e79` §Identity）。
- `SpillRef{locator, bytes, retrievalHint}`：工具把大文本结果存为转储制品，`locator` 是模型可见的不透明句柄，消费者用 `retrievalHint` 呈现取回方式（`spill.md@c291e79`）。观察：转储由工具侧决定，模型按提示自行取回，不是系统级"结果已转储"占位。

## 10. 本项目已 fork 的部分

依据 `docs/proposals/core-capabilities/fork/{llm-source,loop-source}.md`、`packages/model/llm/README.md`、`packages/agent/loop/README.md`、`packages/session/session/src/types.ts`：

| 上游 | 本项目 | 现状 |
|---|---|---|
| `packages/llm/llm/src/{message,types,assembler,assistant-stream,call-config,error,attribution,brand}.ts` | `packages/model/llm/src/`（`@omne-harness-lite/llm/baseline`） | 词汇与算法保留；媒体引用改由 `media/content` 拥有，不是 core-work v1 `MediaRef` |
| `runtime-types.ts` 的 `AssistantStreamFrame`、`agent-loop/assistant-stream.ts`、`runtime-context.ts` | `packages/agent/loop/src/{frame,assistant-stream,runtime-context}.ts` | `attemptId` 仍是"Session 名 + 本地计数"，不是 D-008 的租户级 attempt 身份；settle 的同步回调不证明耐久确认 |
| `SessionEventMap` 中 `assistant/message` / `assistant/attempt` 嵌 `AssistantStreamRecord[]`、`SessionSeq`、`SessionSeqCursor` | `packages/session/session/src/types.ts` baseline | 类型基线，目标服务未实现 |
| session-projection 注册/fold | `packages/session/projection/`（设计见其 design.md） | 已改为本项目 SE-10 状态贡献模型，缓存降级为可选加速 |
| `api/session-controller` 的 `follow`/`page`/`control`、客户端 journal、`connection`/`gateway`/mux、`ui-conversation` | 未 fork | — |

## 11. 对本线相关的观察

1. DSH 一个 Session 一条日志一个 `seq`，Web 的耐久游标就是这个 `seq`；投影 `asOfSeq` 与 follow `cursor` 是同一坐标系。
2. 瞬态与耐久的接头只有一处：`end{committed{eventType, seq}}`，客户端据此把整段瞬态行原子替换成一条耐久事件；没有 `end` 的尝试在重连基线里以紧凑流形式重建。
3. `revision` 是进程内连续性证据：断裂即整体重基线，不做局部修补。
4. 模型 chunk 的耐久形式是嵌在结算事件里的紧凑记录，不是独立 token 行；历史翻页与实时展示由同一份记录重建。
5. 投影是"框架驱动、域计算"的纯 fold，客户端只收整值；变更推送与耐久事件同源（`session/event`）。
6. 重连是"替换窗口 + 按区间修复"，不是重放通知；通知本身不承诺重放。
7. 推断：DSH 没有租户与多用户读权概念，`follow` 的作用域只到 Session 地址（含 subagent 地址校验）；投递前权限核对在本项目须另加。
