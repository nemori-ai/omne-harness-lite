# 2026-07-28 协议核对（W2 开波前检查项）

只读子代理 2026-11-03 对照 `schema/2026-07-28/schema.ts`（核心，`LATEST_PROTOCOL_VERSION = "2026-07-28"`，3197 行）与任务扩展 `io.modelcontextprotocol/tasks`（SEP-2663，`ext-tasks/specification/2026-07-28/tasks`）逐项核对 `mcp-contract` SPEC 与源码。完整对照表 38 行在子代理交回（会话记录），本页只留结论与处置。

## 这一修订的关键事实

- 无状态：没有 `initialize` 握手，没有 `Mcp-Session-Id`。每个请求的 `_meta` 带 `io.modelcontextprotocol/protocolVersion` 与 `clientCapabilities`（`clientInfo` 是 SHOULD）。
- 服务端必须实现 `server/discover`，应答是 `supportedVersions[]`、`capabilities`、`instructions?`、`_meta.serverInfo`、`ttlMs`、`cacheScope`。
- 服务端发起的请求被 MRTR 取代：返回 `InputRequiredResult`，客户端带 `inputResponses` 重试（新的 JSON-RPC id）。
- 任务移出核心成为扩展：`tasks/result`、`tasks/list`、`related-task` 键都没有了；`tasks/get` 轮询；取消是协作式的。客户端必须逐请求声明 `extensions["io.modelcontextprotocol/tasks"]`，否则服务端不返回任务、`tasks/*` 答 `-32021`。
- Streamable HTTP：头 `MCP-Protocol-Version`、`Mcp-Method`、`Mcp-Name`、`Mcp-Param-*`；取消就是关闭应答流；应答流断开时客户端 MUST 用新 id 重发（changelog 第 9 项）。
- stdio：旧对端探测规则是「任何非现代错误或超时 → 旧对端 → `initialize`」，不能钉在某一个错误码上；HTTP 看 400 的正文。

## 一致的项（不动）

分页 cursor、`Tool` 字段与 `execution` 不读、`resultType` 缺省按 `complete`、`CallToolResult`、输出校验、五种内容块与 D2–D5、`InputRequiredResult` 至少一项、任务状态五值、`tasks/get`/`update`/`cancel` 的对应、`-32602` → `expired`、`failed` 与 `isError` 的区分、`instructions` 截断、JSON-RPC 错误对象、401/403 → `authorization-required`、stdio 的 `notifications/cancelled`。

## 影响 W2（w2-mcp-core）的项与处置

| # | 项 | 处置 |
| --- | --- | --- |
| 13 | `serverInfo` 现在在每个 result 的 `_meta` 里，可能缺席；`PeerIdentity.serverInfo` 是必填 | **prep2 改为可选**（可加）。核心服务不读它，只经 `peer` 原样交出 |
| 1 | `PeerIdentity.protocolVersion` 是单个版本，而对端返回 `supportedVersions[]` | 契约保持「传输选定的版本」：选版规则归传输（W3）。`discover-shape` 含「没有共同版本」。W2 的替身直接给选定版本 |
| 14 | `ListingPage.ttlMs` 可选、无 `cacheScope` | 不动：旧对端没有这两项；清单键已含对端账号 |

## 落到 W3 的契约可加调整（写进 `w3-mcp-host`、`w3-mcp-call` 规格）

| # | 项 | 决定方向 |
| --- | --- | --- |
| 2 | 旧对端探测规则缺失，且与 S5/S7「`discover` 的 `error-answer` → `lost(discover-failed)`」部分冲突 | 回退在传输内完成：`discover` 只在现代与旧两条路都失败时才答 `error-answer`。T3 补探测规则（stdio：非现代错误或超时；HTTP：400 正文） |
| 3、4 | 每请求 `_meta`（版本、能力、`clientInfo`）；任务扩展与 `elicitation.form/url` 须逐请求声明 | T3 改为规则：传输在每个请求上声明；任务扩展固定声明 |
| 5 | HTTP 头；HTTP 上 `x-mcp-header` 非法的工具逐个剔除，与 C1「一项非法整份拒绝」冲突 | 传输在交页之前剔除并以 `PeerNotification` 报告；C1 不变 |
| 6 | HTTP 取消是关闭应答流，不是通知 | T5 按传输分写 |
| 7 | HTTP 应答流断开时规范 MUST 重发；O6/R7 答 `unknown` 不重发 | **有意偏离**：`tools/call` 不是幂等的，效果未知时不代调用方重发；由调用方决定。写进 SPEC「偏离」并给理由 |
| 8 | 授权发现要先试 `/.well-known/oauth-protected-resource/<path>` 再试根；`insufficient_scope` 403 与 `Origin` 403 要分开 | R4 补两项 |
| 9 | 任务的 `pollIntervalMs`、`ttlMs`、`statusMessage` 丢弃；`-32021` 未覆盖 | `TaskReport` 与 `task` 结局加可选字段；`-32021` 原样 `error-answer`（客户端缺陷） |
| 10 | `list_changed` 只经 `subscriptions/listen` 到达，端口没有订阅 | W4 或 M2 后；`changedNotified` 保持为假并在 SPEC 写明 |
| 11 | 进度要 `progressToken`，日志要 `_meta.logLevel`（已弃用） | 传输在 `call` 上带 `progressToken`；日志不开 |
| 12 | `continuation.inputResponses` 必填，但只带 `requestState` 的重试不需要；`args` 未限定为对象 | 改为可选；`args` 守卫限定对象 |
| 措辞 | S7 的「协商」「会话」只对旧对端成立；空串 `requestState` 合法但 V1 判 malformed；`inputSchema` 不核 `type:"object"`；stdio 关闭次序 | W3 写回 SPEC 措辞 |
