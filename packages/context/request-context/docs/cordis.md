# Request Context 派生计算与 Cordis

本成员是 `module` 变体。它没有 `src/cordis.ts`，没有 `./cordis` 入口，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定，也不引入 Cordis 依赖。

## 适用性

本成员不需要 Cordis 集成。根入口按 [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 与 Cordis 无关，只导出一个不依赖 Cordis 的工厂与默认策略。理由是变化原因不同：

- 缓存键、按组失效、预计算派生物与默认策略的数值随派生计算的算法变化。
- 服务键、贡献登记的寿命、策略实现按配置的选择与 isolate 绑定随装配约定变化。

独立调用方使用缓存与默认策略时，不应因此加载 Cordis。本成员只比较修订，不从 fiber 或 Context 取任何东西，不读 intercept 配置，不派发事件。这些都由 Cordis 成员替它完成：

- 服务键、抽象类、intercept 配置、变化事件与策略选择的配置形状：[request-context-cordis-contract 的 Cordis 说明](../../request-context-cordis-contract/docs/cordis.md)。
- Service 实现、贡献登记表、策略实现的选择、isolate 绑定与撤除顺序：[request-context-cordis 的 Cordis 说明](../../request-context-cordis/docs/cordis.md)。

以后若需要本成员直接提供 Cordis 绑定，先按组的[成员分解](../../docs/architecture.md#成员分解)重新判断归属，不在本成员里加 `./cordis` 入口。`documentation.json` 把本文件记为 `not-applicable`。
