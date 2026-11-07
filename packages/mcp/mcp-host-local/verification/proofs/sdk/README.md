# verification/proofs/sdk

本目录是 [SPEC「与 SDK 的复用关系」](../../../SPEC.md#sdk-reuse)的论证：三个探针回答的问题、运行方式与输出的关键摘录。探针脚本在 `tests/probes/`。复用表的「证据」列用这里的输出说明 SDK 与 `fetch` 的实际行为。SDK 升级时重跑这三个探针，再核对复用表。

## 探针

| 探针                                                                 | 它回答的问题                                                                                           | 复用表里引用它的行                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| [p3-http-errors.mjs](../../../tests/probes/p3-http-errors.mjs)       | 全局 `fetch`（undici）对每一种 HTTP 失败报出什么：`cause.code`、头前重置、体中断、中止、重定向、DNS    | `StreamableHTTPClientTransport`（不跟随重定向）；H10 的错误码集合                                          |
| [p4-everything-sse.mjs](../../../tests/probes/p4-everything-sse.mjs) | 参考服务端 `server-everything` 的 `sse` 与 `streamableHttp` 两种模式在线上怎样答旧 HTTP+SSE 的各个信号 | `SSEClientTransport`；H9 的回退条件                                                                        |
| [p5-sdk-parsing.mjs](../../../tests/probes/p5-sdk-parsing.mjs)       | SDK 的读法原语怎样处置契约 T2 列出的行与消息，以及 SDK 的版本常量                                      | `ReadBuffer`、`StreamableHTTPClientTransport`、`extractWWWAuthenticateParams`、常量、`parseJSONRPCMessage` |

## 运行

在包根 `packages/mcp/mcp-host-local` 运行。三个探针只用本包的 devDependencies 与 Node 自带的模块，不需要构建本包。

```sh
node tests/probes/p3-http-errors.mjs
node tests/probes/p4-everything-sse.mjs
node tests/probes/p5-sdk-parsing.mjs
```

- `p3` 起本机 HTTP 服务端。(h) 一项查一个不存在的主机名，结果取决于本机的 DNS：没有网络时是 `EAI_AGAIN`，有网络时可能是 `ENOTFOUND`。两个码都在 H10 的「离开之前」集合里。
- `p4` 以子进程起 `server-everything`，每种模式用一个空闲的本机端口，结束时按进程组停止它。
- `p5` 不起进程，不开端口。

单次运行的完整输出留在任务的 tmp，不进本目录。

## 关键摘录

版本：`@modelcontextprotocol/client` 与 `@modelcontextprotocol/core` 2.4.0，`@modelcontextprotocol/server-everything` 2.1.0，Node 26.12.0。

`p3`：

```text
(a) refused: TypeError: fetch failed | cause=ECONNREFUSED
(c) reset before head: TypeError: fetch failed | cause=UND_ERR_SOCKET
(d) SSE body destroyed: 1 chunks then TypeError: terminated | cause=UND_ERR_SOCKET
(f) truncated JSON body: TypeError: terminated | cause=UND_ERR_SOCKET
(g) redirect manual: status 302 type=basic location=http://127.0.0.1:<port>/elsewhere
(h) dns: TypeError: fetch failed | cause=EAI_AGAIN
```

连接被拒有码 `ECONNREFUSED`，请求离开之后的重置与体中断是 `UND_ERR_SOCKET`。`redirect: 'manual'` 交出 3xx，不跟随。

`p4`：

```text
sse POST /sse initialize: 404 text/html; charset=utf-8 "...Cannot POST /sse..."
sse GET /sse: 200 text/event-stream
sse endpoint event: "data: /message?sessionId=<id>" -> http://127.0.0.1:<port>/message?sessionId=<id>
sse POST endpoint initialize: 202 - "Accepted"
sse stream carried: "event: message\ndata: {\"result\":{\"protocolVersion\":\"2025-11-25\",...
sse POST endpoint unknown session: 404 application/json; charset=utf-8 "{...\"Session not found\"...}"
http POST /mcp discover: 200 application/json "{\"result\":{\"supportedVersions\":[\"2026-07-28\"],...
```

只会旧 HTTP+SSE 的对端对 `initialize` 的 POST 答「4xx+纯」，GET 答 200 `text/event-stream`，第一个事件是同源的 `endpoint`。endpoint 上的 POST 答 202，应答经 GET 流到达。会话不存在时 endpoint 答 404。

`p5`（版本常量的输出原本跨行，这里合成一行）：

```text
LATEST_PROTOCOL_VERSION 2025-11-25 SUPPORTED_PROTOCOL_VERSIONS [ '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07' ]
ReadBuffer non-JSON then answer: first readMessage -> {"jsonrpc":"2.0","id":"r1","result":{}}
ReadBuffer unreadable error object -> throws ZodError ; next readMessage -> {"jsonrpc":"2.0","id":"r1","result":{}}
parseJSONRPCMessage result+error -> throws ZodError
parseJSONRPCMessage error without code -> throws ZodError
parseJSONRPCMessage result with extra key -> throws ZodError
parseJSONRPCMessage no jsonrpc -> throws ZodError
extractWWWAuthenticateParams "Bearer error=\"insufficient_scope\", scope=\"files:write\"" -> {"scope":"files:write","error":"insufficient_scope"}
extractWWWAuthenticateParams "Basic realm=\"x\"" -> {}
```

`ReadBuffer` 跳过不是 JSON 的行。是 JSON 而信封不合格的行让它抛出 `ZodError`，这一行丢失。`parseJSONRPCMessage` 比契约 T2 更严：多余的键也拒绝。`extractWWWAuthenticateParams` 不读 `Basic` 头的参数。`LATEST_PROTOCOL_VERSION` 是旧修订 `2025-11-25`。
