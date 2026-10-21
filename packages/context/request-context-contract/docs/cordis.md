# Request Context 纯契约与 Cordis

本成员是 `module` 变体。它没有 `src/cordis.ts`，没有 `./cordis` 入口，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定，也不引入 Cordis 依赖。

## 适用性

本成员不需要 Cordis 集成。根入口按 [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 与 Cordis 无关，只提供值类型、纯操作、端口类型与契约常量。理由是变化原因不同：

- 组装输入、结果、失败与六层布局随请求组装的语义变化。
- 服务键、提示词贡献的登记寿命、策略实现的选择随装配约定变化。

协调者、历史持有者与独立调用方导入本成员时，不应因此加载 Cordis。本成员的全部操作是纯函数，没有需要随插件寿命登记或撤除的东西。

Cordis 相关的责任在组内其他成员：

- 服务定义 `requestContext`、提示词贡献登记面与策略选择：[request-context-cordis-contract 的 Cordis 说明](../../request-context-cordis-contract/docs/cordis.md)。
- 不含 Cordis 的派生计算、缓存与默认策略：[request-context](../../request-context/README.md)。
- Service 实现、贡献登记表、作用域遮蔽与 isolate 绑定：[request-context-cordis](../../request-context-cordis/README.md)。

以后若需要本成员直接提供 Cordis 绑定，先按组的[成员分解](../../docs/architecture.md#成员分解)重新判断归属，不在本成员里加 `./cordis` 入口。`documentation.json` 把本文件记为 `not-applicable`。
