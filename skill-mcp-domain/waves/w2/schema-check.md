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

## w2-spike 结论（2026-11-03，官方 SDK 2.3.1，实测脚本在 `waves/w2/spike/`）

**W3 决定：`mcp-host-local` 只用 SDK 的 `Transport` 层，自己发 JSON-RPC。**stdio 用自写的 `StreamTransport` 跑在 `ProcessHandle` 的流上（`StdioClientTransport` 自己 spawn、auto 模式多起一个探测进程、`close()` 会 kill 进程，违反 T5 并绕过 `ProcessLanding`）；HTTP 用 `StreamableHTTPClientTransport` 加 `fetch` 钩子（在钩子里 `credential.authorize(headers)`、读 `WWW-Authenticate`、调 `reportRejection()`；不传 `authProvider`）。`Client` 高层 API 只在测试里做对照客户端。

理由（实测）：`Client` 拿不到请求 id、原始应答（`resultType` 被剥、`task` 结果直接抛 `UNSUPPORTED_RESULT_TYPE`、整页 schema 失败丢原文）、`WWW-Authenticate`、no-answer 原因；它还会本地校验 outputSchema 并以 `-32602` 抛出、遇 `-32020` 自动重发一次、默认 60 s 自动取消、`input_required` 默认自动完成——每一种都改变对端效果或结局分类。

自己要写的协议条文（体量小，进契约测试）：`server/discover` → `-32601`/legacy 信号/stdio 超时时回退 `initialize` + `notifications/initialized`；`-32022` 续接；每请求 `_meta` 三个键（SDK 导出常量 `PROTOCOL_VERSION_META_KEY`、`CLIENT_CAPABILITIES_META_KEY`、`SERVER_INFO_META_KEY`）；HTTP 的 `Mcp-Method`/`Mcp-Name`；HTTP 取消 = 中止该请求的流（每请求一个 `AbortController`）；stdio 取消 = `notifications/cancelled` 带信封；stdio 帧按行切但**不用** SDK `ReadBuffer`（它静默丢非 JSON 行，与 T7 不符）；legacy 修订下服务端发来的请求一律拒绝。

其他事实：`serveStdio` 在 discover 之后的第一个真实请求上钉定修订，不带信封就钉成 2025；SDK 服务端没有任务 API（只能手写 `resultType:'task'` 且须带 `content: []`），所以 W3 的真实服务端夹具要自写 `tasks/*` 处理器，任务形状按 SEP-2663 原文核实后定（spike 未核）；`McpServer` 不分页，多页测试要自写夹具。

未跑通、留 W3 夹具验证：input_required 任务的流转；T7 各种读不懂应答；403 `insufficient_scope`；HTTP 上 POST `notifications/cancelled` 是否被接受；auto 探测超时回退。

## w2-mcp-core 带回的契约可加调整（W3 prep 回写 mcp-contract）

- `ActionDiscovery.refresh` 的请求加 `signal?: AbortSignal`（S5 的 `kept(cancelled)` 需要它；成员内已用 `McpDiscovery` 扩展形状绕过）。
- 领域时间：`acquiredAt` 的时钟进 `McpConfig`（`now?: () => number`，默认本机时钟）或 `McpPorts`；成员内已用 `createMcpCore` 第三参 `{ now }` 绕过。
- 契约 `json.ts` 的 `canonical`/`sameJson` 从公开根导出，成员删自己的 `internal/canonical.ts`；`testing-values.ts` 的样本构造器从 `./testing` 导出，成员删 `tests/doubles/values.ts`。

## w2-skill 带回的契约可加调整（W3 prep 回写 skill-contract）

- 导出 `MANIFEST_PATH`/`DECLARATION_PATH`、`PAGE_LIMIT`、`sameCapability`（成员 `skill` 删重复定义）。
- 端口答复畸形值的处置统一：读取判定一侧答 `unknown`，对应端口一侧抛 `TypeError`；契约写明「端口答复不在封闭集合内时实现答 `unknown`」或两侧都抛。
- 读取「请求长度短于一个字符时不前进」已有重读规则；是否另给前进保证由契约拥有者定。

## w2-mcp-core 收口后留给 W3 `w3-mcp-call`（同成员首项）

- 连接表遗忘谓词改为「条目什么资源也不持有（transport/process/credential 为空 + 无 lingering + 无在途落点）」；`teardown` 每步 `try/finally` 继续往下走；用例：`transport.close()` reject 后换修订，旧进程仍被停、句柄仍被释放。
- `release`/`closeAll` 在落点在途时答 `unconfirmed`；`closeAll` 强制释放进程凭据句柄（S9 关停例外写进契约）。
- 临界区内的重读受连接时限约束。
- 契约：`refresh` 加 `signal?`；`McpConfig.now?`；`canonical`/`sameJson` 与 `testing-values` 导出；`McpTransport.close()`/`ProcessHandle.stop()` 的 reject 语义写明（或改为 Outcome）。
- `open` 答 `entry-unreadable` 的映射（`source-unavailable`）在契约 SPEC 与组页都没有条款，只有源码（写回写者发现）；读取判定答复不在集合答 `unknown`、范围非法先抛 `TypeError` 也只在成员 SPEC——W3 prep 补契约条款并写回组页。

## W3 写回清单的种子（本波评审建议，未做）

- MCP 组页「模型」改为实现的聚合（`Connection` 的 `attempt()/ready()/lose()`、`InFlightCalls`；`ActionCatalog` 是不可变记录 + 纯函数）。
- MCP 组页不变式 6 拆成关闭条件、粒度、重读三条；并发段后加时序图；F-MC03 图把发布边界拆成异步核对与写入前同步核对两段。
- Skill 组页映射表键列只留键；`open` 的 `entry-unreadable` 映射先补契约条款再写回。
