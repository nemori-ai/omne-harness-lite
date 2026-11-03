# W2 探路：官方 TypeScript SDK v2.3.1 能否套进 `McpTransport`

范围：`@modelcontextprotocol/client@2.3.1`、`@modelcontextprotocol/server@2.3.1`（core 2.3.1），协议修订 2026-07-28。Node v26.12.0。
对照对象：`packages/mcp/mcp-contract/src/transport.ts` 与 `SPEC.md` 的 T1–T7、S5。
本文的事实有两种来源：「实测」指脚本实际跑出的结果，原始输出在 `out-*.txt`；「读码」指读 `node_modules/@modelcontextprotocol/*/dist` 得到的结论，没有经过运行。

## (a) 脚本、命令与输出摘要

在本目录运行。脚本只往 stderr 写，stdout 留给 stdio 协议。

| 脚本 | 命令 | 结果 |
| --- | --- | --- |
| `server.ts` | 由各客户端启动；单独运行：`node --experimental-strip-types server.ts`（加 `--legacy` 得到只会 2025 修订的服务端） | 能运行，见下 |
| `client-stdio.ts` | `node --experimental-strip-types client-stdio.ts 2> out-stdio.txt` | exit 0 |
| `client-streams.ts` | `node --experimental-strip-types client-streams.ts 2> out-streams.txt` | exit 0 |
| `client-http.ts` | `node --experimental-strip-types client-http.ts 2> out-http.txt` | exit 0 |

### server.ts

- `McpServer` 注册三个工具，用 `serveStdio(factory)` 服务。
- `echo`：带 `outputSchema`，返回 `structuredContent`。如果请求带 `progressToken`，先经 `ctx.mcpReq.notify` 发一条 `notifications/progress`。
- `ask`：第一轮返回 `inputRequired({ inputRequests: { who: inputRequired.elicit(...) }, requestState: 'ask-round-1' })`。第二轮从 `ctx.mcpReq.inputResponses` 和 `ctx.mcpReq.requestState()` 读答复，返回 complete。
- `slow`：**SDK 在 2026-07-28 上没有任务运行时**：没有 task 工具声明，也没有 `createTask`，`ResultTypeMap['tools/call']` 里也没有 `CreateTaskResult`。所以处理器手写 `{ resultType: 'task', task: {...}, content: [] }`。
  - 必须带 `content: []`。`McpServer` 在编码前用 `CallToolResult` 校验每个非 `input_required` 的 tools/call 结果，缺 `content` 时会自己答 `-32602 Invalid tools/call result`（实测）。
  - 编码层对 tools/call 的非 `complete` `resultType` 原样放行（读码：`stampResultType`）。
  - `tasks/get`、`tasks/update`、`tasks/cancel` 用 `server.server.setRequestHandler(method, { params: zodSchema }, handler)` 注册为自定义方法。`tasks/get` 和 `tasks/cancel` 属于「扩展复用名」，只有带 schema 注册时现代修订才会派发。
  - 任务的形状是按我们 T6 的读法自拟的：`tasks/get` 直接带 `status`、`result`、`error`、`inputRequests`。**没有对照 SEP-2663 原文核实。**
  - 客户端只有在每请求 `_meta` 的 `clientCapabilities.extensions["io.modelcontextprotocol/tasks"]` 里声明了扩展，`slow` 才建任务。参数 `inline: true` 让它同步执行，供取消测试使用。
- 任务表放在模块级。原因：`serveStdio` 为每条连接**以及每次被丢弃的 discover 探测**各建一个 `McpServer`；`createMcpHandler` 为每个 HTTP 请求各建一个。

### client-stdio.ts（`StdioClientTransport` + `Client`，`versionNegotiation: { mode: 'auto' }`）

实测摘要：

