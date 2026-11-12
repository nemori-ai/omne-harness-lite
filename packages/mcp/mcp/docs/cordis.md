# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定或引入 Cordis 依赖。

## 适用性

不适用。本包的服务是对象字面量，由 `createMcp` 从端口建立；它没有可注入的 Cordis 服务，也不拥有 Cordis 生命周期。进程与传输的清理由 `connections.closeAll()` 完成，由持有实例的一方在退出或撤除时调用；Cordis 装配里是 mcp-host-local 的插件。MCP 的服务定义与服务键属于 mcp-cordis-contract，插件在 mcp-host-local 的 `./cordis` 入口，见[组入口](../../README.md#成员与依赖)。
