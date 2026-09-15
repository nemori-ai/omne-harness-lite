<!-- 分系统核对笔记：pi 的客户端流层。2026-09-15 静态阅读固定提交产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# pi：`AssistantMessageEvent`、RPC 事件流与条目游标

- 来源：`badlogic/pi-mono`（已迁至 `earendil-works/pi`），固定提交 `ceea48f`（2026-09-14，三包 0.85.1），引用写作 `路径@ceea48f`。循环、`AgentEvent`、扩展见[六系统研究的 pi 笔记](../../agent-loop-events-and-hooks/notes/pi.md)；本文只看模型流事件与 RPC 模式的客户端协议。
- 读取：`packages/ai/src/types.ts@ceea48f:525-570`、`packages/agent/src/types.ts@ceea48f:427-446`、`packages/coding-agent/docs/rpc.md@ceea48f`（§Protocol Overview、§State、§Session、§Events）、`packages/coding-agent/src/modes/rpc/{rpc-types,rpc-mode}.ts@ceea48f`（`get_entries`）。未读 RPC 模式的事件发射源码（未覆盖）。

## 1. 模型流事件（进程内）

`packages/ai/src/types.ts@ceea48f:531-560`：

```ts
type AssistantMessageEvent =
  | { type: 'start'; partial }
  | { type: 'text_start' | 'text_delta' | 'text_end'; contentIndex; delta? | content?; partial }
  | { type: 'thinking_start' | 'thinking_delta' | 'thinking_end'; contentIndex; …; partial }
  | { type: 'toolcall_start' | 'toolcall_delta' | 'toolcall_end'; contentIndex; delta? | toolCall?; partial }
  | { type: 'done'; reason: 'stop' | 'length' | 'toolUse' | 'deferred'; message }
  | { type: 'error'; … }
```

- 注释：`start` 先于任何更新，`done` 结束；`partial` 是"到目前为止的响应"共享帮助对象，不是事件时刻快照；文本/思考块在 `*_start` 时为空、只经 `*_delta` 增长、`*_end` 权威；被编辑的思考可在 start 时已完整且无 delta；`toolcall_start` 的参数按供应方而异，`toolcall_delta` 携带后续 JSON 片段。
- `AgentEvent`（`packages/agent/src/types.ts@ceea48f:433-446`）：`agent_start`、`agent_end{messages}`、`message_start{message}`、`message_update{message, assistantMessageEvent}`、`message_end`、`tool_execution_start{toolCallId, toolName, args}`、`tool_execution_update{…, partialResult}`、`tool_execution_end`。

## 2. RPC 模式（`pi --mode rpc`）

`rpc.md@ceea48f`：

- 传输：stdin 命令、stdout 事件，严格 JSONL，`\n` 为唯一分隔符（Node `readline` 不合规，因它也按 U+2028/2029 切分）；命令可带 `id` 关联响应。
- `message_update{usage, assistantMessageEvent}`：**故意省略**累计 `message` 与 `partial`（文档："intentionally omits the former cumulative `message` field and `assistantMessageEvent.partial`"）；客户端用 `message_start` 加后续事件按 `contentIndex` 自行组装，`message_end.message` 为权威；`usage` 是最新累计值，供应方不报中途 usage 时可能到结束前都是零。
- `tool_execution_update.partialResult`：**累计**结果而非增量（"contains the accumulated output so far (not just the delta), allowing clients to simply replace their display on each update"）；`bash_execution_update{id, delta}` 则是增量。
- 状态基线：`get_state`（模型、`isStreaming`、`isCompacting`、队列模式、`sessionFile`、`sessionId`、`messageCount`、`pendingMessageCount`）、`get_messages`（当前 `AgentMessage[]`）。
- 耐久游标：`get_entries{since?}`（`rpc.md@ceea48f:719`）：会话文件是"带稳定 id 的 append-only 条目树"，"an entry id works as a durable cursor: pass the last entry id you have seen as `since` to get only entries strictly after it, even across client restarts"；含压缩前历史与被放弃的分支；返回 `entries[]` 与 `leafId`。实现 `rpc-mode.ts@ceea48f:638-643` 按 `findIndex(e => e.id === since)` 切片。

## 3. 与本线相关的观察

1. 事件流是进程 stdout，没有"重连"概念；跨重启的补齐靠 `get_entries{since}` 的条目 id 游标，条目是耐久事实。
2. 增量协议把"权威内容"放在 `*_end` / `message_end`，中途事件只有 delta；工具进度用累计快照替换显示。
3. 推断：一个 RPC 进程一个客户端，无多客户端与作用域问题。
4. 未覆盖：事件是否在会话文件里持久（`message_update` 应该不持久，未核实）、`deferred` 停止原因的用法。