- 建连约 250 ms。`getProtocolEra()` 为 `modern`，版本 `2026-07-28`。**服务端进程启动了两次**：spawn-log 有两个 pid。auto 模式下，基类 `StdioClientTransport` 先用同样的参数另起一个兄弟进程做 `server/discover` 探测，探完丢弃（stderr 也丢弃），再启动真正的会话进程。
- `getDiscoverResult()` 返回原样的 DiscoverResult：`{ _meta: { "io.modelcontextprotocol/serverInfo": {name,version} }, ttlMs, cacheScope, supportedVersions: ["2026-07-28"], capabilities: {...,extensions:{...}}, instructions, resultType: "complete" }`。`getServerCapabilities()`、`getServerVersion()`（取自 `_meta` 的 serverInfo）和 `getInstructions()` 各给出其中一部分。
- `listTools()` 不带 cursor 时走聚合路径并写缓存，返回 `{_meta, ttlMs, cacheScope, tools}`。服务端只有一页，`nextCursor` 为空。
- `callTool(echo, {onprogress})` 收到进度 `{progress:1,total:1,message}`。结果带 `_meta.serverInfo`、`content` 与 `structuredContent`，`resultType` 已被剥掉。
- `callTool(ask)` 默认自动完成：`input_required` 交给 `client.setRequestHandler('elicitation/create', ...)` 注册的处理器，SDK 用新 id 原样回传 `requestState` 并重试。整个过程对调用方不可见，只看到最终的 complete 结果。
- `callTool(ask, { allowInputRequired: true })` 返回 `{ resultType:'input_required', inputRequests, requestState, _meta }`。手工把 `inputResponses` 与 `requestState` 放进 params 重试，得到 complete。
- `callTool(slow)` 抛 `SdkError{code:'UNSUPPORTED_RESULT_TYPE', data:{resultType:'task', method}}`，CreateTaskResult 原文只能从 transport 上挂的 tap 拿到。
- `client.request({method:'tasks/get'|'tasks/update'|'tasks/cancel', params}, zodSchema)` 都能用：
  - 轮询到 `completed` 后，结果里带 `result`。
  - cancel 应答为空，之后的 `tasks/get` 答 `cancelled`。
  - 线上 `tasks/update` 原样带着 `inputResponses`；服务端处理器在 params 里看不到它，只能从 `ctx.mcpReq.inputResponses` 读（见 b）。
  - 未知任务答 `ProtocolError{code:-32602}`。
  - `tasks/result` 在本地就被拒：`SdkError METHOD_NOT_SUPPORTED_BY_PROTOCOL_VERSION`。
- 取消：对 `callTool(..., {signal})` 调 abort，SDK 立即以 `SdkError{code:'REQUEST_TIMEOUT', message:'user-cancel'}` 拒绝，并在 stdio 上自动发出 `notifications/cancelled {requestId: 21, reason, _meta: 信封}`。服务端的 `ctx.mcpReq.signal` 被触发，之后不再应答。
- 自动附加的每请求信封见 (b)。

### client-streams.ts（自写 `Transport`，跑在外部给定的 Web 流上）

`StreamTransport` 只依赖 `{ stdin: WritableStream<Uint8Array>, stdout: ReadableStream<Uint8Array> }`，与我们的 `ProcessHandle` 同形；用 `Writable.toWeb`/`Readable.toWeb` 包装自己 spawn 的管道。帧分隔方式：**一行一个 JSON 对象，以 `\n` 结尾**。`serializeMessage = JSON.stringify(m) + "\n"`；`ReadBuffer` 按 `\n` 切行，去掉行尾 `\r`。

