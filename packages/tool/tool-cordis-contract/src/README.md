# tool-cordis-contract 源码

- [index.ts](index.ts) 是根入口 `.`，不导出值，也不导入 Cordis。
- [cordis.ts](cordis.ts) 是 `./cordis` 入口。它导出 17 个抽象服务定义类和具体类 `ToolInstancesService`，共 18 个、取自各类 `static provide` 的服务键、`Context` 增补和 `tool-cordis-contract/call-changed` 事件增补。`ToolInstancesService` 是具体实例目录，登记与查询在实现前返回具名失败。
- [testing.ts](testing.ts) 是 `./testing` 入口：`ToolInstancesService.register` 的登记语义套件（`toolRegistrationConformance`）、夹具类型 `ToolRegistrationFixture`、守约的非耐久登记服务 `createMemoryToolRegistrations` 和带全部手柄的夹具 `memoryToolRegistrationFixture`。夹具含第二个租户及其 authority，守约替身按授予表核验 authority 与租户的对应。它重新导出 `tool-contract/testing` 的用例类型、`NotApplicable` 与 `runConformanceCase`，以类型导入 `./cordis`，不导入 Tool 实现，运行时不加载 Cordis。
- 本包经 `@omne-harness/tool-contract` 取得类型，不复制公共类型，也不导入任何 Tool 实现。

文档导航见 [index](index.md)。
