# Cordis 集成

本包是 `module` 变体。它没有 `./cordis` 入口，也不依赖 `@deepseek-ai/cordis`。本文件存在，不会生成 Cordis 绑定，也不会引入 Cordis 依赖。

## 适用性

不适用。本包只提供纯契约：公开类型、品牌身份、契约判定、声明构造、确定性投影、默认 codec 与结果政策，以及 `./testing` 的端口一致性套件。它不提供 Service、事件、插件或 Context 行为，也不承担依赖注入、启动、撤除或资源清理责任。根入口、`./binding` 与 `./testing` 的源码、产物与声明导入图都不含 Cordis，由 [tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查。

Tool 的抽象服务定义、21 个服务键（含外层调用方的启动围栏 `toolStartFence`）、事件增补与 `ToolInstancesService` 归 [tool-cordis-contract](../../tool-cordis-contract/docs/cordis.md)。编写 Cordis 插件的消费者依赖该包与本包。本文件在 `documentation.json` 中记为 `not-applicable`。