- A) `Client`（auto）+ `StreamTransport`：只 spawn 一次，探测在同一条连接上进行。版本 2026-07-28，echo 正常。第一帧的 id 是字符串 `"server-discover-probe-1"`，其后是数字 id。`client.close()` 只关我们的流端；服务端读到 stdin EOF 后自己退出。
- B) 不用 Client，在同一个 transport 上自己发 JSON-RPC，id 用自己的字符串 `r1`、`r2`……：
  - `server/discover` 带信封，应答形状同上。
  - 信封版本写 `2099-01-01` 时答 `-32022 {data:{supported:["2026-07-28"],requested}}`。
  - `ask` 不声明 elicitation 时答 `-32021 {data:{requiredCapabilities:{elicitation:{form:{}}}}}`。
  - `slow` 拿到原样的 CreateTaskResult。
  - `notifications/cancelled {requestId:"r6"}` 让服务端中止，1.5 s 内没有应答。
  - 连接钉为现代修订后，不带信封的请求答 `-32602 Request is missing the required _meta envelope…`。
  - **`serveStdio` 的修订钉定发生在第一条非 discover 的请求上，`server/discover` 不钉定。** 第一次实测时我在 discover 之后先发了一条不带信封的 `tools/list`，整条连接就被钉成 2025：之后带信封的请求也由 legacy 实例应答，结果没有 `_meta.serverInfo`，`ask` 报「2025-era connection」。
- C) `Client`（auto）对 `--legacy` 服务端：探测得到 `-32601 Method not found`，SDK 回退到 `initialize` 和 `notifications/initialized`，修订为 `legacy` 2025-11-25。`getDiscoverResult()` 为 `undefined`；`getServerVersion()` 和 `getServerCapabilities()` 取自 initialize。
- D) 调用进行中 SIGKILL 服务端：调用以 `SdkError{code:'CONNECTION_CLOSED'}` 拒绝，`client.onclose` 触发。之后的调用抛普通 `Error('Not connected')`，不带 code。

### client-http.ts（`createMcpHandler` + 手写 `node:http` 适配 + `StreamableHTTPClientTransport`）

`@modelcontextprotocol/node` 的 `toNodeHandler` 没有安装，所以手写了 `IncomingMessage` 到 `Request` 的适配。客户端用 `fetch` 选项传入一个会记录请求的 fetch。

- 请求头：
  - discover：`mcp-method: server/discover`、`mcp-protocol-version: 2026-07-28`、`accept: application/json, text/event-stream`。
  - tools/call：另加 `mcp-name: echo`。
  - tasks/get：`mcp-name: task-1`（取自 `params.taskId`）。
  - 没有 session id。
- ask 经 HTTP 自动完成；slow 同样抛 `UNSUPPORTED_RESULT_TYPE`；`tasks/get` 能用。
- 取消：abort 后只有原来那条 POST，**不发 `notifications/cancelled`**，SDK 中止这个请求的流。服务端的 `ctx.mcpReq.signal` 以 `Connection closed` 触发。客户端同样得到 `REQUEST_TIMEOUT`。
- 401：没有 `authProvider` 时，`connect` 抛 `SdkHttpError{code:'CLIENT_HTTP_AUTHENTICATION', data:{status:401, statusText, text:""}}`。**错误对象里没有 `WWW-Authenticate`**，只有 fetch 钩子能看到这个头。用 fetch 钩子加 `authorization` 头后能连上。

## (b) SDK API 事实表

