# tests/fixtures

本目录承载测试使用的对端夹具：A 层是真实线路上的脚本化对端，B 层是 SDK 的真实服务端。

## 允许的内容

在进程内或子进程里起服务端的 TypeScript 模块，以及子进程登记的辅助代码。

## 边界

夹具不能代替规格。A 层对端按契约 `./testing` 的 `PeerScript` 答复，挑选规则与契约的内存脚本化对端相同；它只描述对端在 JSON-RPC 与 HTTP 层怎样答，不描述 SDK。B 层对端是 `@modelcontextprotocol/server`、`@modelcontextprotocol/node` 与 `server-everything` 的真实实例；它们的行为归 SDK，测试对它们的断言是「本传输与 SDK 对端互通」的读数。HTTP 夹具只用 20000–59999 的端口（`fetch` 拒绝 WHATWG 的 bad ports，本机的临时端口范围从 1024 起）。

## 维护

契约 `PeerReply` 加种类时同步 `scripted/http.ts`；SDK 升级时核对 `sdk/` 的 API；新起的进程与服务端要登记到 `scripted/children.ts` 或 `scripted/http.ts` 的集合，供 `afterEach` 核对遗留。

## 本包事实

辅助：`settle.ts`（受管辖的等待落定的上界 `SETTLE_BOUND_MS` 与 `settledWithin`）。A 层：`scripted/http.ts`（`node:http` 对端，含旧 HTTP+SSE；`sseNoise` 选项让应答流先送一个带同一请求号的 `ping` 事件作诱饵。对端交出一个传输工厂 `factory`，它的 `fetch` 给每个请求编号，编号放在请求头 `x-omne-fixture-request` 里，对端按编号记下两件事：`handle()` 结算，应答的 `close` 事件。一个请求在 `handle()` 结算之后算记完；客户端中止了它时，还要等应答关闭；`fetch` 失败而对端没有收到它时，也算记完。`received()` 等此前开始的请求都记完，再让出一个事件循环轮次；这一轮有新请求开始、有请求被中止或到达对端时，再等一遍。等待的上限是 5 秒，到时以错误拒绝，消息列出没有记完的请求编号、地址和缺的事件。不经 `factory` 的请求不计入。选项 `beforeRecord` 在对端记下请求之前调用：夹具自己的用例用它晚记请求，`cordis-journey.spec.ts` 用它看到对端收到了调用）、`scripted/children.ts`。B 层：`sdk/bearer-http.ts`、`sdk/legacy-http.ts`、`sdk/everything.ts`。负责人：本成员的维护者。B 层的 `server-everything` 带任务工具：现代修订上的任务操作由 [../e2e/README.md](../e2e/README.md) 的旅程步 S5 验证，传输层的任务请求形状仍由 A 层验证。
