# tests/fixtures 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：夹具的两层、来源与约束
- [process.ts](process.ts)：子进程作为 `ProcessHandle`：管道作 web 流，stderr 先经钩子再进句柄
- [settle.ts](settle.ts)：受管辖的等待在多长时间内落定的上界，与按上界判定落定的 `settledWithin`
- `scripted/`（A 层）
  - [stdio-peer.mjs](scripted/stdio-peer.mjs)：真实管道上的脚本化对端，收到的内容以 `@omne ` 行经 stderr 回报
  - [special-stdio.mjs](scripted/special-stdio.mjs)：写非 JSON、写超长行、关 stdout 存活、按时机退出的 stdio 对端
  - [stdio.ts](scripted/stdio.ts)：起 stdio 对端、`unsent` 的预判（只有第一次交换可实现）、`received()`
  - [http.ts](scripted/http.ts)：`node:http` 上的脚本化对端：JSON/SSE/任意状态/well-known/`unsent` 预判/`stream-aborted` 记录/旧 HTTP+SSE 的流与 endpoint；`listenFree`
  - [children.ts](scripted/children.ts)：子进程登记与遗留核对
- `sdk/`（B 层）
  - [modern-stdio.mjs](sdk/modern-stdio.mjs)：`serveStdio` 的现代对端（`echo`、`slow`、`crash`）
  - [legacy-stdio.mjs](sdk/legacy-stdio.mjs)：`McpServer.connect(new StdioServerTransport())` 的 2025 对端
  - [bearer-http.ts](sdk/bearer-http.ts)：`createMcpHandler` + `requireBearerAuth` 的网关与 RFC 9728 元数据
  - [legacy-http.ts](sdk/legacy-http.ts)：`NodeStreamableHTTPServerTransport` 的 2025 会话，`DELETE` 结束会话
  - [everything.ts](sdk/everything.ts)：`server-everything` 的 `stdio`、`sse`、`streamableHttp` 三种模式
