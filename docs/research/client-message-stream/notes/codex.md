<!-- 分系统核对笔记：OpenAI Codex 的客户端流层。2026-09-15 静态阅读固定提交产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# OpenAI Codex（`codex-rs`）：app-server v2 通知与线程历史

- 来源：`github.com/openai/codex`，固定提交 `d77ebc72237a639b6d877f2edc3b20b54631f25e`（2026-09-14），引用写作 `路径@d77ebc7`。循环、`EventMsg`、`Op` 与 hooks 见[六系统研究的 Codex 笔记](../../agent-loop-events-and-hooks/notes/codex.md)；本文只看 app-server 面向客户端的通知与历史读取。
- 读取：`codex-rs/app-server-protocol/src/protocol/common.rs@d77ebc7:1895-2010`（`ServerNotification` 线上名）、`protocol/v2/{item,turn,thread}.rs@d77ebc7`、`protocol/thread_history_projection.rs@d77ebc7`、`codex-rs/app-server/README.md@d77ebc7`。未读 app-server 传输层源码与客户端实现（未覆盖）。

## 1. 通知词表（`ServerNotification`）

`common.rs@d77ebc7:1905-1990` 宏表中与消息流相关的条目：

| 线上名 | 载荷 | 说明 |
|---|---|---|
| `thread/started`、`thread/status/changed`、`thread/queue/changed`、`thread/tokenUsage/updated`、`thread/compacted`、`thread/closed`… | 线程级整值 | 状态类通知 |
| `turn/started`、`turn/completed{threadId, turn: Turn}`、`turn/diff/updated`、`turn/plan/updated` | 轮级 | `turn/completed` 带完整 `Turn` |
| `item/started{item: ThreadItem, threadId, turnId, startedAtMs}` | 项开始 | `item.rs@d77ebc7:1322` |
| `item/agentMessage/delta{threadId, turnId, itemId, delta: string}` | 助手文本增量 | `item.rs@d77ebc7:1422`；没有块索引，只有 `itemId` |
| `item/reasoning/textDelta`、`item/reasoning/summaryTextDelta`、`item/reasoning/summaryPartAdded` | 推理增量 | 摘要与原文分两条 |
| `item/commandExecution/outputDelta`、`item/fileChange/outputDelta`、`item/fileChange/patchUpdated`、`item/mcpToolCall/progress`、`item/commandExecution/terminalInteraction` | 工具中间材料 | 按 item 关联 |
| `item/plan/delta` | 计划增量 | 源注释：EXPERIMENTAL，"Clients should not assume concatenated deltas match the completed plan item content" |
| `item/completed{item: ThreadItem, threadId, turnId, completedAtMs}` | 项完成 | `item.rs@d77ebc7:1400`；带完整 item |
| `rawResponseItem/completed`、`rawResponse/completed` | 供应方原始响应项 | 未展开 |
| `serverRequest/resolved` | 服务端发起请求（审批等）已解决 | 未展开 |
| `command/exec/outputDelta`、`process/outputDelta`、`process/exited` | 非 item 的进程输出 | 未展开 |

观察：增量通知一律以 `(threadId, turnId, itemId)` 关联，终态由 `item/completed` 携带整项；客户端不需要从增量拼出权威内容。

## 2. 耐久历史与恢复

- `thread_history_projection.rs@d77ebc7:1-30` 模块注释："Stateless projection from canonical paginated rollout records to thread-history changes"，"only for the new paginated rollout format that persists canonical `ItemCompleted(TurnItem)` records, not legacy event-only rollouts"；`project_rollout_line(line)` 逐行、按序号投影为 `ThreadHistoryChangeSet`（变化的 turn / item）。观察：耐久的是**完成的 item 快照**，增量 delta 不落盘。
- 历史读取：`thread/read`、`thread/list`（`common.rs@d77ebc7:761,847`）；`thread/resume` 返回 `ThreadResumeResponse{thread, model, model_provider, service_tier, disabled_plugin_ids, cwd, …}`（`thread.rs@d77ebc7:425`）。
- `thread/attachment/list` 用 `nextCursor` 分页（README@d77ebc7:191）；README 未描述通知流的游标或重放（未覆盖）。推断：断线客户端靠 `thread/read` / `thread/resume` 重取完整历史，进行中的增量不可补齐。
- `app-server/src/request_processors/mcp_event_stream.rs@d77ebc7:193-216` 的重连逻辑是服务端消费 MCP server 事件流的重试，不是客户端协议的一部分。

## 3. 与本线相关的观察

1. 一层身份三段（thread / turn / item），增量只带 `delta` 字符串，权威内容随 `item/completed` 整体到达。
2. 耐久与瞬态分家明确：rollout 只存完成项，增量不重放；历史是"完成项快照"的投影。
3. 未覆盖：客户端到 app-server 的传输（stdio JSON-RPC 或其它）、多客户端订阅同一线程、通知的去重身份。