| 主题 | 事实 | 来源 |
| --- | --- | --- |
| 建连 | `new Client(info, { capabilities, versionNegotiation: {mode:'auto' \| {pin:'2026-07-28'} \| 'legacy'}, inputRequired: {autoFulfill?, maxRounds?}, listMaxPages, responseCacheStore, defaultCacheTtlMs })`；`await client.connect(transport, { signal?, timeout?, prior? })`。默认模式是 `legacy`，不探测。`prior: {kind:'modern', discover}` 复用已有的 DiscoverResult，零往返 | 读码 + 实测 |
| 探测与回退 | auto 模式：定性为现代时采用；明确的 legacy 信号**以及任何认不出的应答**都回退到 `initialize`。stdio 上探测超时也当作 legacy；HTTP 上超时则抛错。`-32022` 修正续接不计入 `probe.maxRetries` | 读码（d.mts 注释）；回退实测 C |
| stdio 兄弟进程 | 只有基类 `StdioClientTransport` 才在兄弟进程上探测（每次 connect 多 spawn 一次）；子类和自定义 transport 在原连接上探测 | 实测（2 个 pid 对 1 个） |
| DiscoverResult | `{supportedVersions, capabilities, instructions?, resultType, ttlMs, cacheScope, _meta:{"io.modelcontextprotocol/serverInfo":{name,version}}}`。类型上没有 `serverInfo` 字段；`ttlMs`/`cacheScope` 只在类型层面隐藏，运行时存在 | 实测 + 文档 |
| 每请求信封 | 现代修订下，Client 在每个请求**和通知**的 `params._meta` 上自动加 `io.modelcontextprotocol/protocolVersion`、`…/clientInfo`、`…/clientCapabilities`（另有可选的 `…/logLevel`）。用户给的 `_meta` 键优先 | 实测 |
| 任务扩展声明 | 客户端：`capabilities.extensions["io.modelcontextprotocol/tasks"] = {}`，随信封的 `clientCapabilities` 发出。服务端：同样写在 `capabilities.extensions`，出现在 discover 的 `capabilities` 里。SDK 不解释这个扩展 | 实测 |
| 结果 `_meta` | 现代服务端在每个结果上盖 `_meta["io.modelcontextprotocol/serverInfo"]`。Client 解码时剥掉 `resultType` | 实测 |
| listTools | 不带 `cursor`：聚合全部页（上限 `listMaxPages`，默认 64）并写缓存，可能从缓存直接返回。带 `cursor`：返回单页原样（含 `nextCursor`）。**拿第一页单页只能用 `client.request({method:'tools/list', params:{}})`**，因为 `listTools({cursor:undefined})` 走聚合。两条路径都会按 SEP-2243 删除 `x-mcp-header` 不合法的工具（就地修改）。现代修订下，解码层先用 wire schema 校验整页，坏一个工具整页都抛 `InvalidResult` | 读码 |
| callTool | 返回解析后的 `CallToolResult`。另外三件事：① 按缓存的 `outputSchema` 本地校验 `structuredContent`，失败时**本地**抛 `ProtocolError(-32602 或 -32600)`，与对端错误同类同码；② `-32020` HEADER_MISMATCH 时刷新 tools/list 后**自动重发一次调用**；③ `input_required` 默认自动完成 | 读码；③ 实测 |
| input_required 手动模式 | `inputRequired:{autoFulfill:false}` 或每次调用 `{allowInputRequired:true}`，得到 `{resultType:'input_required', inputRequests, requestState?, _meta?}`。重试时把 `inputResponses`、`requestState` 放进 params | 实测 |
| 服务端 input_required | `inputRequired({inputRequests, requestState})`、`inputRequired.elicit/elicitUrl/createMessage/listRoots`、`acceptedContent(ctx.mcpReq.inputResponses, key, schema?)`、`ctx.mcpReq.requestState()`。可选 `ServerOptions.requestState.verify` 与 `createRequestStateCodec`（HMAC）。客户端没有声明所需能力时，服务端答 `-32021` | 实测 |
| 入站 lift | 协议层在派发前把**每个**入站请求 params 里的 `inputResponses`、`requestState` 与信封键取走，放到 `ctx.mcpReq.inputResponses`、`.requestState`、`.envelope`；处理器在 params 里看不到它们。`tasks/update` 也一样 | 实测 |
| 非 complete 的 resultType | 客户端：`complete` 与 `input_required` 之外的值都由 `SdkError(UNSUPPORTED_RESULT_TYPE, data:{resultType, method})` 拒绝，原始结果丢失。服务端：tools/call、prompts/get、resources/read 的处理器给的 resultType 原样透传 | 实测 |
| 任务方法 | 2025-11-25 的任务词汇只剩导出，没有运行时，全部 `@deprecated`。现代修订下：`tasks/get`、`tasks/cancel` 必须带 schema 调 `client.request(req, schema)`；`tasks/update` 是 SDK 规范词汇以外的方法，任何修订都放行，需带 schema；`tasks/result`、`tasks/list` 本地抛 `METHOD_NOT_SUPPORTED_BY_PROTOCOL_VERSION` | 实测 |
| 错误码 | `ProtocolErrorCode.InvalidParams=-32602`、`MissingRequiredClientCapability=-32021`（`MissingRequiredClientCapabilityError`，`data.requiredCapabilities`）、`UnsupportedProtocolVersion=-32022`（`UnsupportedProtocolVersionError`，`data:{supported, requested}`）、`HEADER_MISMATCH=-32020`。客户端收到 JSON-RPC 错误时 `ProtocolError.fromError(code,message,data)` 抛出 `ProtocolError` 或其子类。服务端处理器抛 `new ProtocolError(code,msg,data)` 即上线。服务端把 `-32002` 编码成 `-32602` | 实测 + 读码 |
| SDK 本地错误 | `SdkError{code}`：`REQUEST_TIMEOUT`（超时**和** abort 都用它）、`CONNECTION_CLOSED`、`NOT_CONNECTED`、`INVALID_RESULT`、`UNSUPPORTED_RESULT_TYPE`、`ERA_NEGOTIATION_FAILED`、`CLIENT_HTTP_AUTHENTICATION`（401）、`CLIENT_HTTP_FORBIDDEN`（403）等。HTTP 状态在 `SdkHttpError.data.status` | 实测 + 读码 |
| 默认超时 | 每个请求默认 60 000 ms。超时会**发出取消**（stdio 发 `notifications/cancelled`，HTTP 断流），并以 `REQUEST_TIMEOUT` 拒绝 | 读码 |
| 取消（stdio） | 只能 abort 调用时传入的 `signal`。SDK 发 `notifications/cancelled {requestId, reason, _meta: 信封}`（`initialize` 除外）。不能按 id 取消 | 实测 |
| 取消（HTTP） | 现代修订且 `hasPerRequestStream` 时，abort 中止这个请求的 POST/SSE 流，**不发** `notifications/cancelled`。服务端 `ctx.mcpReq.signal` 以 Connection closed 触发 | 实测 |
| HTTP 头 | `mcp-protocol-version`、`mcp-method`，以及 tools/call、prompts/get、resources/read、tasks/get、tasks/update、tasks/cancel 上的 `mcp-name`（取自 name、uri 或 taskId）。工具声明 `x-mcp-header` 时另有 `Mcp-Param-*` | 实测 + 读码 |
| 进度和日志 | 进度：`RequestOptions.onprogress`，SDK 用消息 id 当 `progressToken`。日志：`client.setNotificationHandler('notifications/message', …)`，全局注册，不按调用分；在 2026-07-28 上已废弃，只有信封带 `logLevel` 时服务端才发 | 实测 + 文档 |
| 请求 id | `Protocol` 内部的数字计数器，没有公开读取方式；discover 探测用字符串 id。`_onresponse` 用 `Number(response.id)` 查表，不认识的 id 进 `onerror` | 读码 |
| stdio 帧 | NDJSON。`ReadBuffer` 会**静默跳过**不是 JSON 的行（捕获 `SyntaxError` 后 continue）。是 JSON 但不是 JSON-RPC 形状时抛 ZodError，进 transport 的 `onerror`。缓冲上限默认 10 MB，超过就清空并抛错 | 读码 |
| `StdioClientTransport.close()` | 先 `stdin.end()`，等 2 s 后 SIGTERM，再等 2 s 后 SIGKILL：**这个 transport 自己停进程** | 读码 |

