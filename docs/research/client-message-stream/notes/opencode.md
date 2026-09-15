<!-- 分系统核对笔记：OpenCode 的客户端流层。2026-09-15 静态阅读固定提交产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# OpenCode：SSE 事件流、V2 耐久事件与投影

- 来源：`github.com/anomalyco/opencode`（原 `sst/opencode`），固定提交 `228e909`（2026-09-14），引用写作 `路径@228e909`。循环、V1 事件清单与插件见[六系统研究的 OpenCode 笔记](../../agent-loop-events-and-hooks/notes/opencode.md)；本文只看 SSE 传输、V2 耐久事件与投影。
- 读取：`packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts@228e909`、`packages/tui/src/context/sdk.tsx@228e909:55-145`、`packages/schema/src/{session-event,event,durable-event-manifest}.ts@228e909`、`packages/core/src/session/projector.ts@228e909:1-40`。未读 V2 runner 的发布器与 SDK 的 SSE 客户端源码（未覆盖）。

## 1. SSE 传输（`GET /event`）

`handlers/event.ts@228e909`：

- 先注册监听器（"Listener registration is eager"）再启动响应体，避免丢事件；用无界队列缓冲。
- 每条 SSE：`event: message`、`id: undefined`、`data: JSON.stringify({id, type, properties})`。观察：SSE 自身的 `id:` 字段不用，事件 id 放在 data 里；因此没有 `Last-Event-ID` 语义。
- 按 `location.directory` 与 `workspaceID` 过滤；开场 `server.connected`，每 10 秒 `server.heartbeat`，收到 GlobalBus 的 `server.instance.disposed` 结束流；`Cache-Control: no-cache, no-transform`。
- `GET /global/event` 转发 GlobalBus 全部事件（含 `sync`）。

TUI（`sdk.tsx@228e909:55-145`）：事件 16ms 批处理再一次渲染；SSE 断开后指数退避（`retryDelay * 2^(attempt-1)` 封顶 `maxRetryDelay`）重开；`sseMaxRetryAttempts: 0` 关闭 SDK 内建重试。未见任何游标或"since"参数（在 handlers 与 SDK 目录 grep `since|cursor|Last-Event` 无结果）；推断：重连后依赖重新拉取会话数据，事件流本身不补齐。

## 2. V2 耐久事件 `session.next.*`

`packages/schema/src/session-event.ts@228e909`、`event.ts@228e909`：

- `Event.define({type, durable?: {aggregate: 'sessionID', version}, schema})`；耐久事件在实例上带 `durable: {aggregateID, seq, version}`（`event.ts@228e909:58`）；`durable(definitions)` 按 `type@version` 建清单，同型高版本覆盖低版本。
- 公共字段 `Base = {timestamp, sessionID}`；步与结算事件 `stepSettlementOptions` 用 `version: 2`。
- 流式片段的处理（源注释原文）："Stream fragments are live-only; Text.Ended is the replayable full-value boundary."（`session-event.ts@228e909:209`；推理与工具输入同款注释 247、291 行）：

| 事件 | 耐久 | 字段 |
|---|---|---|
| `session.next.text.started` | 是 | `assistantMessageID`、`textID` |
| `session.next.text.delta` | **否** | `assistantMessageID`、`textID`、`delta` |
| `session.next.text.ended` | 是 | `assistantMessageID`、`textID`、`text`（整值） |
| `session.next.reasoning.{started,delta,ended}` | 同上 | 同型 |
| `session.next.tool.input.{started,delta,ended}` | `delta` 否，其余是 | `ToolBase`（含 `callID` 等，未展开）+ `name` / `delta` / `text` |
| `session.next.tool.called` | 是 | `tool`、`input: Record`、`provider{executed, metadata?}` |
| `session.next.tool.progress` | 是 | `structured: Record`、`content: ToolContent[]`；注释："Replayable bounded running-tool state. Tools should checkpoint semantic transitions or at a bounded cadence, not persist every stdout/stderr chunk." |
| `session.next.tool.success` / `tool.failed` | 是 | 结果 |
| `session.next.step.{started,ended,failed}`、`prompted`、`prompt.admitted`、`context.updated`、`retried`、`compaction.{started,delta,…}`、`agent.switched`、`model.switched`、`moved`、`synthetic` | 多数是 | 见源码 |

- 投影：`packages/core/src/session/projector.ts@228e909` 把耐久事件折进 `session`/`message`/`part` 表（drizzle），`SessionAlreadyProjected` 保护重复投影；V1 `PartUpdated` 的 `step-finish` part 提供 usage。

## 3. 与本线相关的观察

1. OpenCode V2 把"事实"做成可重放的耐久事件流（同型聚合 + `seq` + 版本），但**明确把 token 级片段排除在耐久之外**，以 `*.ended` 的整值作为可重放边界；工具进度也要求有界检查点而不是每个 stdout 块。
2. SSE 层没有游标，事件 id 在 data 内；断线不补齐，靠重拉。
3. 耐久事件带 `version`，清单按 `type@version` 合并；这是他们处理事件形状演化的机制。
4. 未覆盖：V2 runner 的发布顺序保证、`ToolBase` 全字段、V1 `message.part.*` 事件在当前 schema 的落点。
