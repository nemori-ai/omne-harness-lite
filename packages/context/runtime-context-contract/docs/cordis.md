# Runtime Context 纯契约与 Cordis

本成员是 `module` 变体。它没有 `src/cordis.ts`，没有 `./cordis` 入口，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定，也不引入 Cordis 依赖。

## 适用性

本成员不需要 Cordis 集成。根入口按 [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 与 Cordis 无关，只提供词汇类型与纯函数。理由是变化原因不同：块声明、需要与读取结果随语义变，服务键、生产者登记的效应与代际、消费者类的读取方式随装配约定变。语义拥有者包和独立调用方导入块声明时，不应因此加载 Cordis。

Cordis 相关的责任在组内其他成员：

- 服务定义 `runtimeContext`、intercept 配置与事件：[runtime-context-cordis-contract 的 Cordis 说明](../../runtime-context-cordis-contract/docs/cordis.md)。
- 不含 Cordis 的供给机制：[runtime-context](../../runtime-context/README.md)。
- Service 实现与 isolate 绑定：[runtime-context-cordis](../../runtime-context-cordis/README.md)。

以后若需要本成员直接提供 Cordis 绑定，先按组的[成员分解](../../docs/architecture.md#成员分解)重新判断归属，不在本成员里加 `./cordis` 入口。`documentation.json` 把本文件记为 `not-applicable`。
