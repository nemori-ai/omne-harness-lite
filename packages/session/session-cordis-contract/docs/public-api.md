# Session Cordis 定义的公开接口

本页索引本成员的导出，不写第二份签名。服务键、抽象类、intercept 配置、端口服务键与事件的定义在 [Cordis 说明](cordis.md)。四个面的操作类型与端口接口在 [session-contract 的公开接口](../../session-contract/docs/public-api.md)。后继实现接管精确定义时，本页改为源码导航。

## 现有导出

本成员有两个入口。两个入口现在都没有导出，`src/index.ts` 与 `src/cordis.ts` 只有模板标记。

| 入口 | 现有导出 | 说明 |
| --- | --- | --- |
| `@omne-harness/session-cordis-contract` | 无 | 随实现只重导出契约类型，不导入 Cordis |
| `@omne-harness/session-cordis-contract/cordis` | 无 | 承载服务定义 |

两个入口的现状由 [public-entry.spec.ts](../tests/public-entry.spec.ts) 与 [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言。

## 随实现进入的导出

这些导出由 [SPEC](../SPEC.md#唯一性)的性质固定，定义写在 Cordis 说明里。

| 入口 | 导出 | 定义所在 |
| --- | --- | --- |
| 根入口 | 契约词汇所需的类型重导出，没有运行值 | SPEC 的[性质 7](../SPEC.md#唯一性) |
| `./cordis` | 抽象类 `SessionService`，键常量 `session`，四个属性 `work`、`management`、`reconciliation`、`history` | Cordis 说明的[服务定义](cordis.md#服务定义) |
| `./cordis` | 各端口的抽象类与键常量 | Cordis 说明的[端口服务键](cordis.md#端口服务键) |
| `./cordis` | intercept 配置类型 `{ caller: SessionCallerClass }` | Cordis 说明的 [intercept 配置与调用方类](cordis.md#intercept-配置与调用方类) |
| `./cordis` | `Context` 与 `Events` 增补，事件 `session-cordis-contract/committed` | Cordis 说明的[事件](cordis.md#事件) |

## 消费者怎样导入

未来的消费者只从 `@omne-harness/session-cordis-contract/cordis` 导入绑定。领域类型从 `@omne-harness/session-contract` 导入。不从实现包导入 Service。
