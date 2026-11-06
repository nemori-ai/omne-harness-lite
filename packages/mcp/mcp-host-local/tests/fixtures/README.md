# tests/fixtures

本目录承载测试使用的对端夹具：A 层是真实线路上的脚本化对端，B 层是 SDK 的真实服务端。

## 允许的内容

子进程脚本（`.mjs`，由 Node 直接运行）、在进程内起服务端的 TypeScript 模块，以及进程句柄与子进程登记的辅助代码。

## 边界

夹具不能代替规格。A 层对端按契约 `./testing` 的 `PeerScript` 答复，挑选规则与契约的内存脚本化对端相同；它只描述对端在 JSON-RPC 与 HTTP 层怎样答，不描述 SDK。B 层对端是 `@modelcontextprotocol/server`、`@modelcontextprotocol/node` 与 `server-everything` 的真实实例；它们的行为归 SDK，测试对它们的断言是「本传输与 SDK 对端互通」的读数。HTTP 夹具只用 20000–59999 的端口（`fetch` 拒绝 WHATWG 的 bad ports，本机的临时端口范围从 1024 起）。

## 维护

契约 `PeerReply` 加种类时同步 `scripted/stdio-peer.mjs` 与 `scripted/http.ts`；SDK 升级时核对 `sdk/` 的 API；新起的进程与服务端要登记到 `scripted/children.ts` 或 `scripted/http.ts` 的集合，供 `afterEach` 核对遗留。

## 本包事实

辅助：`settle.ts`（受管辖的等待落定的上界 `SETTLE_BOUND_MS` 与 `settledWithin`）。A 层：`scripted/stdio-peer.mjs`（按脚本答的 stdio 对端，经 stderr 回报）、`scripted/special-stdio.mjs`（脚本说不出的行为）、`scripted/http.ts`（`node:http` 对端，含旧 HTTP+SSE；`sseNoise` 选项让应答流先送一个带同一请求号的 `ping` 事件作诱饵）、`scripted/stdio.ts`、`scripted/children.ts`、`process.ts`。B 层：`sdk/modern-stdio.mjs`、`sdk/legacy-stdio.mjs`、`sdk/bearer-http.ts`、`sdk/legacy-http.ts`、`sdk/everything.ts`。负责人：本成员的维护者。B 层的 `server-everything` 带任务工具：现代修订上的任务操作由 `../e2e/` 的旅程步 S5 验证，传输层的任务请求形状仍由 A 层验证。