## (c) 对照 `McpTransport` 七个方法与 `McpTransportFactory.open`

总判断：SDK 的 **`Transport` 层**可以直接套用：stdio 用自写的 `StreamTransport` 跑在 `ProcessHandle` 的 Web 流上，HTTP 用 `StreamableHTTPClientTransport` 加 fetch 钩子。**`Client` 高层**只适合 `discover` 和三个任务确认类请求。`call`、`cancelRequest` 和 `listActions` 的第一页都会碰到 SDK 隐藏的信息，或 SDK 替调用方做了的决定。

| 契约成员 | 能否用 SDK 直接实现 | 要绕的地方、拿不到的东西 |
| --- | --- | --- |
| `factory.open(material, signal)`，stdio | 部分可以 | **不能用 `StdioClientTransport`**：它自己 spawn，auto 模式还多起一个兄弟进程，而且 `close()` 会 kill 进程。这违反 T5，也绕过 ProcessLanding 和凭据环境。改用自写 `Transport`，跑在 `material.process.stdin/stdout` 上：实测可行，探测在原连接上，只有一个进程。`connect(transport, {signal})` 支持 signal。`stderr`、`exited` 不经过 SDK；`no-answer` 的原因（`process-exited` 还是 `stream-broken`）只能看我们自己的 `exited` 和流的结束来定，SDK 一律报 `CONNECTION_CLOSED` |
| `factory.open`，streamable-http | 可以 | `new StreamableHTTPClientTransport(url, { fetch })`，在 fetch 钩子里调 `credential.authorize(headers)`。401/403 时 SDK 抛 `SdkHttpError`（status 401/403），但**不带 `WWW-Authenticate`**。T4 需要的授权发现（`resource_metadata`、scope、issuers）只能在 fetch 钩子里读响应头，再用 SDK 导出的 `extractWWWAuthenticateParams`、`discoverOAuthProtectedResourceMetadata` 解析。`reportRejection()` 也要在钩子里调用。不能传 `authProvider`，否则 SDK 会自己重试授权 |
| `generation` | 不涉及 | 我们自己的字段 |
| `discover()` | 可以，但有语义差 | 用 Client 时，`connect` 本身就是 discover：`getDiscoverResult()` 给出原样结果（含 `_meta.serverInfo`、instructions），legacy 修订下用 `getServerCapabilities`、`getServerVersion`、`getInstructions`、`getNegotiatedProtocolVersion`。差异：① **T7 的 `discover-shape`**：SDK 把认不出的探测应答当成 legacy 信号并回退到 `initialize`，不报读不懂；② stdio 上探测超时也回退，不报 `no-answer`；③ `instructionsByteLimit` 只能事后截断，SDK 已经把整段读进内存（stdio 上限 10 MB）；④ 回退到 legacy 时没有 DiscoverResult，capabilities 和 serverInfo 来自 initialize。S5 把 discover 的 `error-answer`/`answer-malformed` 映射为 `connection-unavailable`，把 `no-answer` 映射为 `effect-unknown`；这要求我们能从 `connect` 抛出的 `SdkError`、`ProtocolError` 里分辨这几类，目前只有 code 可依据 |
| `listActions(cursor?)` | 带 cursor 可以；第一页要绕 | `listTools({cursor})` 只在 cursor 有值时返回单页原样。第一页要用 `client.request({method:'tools/list', params:{}}, schema)`。两点会改变对端原文：① SDK 删除 `x-mcp-header` 不合法的工具（就地修改）；② 现代修订下，解码层先用 wire schema 校验整页，坏一个工具，整页就成了 `SdkError(INVALID_RESULT)`。我们按工具判 `ListingDefect` 的余地因此没有了，`tools-missing` 和单个工具坏掉在 SDK 里是同一个错误。只用 Transport 自己发，就能拿到原样 `{tools, nextCursor, ttlMs}` |
| `call(request, signal, observe)` | **不能**忠实实现 | ① `SentCall.requestId` 拿不到：id 是内部计数器，`callTool` 还会先 await 缓存才发送，在 `transport.send` 上挂钩也只能靠内容匹配；② T2 要求原样应答，但 `resultType` 被剥掉、`task` 结果被拒并丢失原文、`input_required` 默认被自动完成（要关 `autoFulfill` 再加 `allowInputRequired`）；③ `callTool` 本地做 outputSchema 校验，失败时抛 `-32602`、`-32600`，与对端错误同形，`classifyOutcome` 会把它当成对端答复；④ 遇到 `-32020` 时自动重发一次调用，同一个 call 在对端产生两次效果；⑤ `signal` 一 abort 就自动发取消并以 `REQUEST_TIMEOUT` 拒绝，契约里「未发出前取消」和「已发出后取消」分不开；⑥ 默认 60 s 超时会自己发取消，长调用必须改 `timeout` 或 `maxTotalTimeout`；⑦ `observe` 能拿到进度（`onprogress`），日志只能全局注册，不按调用分；⑧ T1 的 `not-sent` 要求在 `transport.send` 失败时判定，SDK 把它和其他拒绝混在一起。用 `client.request({method:'tools/call'}, looseSchema)` 只能绕开 ③④，①②⑤⑥ 仍然存在 |
| `cancelRequest(requestId)` | Client 做不到；Transport 能做 | Client 没有按 id 取消的 API。stdio：自己发 `notifications/cancelled {requestId, _meta: 信封}`，实测服务端中止且不应答。HTTP（2026）：SDK 的做法是中止这个请求的流，不发通知。所以我们的 HTTP 实现要为每个请求保留一个 AbortController，或者把通知 POST 出去（规范是否接受这种通知没有核实） |
| `getTask(taskId)` | 可以 | `client.request({method:'tasks/get', params:{taskId}}, z.object({status:z.string()}).loose())` 可用：`resultType` 被剥掉，`_meta` 保留；`-32602` 以 `ProtocolError.code` 给出，可映射为 `expired`。`status-unknown`、`input-requests-missing` 由我们自己判断。限制：现代解码要求应答带 `resultType`，非 SDK 实现的对端不带时就成了 `INVALID_RESULT`；要不要接受这种对端，取决于 SEP-2663 是否要求 tasks/get 带 resultType（未核实） |
| `updateTask(taskId, inputResponses)` | 可以 | `client.request({method:'tasks/update', params:{taskId, inputResponses}}, z.object({}).loose())`；线上原样带 `inputResponses`（实测） |
| `getTaskResult(taskId)` | 可以 | 同 `getTask`，读 `result`、`error`。`tasks/result` 已经在本地被禁止，正好与 T6「也发 tasks/get」一致 |
| `cancelTask(taskId)` | 可以 | `client.request({method:'tasks/cancel', ...}, loose)` |
| `close()` | 有条件 | `client.close()` 会调 `transport.close()`。自写 `StreamTransport` 只关自己的流端，满足 T5；`StdioClientTransport` 不满足。HTTP 的 close 只关 transport，没有进程问题 |

