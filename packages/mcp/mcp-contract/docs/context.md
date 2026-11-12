# 使用与定位

本包是 MCP 组的契约成员，位于组依赖方向的底部：`@omne-harness/mcp`（通用实现）与 `@omne-harness/mcp-host-local`（本地宿主）依赖它，它只依赖公共值成员与 `@omne-harness/assets`。组的成员与依赖见[组入口](../../README.md#成员与依赖)。

## 使用方式

调用方从公开根取值、结局与服务接口；资产登记从公开根取 `mcpEndpointBodyContract()` 登记类别 `mcp`；端口实现方从 `./provider` 取端口类型，并在测试里用 `./testing` 的套件证明合规。本包不需要初始化与释放，示例见包根 README。

## 消费者与定位

本包不点名调用方。它在组内的消费者是 `@omne-harness/mcp` 与 `@omne-harness/mcp-host-local`；四个组外需求端口的实现方见[领域交接设计](../../../../docs/domains/mcp/architecture.md)。
