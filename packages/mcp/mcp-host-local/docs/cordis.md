# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定或引入 Cordis 依赖。

## 适用性

不适用。本包只导出一个工厂函数；它没有可注入的 Cordis 服务，不拥有 Cordis 生命周期，没有 disposer 需要登记：传输的释放是每个传输的 `close()`，由持有传输的调用方（`@omne-harness/mcp` 的连接表）在关闭连接时调用。MCP 的 Cordis 承载与服务键归宿主成员与组设计，见[组入口](../../README.md#成员与依赖)。以后需要绑定时，改用绑定变体的规则另行设计。