SDK 藏在 `Client` 里、调用方拿不到的东西：请求 id；原始应答帧（`resultType` 会被剥掉；`task` 结果、整页校验失败、本地校验失败时原文都丢失）；`WWW-Authenticate`；no-answer 的原因；探测的回退依据（为什么判成 legacy）；被删掉的 `x-mcp-header` 工具。每请求 `_meta` 信封不藏：可以从 transport.send 看到，也可以用 `_outboundMetaEnvelope()`（protected）生成。

## (d) 建议：W3 的 mcp-host-local 怎样使用 SDK

**建议：只用 SDK 的 `Transport` 层（stdio 用自写的 `StreamTransport`，HTTP 用 `StreamableHTTPClientTransport` 加 fetch 钩子），在上面自己发 JSON-RPC。** SDK 的类型与 schema（`specTypeSchemas`、`isInputRequiredResult`、`serializeMessage`、`ReadBuffer`，以及常量 `PROTOCOL_VERSION_META_KEY`、`SERVER_INFO_META_KEY` 等）作为工具使用。`Client` 只在测试里用作对照客户端，或者在验证夹具里使用。

两条路的代价：

- **Client 高层 API**
  - 得到：版本协商（含 `-32022` 修正续接与 legacy 回退）、信封自动附加、HTTP 头（`Mcp-Method`、`Mcp-Name`、`Mcp-Param-*`）、SSE 和重连、进度。
  - 代价：T2「原样应答」与 `SentCall.requestId` 根本做不到；任务在 tools/call 上直接被拒，必须在 transport 上挂 tap，回到 Client 外面去拿原文；本地校验错误、自动重发、自动完成和默认超时这四种行为都会改变对端效果或结局分类，每一种都要靠选项或挂钩关掉；T7 的 `discover-shape` 被 SDK 的回退吞掉。最后得到的是一个靠 tap 和 monkey-patch 维持的混合体，SDK 升小版本就可能失效。
