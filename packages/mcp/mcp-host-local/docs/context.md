# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。它覆盖独立消费与适用的 Harness 接入，引用系统架构与真实消费者，不成为新的架构源。

## 使用方式

最小有效示例见 [README_ZH.md「使用」](../README_ZH.md#使用)。经根入口使用时，必要依赖是契约 `@omne-harness/mcp-contract`（端口类型、协议函数、符合性套件）；初始化只是 `createLocalTransportFactory(options)`，释放是每个传输的 `close()`。经 `./cordis` 插件使用时，另依赖 `@omne-harness/mcp`、`@omne-harness/mcp-cordis-contract`、`@omne-harness/kernel-basis` 与 `@deepseek-ai/cordis`；初始化是 `ctx.plugin(createMcpPlugin(parts), config)`，释放是 `fiber.dispose()`，见 [cordis.md](cordis.md)。经根入口使用时，调用方要准备：

- stdio 材料：落点交来的 `ProcessHandle`（`stdin`、`stdout`、`stderr`、`exited`、`stop`）。传输不起进程，也不停进程。
- Streamable HTTP 材料：连接目标（契约 `ConnectionTarget`）与可选的 `HttpCredentialHandle`。传输只在发出 HTTP 请求（含答复对端请求的 POST）与处理它的应答时调用句柄，`open` 不调用，传输关闭之后也不调用。经根入口使用时，释放句柄归调用方；经插件使用时，句柄由 `createMcp` 经凭据端口取得，撤除时 `closeAll` 释放（[mcp 的 MC-10](../../mcp/SPEC.md#mc-10)）。条款见契约 [T9](../../mcp-contract/SPEC.md#t8-end)，本包的兑现见 SPEC [H4](../SPEC.md#h4)。
- 代际与 `instructionsByteLimit`，两种材料都带。

独立使用：根入口不加载 Cordis，直接 `import` 即可。Harness 接入：Cordis 宿主装载 `./cordis` 入口的 `createMcpPlugin` 插件，插件自己把本包的工厂放进 `McpPorts.transports`，并提供 MCP 的三个服务键，见 [cordis.md](cordis.md)。插件装载的 `createMcp` 经落点端口请落点起进程，经凭据端口取凭据句柄；插件撤除时经 `closeAll` 请落点交出的句柄停止进程，报告确认的范围，不声称进程已停（SPEC [Cordis 插件](../SPEC.md#cordis-plugin)）；不用 Cordis 的装配直接把工厂交给 `createMcp`，见[组工程设计](../../docs/architecture.md)。

## 消费者与定位

```text
Cordis 装配 ──ctx.plugin──► ./cordis ──createMcp──► @omne-harness/mcp（服务实现）
@omne-harness/mcp（服务实现）──McpTransportFactory.open──► @omne-harness/mcp-host-local ──fetch / 管道──► MCP 对端
            │                                                       │
            └──端口类型、协议函数、classifyWireEvent──► @omne-harness/mcp-contract ◄──┘
```

具名消费者：`@omne-harness/mcp` 的连接表（`internal/table.ts`）在建连时调用 `open` 与 `discover`。`./cordis` 入口的消费者是装载插件的 Cordis 装配，它按服务键取三个服务；目前没有应用装配装载它（SPEC「Cordis 插件的验证」的「没有覆盖」）。本包在 MCP 组里是「具体提供者与后端」：它兑现隔离与授权的边界（凭据只进出站请求）、资源所有权（进程归落点、句柄归调用方；经插件使用时，调用方是 `createMcp`）、实际可用性与失败的如实分类。它不决定产品规则：再发、取消、回退与会话的规则都来自契约 SPEC 的条款。
