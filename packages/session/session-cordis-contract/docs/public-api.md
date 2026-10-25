# Session Cordis 定义的公开接口

本页索引本成员的导出，不写第二份签名。服务键、抽象类、intercept 配置、端口服务键与事件的定义在 [Cordis 说明](cordis.md)；精确定义归 [src/cordis.ts](../src/cordis.ts)。四个面的操作类型与端口接口在 [session-contract 的公开接口](../../session-contract/docs/public-api.md)。

## 现有导出

| 入口 | 导出 | 源文件 |
| --- | --- | --- |
| `@omne-harness/session-cordis-contract` | 契约类型的重导出（`export type *`），没有运行值，不导入 Cordis | [src/index.ts](../src/index.ts) |
| `@omne-harness/session-cordis-contract/cordis` | `SessionService` 与 `sessionKey`；`SessionTransactionPortService`、`SessionInternalPrincipalsService`、`SessionIdentityBridgeService`、`SessionEvidenceBridgeService`、`SessionClockService`、`SessionIdleInputService`、`SessionContextInputService`、`SessionNotifierService`、`AgentDrivePortService`、`ScopeReleasePortService` 与各自的键常量；`SessionIntercept`；`Context` 与 `Events` 增补，事件 `session-cordis-contract/committed` | [src/cordis.ts](../src/cordis.ts) |

两个入口的导出集合由 [public-entry.spec.ts](../tests/public-entry.spec.ts) 与 [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言。被替代的 `sessionToolStartFence`（已被替代）与 `sessionDeliveryRelease`（已被替代）不定义，见 [session-contract SPEC 的被替代的协议](../../session-contract/SPEC.md#被替代的协议)。

## 消费者怎样导入

消费者只从 `@omne-harness/session-cordis-contract/cordis` 导入绑定。领域类型从 `@omne-harness/session-contract` 导入。不从实现包导入 Service。