- **只用 Transport，自己发 JSON-RPC**
  - 得到：id 由我们决定，应答原样到手，T1 四类失败按我们的规则判定（`send` 失败即 `not-sent`，流结束即 `no-answer` 并用 `exited` 区分原因，有 `error` 即 `error-answer`，读不懂即 `answer-malformed`），取消按 id 发，任务形状由我们解释。
  - 代价：要自己实现以下几项：
    - 协商：先发 `server/discover`；收到 `-32601`、legacy 信号或 stdio 超时时回退到 `initialize` 和 `notifications/initialized`；处理 `-32022` 的续接。
    - 信封：三个 `_meta` 键。
    - HTTP 上的 `Mcp-Name`：stdio 与 legacy 修订不需要；我们不打算支持 `x-mcp-header` 时，`Mcp-Param-*` 可以先不做。
    - HTTP 上的取消：中止流。
    - legacy 修订下的服务端到客户端请求（elicitation 推送）：拒绝即可。

    这些都是协议条文，体量小，可以直接写契约测试。另一个代价是 HTTP 侧仍然依赖 `StreamableHTTPClientTransport`，它的 `send` 失败形状（`SdkHttpError`）要映射到 T1/T4。
  - stdio 帧：不要用 SDK 的 `ReadBuffer`，或者只用它切行。它静默丢掉不是 JSON 的行，读不懂的应答会变成「等不到应答」，与 T7 不符。

