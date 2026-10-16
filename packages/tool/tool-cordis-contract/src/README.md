# tool-cordis-contract 源码

- [index.ts](index.ts) 是根入口 `.`，不导出值，也不导入 Cordis。
- [cordis.ts](cordis.ts) 是 `./cordis` 入口。它导出 18 个服务定义类、取自各类 `static provide` 的服务键、`Context` 增补和 `tool-cordis-contract/call-changed` 事件增补。`ToolInstancesService` 是具体实例目录，登记与查询在实现前返回具名失败。
- 本包经 `@omne-harness/tool-contract` 取得类型，不复制公共类型，也不导入任何 Tool 实现。

文档导航见 [index](index.md)。
