# tests/fixtures

本目录承载测试使用的对端夹具：A 层是真实线路上的脚本化对端，B 层是 SDK 的真实服务端。

## 允许的内容

子进程脚本（`.mjs`，由 Node 直接运行）、在进程内起服务端的 TypeScript 模块，以及进程句柄与子进程登记的辅助代码。

## 边界

夹具不能代替规格。A 层对端按契约 `./testing` 的 `PeerScript` 答复，挑选规则与契约的内存脚本化对端相同；它只描述对端在 JSON-RPC 与 HTTP 层怎样答，不描述 SDK。B 层对端是 `@modelcontextprotocol/server`、`@modelcontextprotocol/node` 与 `server-everything` 的真实实例；它们的行为归 SDK，测试对它们的断言是「本传输与 SDK 对端互通」的读数。HTTP 夹具只用 20000–59999 的端口（`fetch` 拒绝 WHATWG 的 bad ports，本机的临时端口范围从 1024 起）。

## 维护

契约 `PeerReply` 加种类时同步 `scripted/stdio-peer.mjs` 与 `scripted/http.ts`；SDK 升级时核对 `sdk/` 的 API；新起的进程与服务端要登记到 `scripted/children.ts` 或 `scripted/http.ts` 的集合，供 `afterEach` 核对遗留。

## 本包事实

辅助：`settle.ts`（受管辖的等待落定的上界 `SETTLE_BOUND_MS` 与 `settledWithin`）。A 层：`scripted/stdio-peer.mjs`（按脚本答的 stdio 对端，经 stderr 回报。每读完 stdin 的一块，先回报这块里的各行，再回报读过的总字节数 `{"kind":"consumed","bytes":<n>}`。第四个参数是每条回报的延迟毫秒数，缺省 0）、`scripted/special-stdio.mjs`（脚本说不出的行为）、`scripted/http.ts`（`node:http` 对端，含旧 HTTP+SSE；`sseNoise` 选项让应答流先送一个带同一请求号的 `ping` 事件作诱饵）、`scripted/stdio.ts`（起 stdio 对端。对端的 stdin 只有调用方经 `handle.stdin` 写。`received()` 先等调用方此前写进 `handle.stdin` 的行都交给子进程的 stdin，再等对端回报读过的字节数达到父进程这一端写出的字节数；对端已退出，或父进程这一端的 stdin 已关闭时，改等子进程的管道关闭。两种等待都有上限，缺省 10 秒，可用选项 `confirmWithinMs` 改；选项 `recordDelayMs` 设对端的回报延迟，只给夹具自己的用例用）、`scripted/children.ts`、`process.ts`。B 层：`sdk/modern-stdio.mjs`、`sdk/legacy-stdio.mjs`、`sdk/bearer-http.ts`、`sdk/legacy-http.ts`、`sdk/everything.ts`。负责人：本成员的维护者。B 层的 `server-everything` 带任务工具：现代修订上的任务操作由 [../e2e/README.md](../e2e/README.md) 的旅程步 S5 验证，传输层的任务请求形状仍由 A 层验证。
