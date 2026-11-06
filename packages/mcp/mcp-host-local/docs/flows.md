# 关键流程

本文件用可维护的文本图源描述本包的关键业务流程与数据流：参与者、调用时序、数据来源与去向、状态变化、失败分支与生命周期。图旁写前提与边界，不编造流程。条款归 [SPEC.md](../SPEC.md) 与契约 SPEC；本页只画顺序。失败表的每一行在最后一列指向它的条款。

## 流程

### 打开与一次请求

```text
caller ──open(material, signal)──► factory
  factory: signal 已中止? ──► not-sent
  factory ──new StdioLine(process) / new HttpLine(target, fetch)──► line   （stdio：起 stdout/stderr 读取，落定已成立的退出）
  factory: signal 已中止? ──► line.close(); not-sent
  factory ──new Session(line, material, options)──► caller（什么也没发）

caller ──listActions()──► session
  session: usable? ──否──► not-sent (connection-unavailable)
  session: 登记 Pending（相 authorizing，带自己的结算与出发点），经 work 启动后台工作流；call 的 signal 接到 stop
  caller: 只等 Pending 的结算（call 另等出发点），不等工作流
  session ──credential.authorize(headers)──► handle         （失败 → not-sent，不发）
  session: callHandle 已关闭? ──是──► 不调用句柄；sendOut 在 authorize 返回后核 Pending 仍在途，否则停止
  session: 组成 _meta（clientEnvelopeOf）、MCP 头（mcpRequestHeadersOf）与文本（requestTextOf），阶段 sent
  session ──line.send(outbound, controller.signal)──► line
    stdio: 写一行 ──► 'sent'   ／ 进程已退出、写失败 ──► 'unsent' ／ signal 中止未完成的写 ──► 'aborted'
    http : POST ──► 'status' | 'stream' | 'aborted' | 'unsent'
  session: Exchange → WireEvent → classifyWireEvent(event, context) → concludeAnswer → settle(Pending)
  stdio 的应答：line.events 的 'line' ──► 对每个在途请求归类 ──► 命中的那个 settle
```

### 探测与旧一路（契约 T3、T8 D/I 行）

```text
discover()（契约 discoverWith 与 concludeProbe 给出每一步）:
  server/discover（最高现代版本） ──► D01 身份 ／ D04 以共有版本再探测一次 ／ D02、D06、D09、D12、D13 走旧一路 ／ D03、D10、D11 走旧一路并报本行 ／ 其余最终失败
  旧一路：initialize（OFFERED_LEGACY_VERSION）
    HTTP 且答「4xx+纯」（I07）──► enterSse：
      session ──authorize(headers)──► handle
      session ──line.openGet(headers, teardown.signal)──► line ──► GetOpened（事实）
      session: 已关闭? ──是──► discard，not-sent
      session: heldEndpoint 判定（200、text/event-stream、同源的 endpoint 事件）
        成立 ──► enter(endpoint)，SSE 模式，再发 initialize 到 endpoint
        GET 401、带 insufficient_scope 的 403 ──► S05（reportRejection 一次，授权发现）
        其余 ──► discard，not-sent (connection-unavailable)
    读得懂 ──► 记入连接模式 legacy（版本与可选的 Mcp-Session-Id） ──► notifications/initialized（在关闭之下等）──► 身份
```

### 旧 HTTP+SSE 模式下的数据流

```text
POST endpoint ──► 202（空流结束）──► classify(mode='sse') = waiting ──► 请求继续在途
GET 流的每个 message 事件 ──► 'line' 事件 ──► 归类 ──► 应答命中在途请求 ／ 对端请求与通知路由
GET 流结束或断开 ──► 'broken' ──► 所有在途请求 no-answer (stream-broken)，dead
```

## 失败与生命周期

