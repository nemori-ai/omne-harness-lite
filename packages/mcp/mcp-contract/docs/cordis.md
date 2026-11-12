# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定或引入 Cordis 依赖。

## 适用性

不适用。本包只有类型、纯函数与测试设施，不持有服务、资源或生命周期，所以没有可注入的服务，也没有需要撤除的资源。MCP 的服务定义与服务键属于 `mcp-cordis-contract`，组设计见[组入口](../../README.md#成员与依赖)。
