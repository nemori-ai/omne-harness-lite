# Session Cordis 定义的公开接口

本页索引本成员的导出，不写第二份签名。服务键、抽象类、intercept 配置、端口服务键与事件的定义在 [Cordis 说明](cordis.md)；精确定义归 [src/cordis.ts](../src/cordis.ts)。四个面的操作类型与端口接口在 [session-contract 的公开接口](../../session-contract/docs/public-api.md)。

## 现有导出

| 入口 | 导出 | 源文件 |
| --- | --- | --- |
| `@omne-harness/session-cordis-contract` | 契约类型的重导出（`export type *`），没有运行值，不导入 Cordis | [src/index.ts](../src/index.ts) |
| `@omne-harness/session-cordis-contract/cordis` | `SessionService` 与 `sessionKey`；`SessionAccessCheckService`、`SessionTransactionPortService`、`SessionInternalPrincipalsService`、`SessionIdentityBridgeService`、`SessionEvidenceBridgeService`、`SessionClockService`、`SessionIdleInputService`、`SessionContextInputService`、`SessionNotifierService`、`AgentDrivePortService`、`ScopeReleasePortService` 与各自的键常量；`SessionIntercept`；`Context` 与 `Events` 增补，事件 `session-cordis-contract/committed` | [src/cordis.ts](../src/cordis.ts) |

两个入口的导出集合由 [public-entry.spec.ts](../tests/public-entry.spec.ts) 与 [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言。`sessionAccessCheckKey` 已从 `SessionAccessCheckService.provide` 导出。其真实 Context 装卸与检查委派由 [access-check.spec.ts](../tests/access-check.spec.ts) 覆盖，生产必需注入仍未交付，见 [SPEC 当前访问检查装配](../SPEC.md#当前访问检查的装配)。

## 受信服务键

- `./cordis` 导出 `SessionDelegatedTransactionsService`、`SessionWorkPrincipalsService`、`SessionPrincipalBindingsService` 与各自的键常量 `sessionDelegatedTransactionsKey`、`sessionWorkPrincipalsKey`、`sessionPrincipalBindingsKey`。三个键只在装配的受信子树内可见，见 [Cordis 说明的受信服务键](cordis.md#受信服务键)。
- `./testing` 导出 `createMemorySessionPrincipalBindings` 与 `sessionPrincipalBindingsConformance`、`createMemorySessionWorkPrincipals` 与 `sessionWorkPrincipalsConformance`。

## 消费者怎样导入

消费者只从 `@omne-harness/session-cordis-contract/cordis` 导入绑定。领域类型从 `@omne-harness/session-contract` 导入。不从实现包导入 Service。

## 采用来源三口与游标签名

- `./cordis` 增加 `SessionAdoptionSourceService`、`SessionProductionSourceService`、`SessionCustodySourceService` 与 `SessionCursorSigningService` 及各自键常量，`SessionTransactionPortService` 增加三个方法的投影。
- 根入口重导出 [src/cursor-signing.ts](../src/cursor-signing.ts) 的类型。
- `./testing` 导出 `createFixedSessionCursorSigning` 与 `sessionCursorSigningConformance`。固定键为公开测试字节，keyId 为 `test-session-cursor-1` 与 `test-session-cursor-2`，不得进入生产插件树。
- 换代与卸载后的旧调用（含在途调用）不返回看似当前的成功：换代答 `invalid`，卸载答 `unavailable`，见 [SPEC 游标签名](../SPEC.md#游标签名)。