| 事件                                    | 结果                                                                                                                                                                                                                                                                                                      | 条款                                                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdio stdout 结束 / 进程退出            | 线路等另一方最多 `PROCESS_EXIT_WINDOW_MS`，发 `ended`；会话把所有在途请求答 `stream-broken` 或 `process-exited`，之后 `not-sent`                                                                                                                                                                          | 契约 [T8](../../mcp-contract/SPEC.md#t8) 进程退出；SPEC [H12](../SPEC.md#h12)                                                                     |
| stdio 一行超过 16 MiB                   | 线路立即报告 `ended` → 流断开，传输不再可用                                                                                                                                                                                                                                                               | 契约 [T2](../../mcp-contract/SPEC.md#port-transport)；[H8](../SPEC.md#h8)                                                                         |
| HTTP 2xx 正文或一个 SSE 事件超过 16 MiB | 该请求的应答流断开 → 流断开                                                                                                                                                                                                                                                                               | [H8](../SPEC.md#h8)                                                                                                                               |
| HTTP 错误状态的正文超过 16 MiB          | 正文读成空，按「纯」归类；状态照常                                                                                                                                                                                                                                                                        | [H8](../SPEC.md#h8)                                                                                                                               |
| `fetch` 在应答头之前失败                | `cause.code` 在未连上的集合里 → `unsent` → `not-sent`；否则 `aborted` → 流断开（读类再发一次）                                                                                                                                                                                                            | 契约 [T8](../../mcp-contract/SPEC.md#t8) X01、D15、O05；[H10](../SPEC.md#h10)                                                                     |
| 2xx 正文在结束前中断                    | `aborted` → 流断开                                                                                                                                                                                                                                                                                        | 契约 [T2](../../mcp-contract/SPEC.md#port-transport)                                                                                              |
| 401 / 带 `insufficient_scope` 的 403    | 授权过的句柄 `reportRejection()` 一次，同时取元数据（取回受请求的 `signal`、关闭与正文上界约束）→ `not-sent (authorization-required)`                                                                                                                                                                     | 契约 [T4](../../mcp-contract/SPEC.md#port-transport)、[R4](../../mcp-contract/SPEC.md#refusals)；[H4](../SPEC.md#h4)                              |
| 对端的请求                              | `ping` 答空结果，其余 `-32601`；HTTP 上答复的 POST 先经 `authorize`；关闭之后不答复                                                                                                                                                                                                                       | 契约 [T3](../../mcp-contract/SPEC.md#port-transport)、[T9](../../mcp-contract/SPEC.md#t8-end)；SPEC [所有权一节](../SPEC.md#所有权失败与生命周期) |
| 带旧会话的请求答 404                    | `not-sent (session-ended)`，之后 `not-sent (connection-unavailable)`                                                                                                                                                                                                                                      | 契约 [T8](../../mcp-contract/SPEC.md#t8) S07                                                                                                      |
| `cancelRequest`                         | 当即返回。stdio、旧修订、SSE 模式：把 `notifications/cancelled` 交给后台工作，`answer` 继续等；现代 HTTP：中止该请求的 `fetch` 与流，答 `abandoned`                                                                                                                                                       | 契约 [T5](../../mcp-contract/SPEC.md#port-transport)                                                                                              |
| `call` 的 `signal` 触发                 | 当场按相结算，`call` 在触发后结算，不等句柄或对端：授权中 `not-sent`；已交给线路 `abandoned`，并释放交换（现代 HTTP 中止 `fetch` 与应答流；stdio 上写未完成时中止写端，传输不再可用）；授权发现中结束取回，答 `not-sent (authorization-required)`；调用前已触发答 `not-sent`                              | 契约 [T5](../../mcp-contract/SPEC.md#port-transport)；SPEC [取消](../SPEC.md#所有权失败与生命周期)、[H6](../SPEC.md#h6)                           |
| `close()`                               | 当场按相结算：授权中 `not-sent`，已交给线路 `abandoned`，授权发现中 `not-sent (authorization-required)`，不等发现；新请求 `not-sent`；中止一切 `fetch` 与 GET 流，只等线路的 `close()`；stdio 先结束 stdin 写端再取消 stdout，再取消 stderr；不停进程；之后不再调用凭据句柄；重复调用得到同一次关闭的结果 | 契约 [T5](../../mcp-contract/SPEC.md#port-transport)；SPEC [关闭](../SPEC.md#所有权失败与生命周期)、[H6](../SPEC.md#h6)                           |
| 凭据句柄 `authorize` reject / 抛出      | 请求不发，`not-sent (connection-unavailable)`                                                                                                                                                                                                                                                             | 契约 [T9](../../mcp-contract/SPEC.md#t8-end)                                                                                                      |
| `observe` 抛出                          | 吞掉，结局不变                                                                                                                                                                                                                                                                                            | 契约 [S6](../../mcp-contract/SPEC.md#services)                                                                                                    |

没有 disposer 让已经写出的请求与通知撤回；`close()` 之后对端可能仍在处理最后一个请求，效果由调用方按 `no-answer` 处置。
