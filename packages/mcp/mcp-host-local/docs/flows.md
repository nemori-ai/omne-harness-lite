# 关键流程

本文件用可维护的文本图源描述本包的关键业务流程与数据流：参与者、调用时序、数据来源与去向、状态变化、失败分支与生命周期。图旁写前提与边界，不编造流程。条款归 [SPEC.md](../SPEC.md) 与契约 SPEC；本页只画顺序。

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
  session ──credential.authorize(headers)──► handle         （失败 → not-sent，不发）
  session: 组成 _meta（clientEnvelopeOf）与 MCP 头（mcpRequestHeadersOf），登记 Pending
  session ──line.send(outbound, controller.signal)──► line
    stdio: 写一行 ──► 'sent'   ／ 进程已退出、写失败 ──► 'unsent'
    http : POST ──► 'status' | 'stream' | 'aborted' | 'unsent'
  session: Exchange → WireEvent → classifyWireEvent(event, context) → T8 的结论 → settle(Pending)
  stdio 的应答：line.events 的 'line' ──► 对每个在途请求归类 ──► 命中的那个 settle
```

### 探测与旧一路（契约 T3、T8 D/I 行）

```text
discover():
  server/discover（最高现代版本） ──► D01 身份 ／ D04 以共有版本再探测一次 ／ D02、D06、D09、D12、D13 走旧一路 ／ D03、D10、D11 走旧一路并报本行 ／ 其余最终失败
  旧一路：initialize（LEGACY_PROTOCOL_VERSIONS[0]）
    HTTP 且答「4xx+纯」（I07）──► enterSse：GET 目标 ──► 'entered' 则再发 initialize 到 endpoint ／ 401、403 按 S05、S06 ／ 其余 not-sent
    读得懂 ──► 记会话号（Mcp-Session-Id）、标记旧一路 ──► notifications/initialized ──► 身份
```

### 旧 HTTP+SSE 模式下的数据流

```text
POST endpoint ──► 202（空流结束）──► classify(mode='sse') = waiting ──► 请求继续在途
GET 流的每个 message 事件 ──► 'line' 事件 ──► 归类 ──► 应答命中在途请求 ／ 对端请求与通知路由
GET 流结束或断开 ──► 'broken' ──► 所有在途请求 no-answer (stream-broken)，dead
```

## 失败与生命周期

| 事件                                 | 结果                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| stdio stdout 结束 / 进程退出         | 线路等另一方最多 `PROCESS_EXIT_WINDOW_MS`，发 `ended`；会话把所有在途请求答 `stream-broken` 或 `process-exited`，之后 `not-sent` |
| 一行或一个正文超过 16 MiB            | 线路立即宣告 `ended`（stdio）或该请求 `aborted`（HTTP）→ 流断开                                                                  |
| `fetch` 在应答头之前失败             | `cause.code` 在未连上的集合里 → `unsent` → `not-sent`；否则 `aborted` → 流断开（读类再发一次）                                   |
| 2xx 正文在结束前中断                 | `aborted` → 流断开                                                                                                               |
| 401 / 带 `insufficient_scope` 的 403 | 授权过的句柄 `reportRejection()` 一次 → 取元数据（契约的两段地址）→ `not-sent (authorization-required)`                          |
| 带旧会话的请求答 404                 | `not-sent (session-ended)`，之后 `not-sent (connection-unavailable)`                                                             |
| `cancelRequest`                      | stdio、旧修订、SSE 模式：发 `notifications/cancelled`，继续等；现代 HTTP：中止该请求的 `fetch` 与流，答 `abandoned`              |
| `call` 的 `signal` 触发              | 调用前：`not-sent`；发出后：中止流，答 `abandoned`                                                                               |
| `close()`                            | 在途请求全部 `abandoned`，新请求 `not-sent`；中止一切 `fetch` 与 GET 流；stdio 先关 stdin 再取消 stdout，再取消 stderr；不停进程 |
| 凭据句柄 `authorize` reject / 抛出   | 请求不发，`not-sent (connection-unavailable)`                                                                                    |
| `observe` 抛出                       | 吞掉，结局不变                                                                                                                   |

没有 disposer 让已经写出的请求与通知撤回；`close()` 之后对端可能仍在处理最后一个请求，效果由调用方按 `no-answer` 处置。