另外，用 Transport 层时要注意 `serveStdio` 的钉定行为：discover 之后的**第一个**真实请求必须带信封，否则整条连接被钉成 2025。我们自己发的每个请求都带信封，就不受影响。

## (e) 没跑通的项与原因

1. **任务不是 SDK 能力**：服务端没有把工具标为任务、由处理器创建任务的 API，只能手写 `resultType:'task'`（还要带 `content: []`）和自定义 `tasks/*` 处理器。客户端无法接收 CreateTaskResult。任务部分的结论只证明线路可行，**任务结果的形状是按我们的 T6 自拟的，没有对照 SEP-2663 原文**（文档站也没有 Tasks 页）。`tasks/get` 是否必须带 `resultType`、`inputRequests` 放在哪里，都要读规范原文确认。
2. **`input_required` 状态的任务、`tasks/update` 改变任务状态**：服务端只确认收到 update，没有实现 input_required 任务的流转，所以 `getTask` 返回 `inputRequests` 的路径没有测。
3. **分页**：`McpServer` 不分页，`cursor:'bogus'` 也返回全量，所以多页、`nextCursor` 和 `listMaxPages` 都没有实测；结论来自读码。
4. **T7 的各种读不懂应答**（错误对象缺 code、`status` 不在五值内、非 JSON 行等）：没有做假服务端去测。`ReadBuffer` 丢弃非 JSON 行、整页校验失败这两点来自读码。
5. **403 insufficient_scope、调用进行中的 401、凭据刷新**：只测了建连时的 401（无 authProvider）和 fetch 钩子加头。SDK 还有 `InsufficientScopeError` 和 `CLIENT_HTTP_FORBIDDEN`，没有运行。
6. **HTTP 上手工 POST `notifications/cancelled`** 是否被 `createMcpHandler` 接受：没有测，只测了 SDK 自己的断流取消。
7. **日志通知**：没有测。在 2026-07-28 上已废弃，需要信封带 `logLevel`。
8. **auto 模式 stdio 探测超时回退**：没有测，需要一个对 discover 不应答的服务端。只测了 `-32601` 回退。
9. HTTP 服务端用的是手写的 `node:http` 适配。`@modelcontextprotocol/node` 没有安装，按要求也没有装。
