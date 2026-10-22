# Session 纯契约与 Cordis

本成员没有 `src/cordis.ts`，没有 `./cordis` 入口，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定，也不引入 Cordis 依赖。

## 适用性

本成员不需要 Cordis 集成。根入口按 [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 与 Cordis 无关，只提供值类型、操作类型、端口接口和纯函数。理由是变化原因不同：操作、结果和事件目录随会话治理的语义变，服务键、调用方类、端口怎样被取得和缺席时怎样表现随装配约定变。只用领域值或纯接口的消费者、实现机制的 [session](../../session/README.md) 与独立调用方不应因此加载 Cordis。

Cordis 相关的责任在组内其他成员：

- 服务键 `session`、抽象类 `SessionService`、intercept 配置、端口服务键与提交通知事件：[session-cordis-contract 的 Cordis 说明](../../session-cordis-contract/docs/cordis.md)。
- Service 实现、端口注入与扫描者的单实例绑定：[session-cordis 的 Cordis 说明](../../session-cordis/docs/cordis.md)。
- 不含 Cordis 的治理机制：[session](../../session/README.md)。

四个面与各端口的接口由本成员给出，Cordis 定义成员只给键与抽象类，不复制签名。以后若需要本成员直接提供 Cordis 绑定，先按组的[落位判据](../../docs/architecture.md#落位判据)重新判断归属，不在本成员里加 `./cordis` 入口。
