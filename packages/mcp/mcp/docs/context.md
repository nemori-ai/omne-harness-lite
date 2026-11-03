# 使用与定位

本包是 MCP 组的通用实现成员，位于契约成员之上、宿主成员之下：它依赖 `@omne-harness/mcp-contract` 与公共值成员，`@omne-harness/mcp-host-local` 为它提供传输工厂与端口实现。组的成员与依赖见[组入口](../../README.md#成员与依赖)。

## 使用方式

宿主从公开根取 `createMcpCore(ports, config)`，交出 `inspection`、`discovery`、`status`、`connections`。`ports` 是契约的 `McpPorts`：四个组外端口的实现方见[领域交接设计](../../../../docs/domains/mcp/architecture.md)，`store` 可以用本包的 `createInMemoryCatalogStore()`，`transports` 由宿主成员提供。初始化没有外部效果；第一次 `refresh` 才建立连接。宿主退出时调用 `connections.closeAll()`。最小示例见包根 README。

独立使用不需要 Cordis。Cordis 装配时由宿主把本包的服务作为插件提供；本包没有 `cordis.ts`。

## 消费者与定位

本包不点名调用方。它的具名消费者是 `@omne-harness/mcp-host-local`（装配与端口实现）和下一波在成员内接入的调用口。组内的位置：契约 → 本包 → 宿主。
