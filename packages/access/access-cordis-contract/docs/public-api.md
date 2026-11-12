# 公开接口导航

## 导出入口

| 入口 | 内容 |
| --- | --- |
| `@omne-harness/access-cordis-contract` | 类型与一个错误类，不导入 Cordis |
| `@omne-harness/access-cordis-contract/cordis` | 登记表的 Cordis 服务定义 |

## 定义索引

| 导出 | 种类 | 定义位置 |
| --- | --- | --- |
| `AccessContribution`、`OperationHandler`、`CallContext`、`BodyOf`、`AnswerOf` | 类型 | [src/contribution.ts](../src/contribution.ts) |
| `FrameSource`、`ObservationContext`、`OpenOf`、`FrameOf`、`EndOf` | 类型 | [src/contribution.ts](../src/contribution.ts) |
| `ProtocolKey`、`LoginIdentity`、`Principal`、`PrincipalFor` | 类型 | [src/contribution.ts](../src/contribution.ts) |
| `AccessAssemblyError` | 类 | [src/contribution.ts](../src/contribution.ts) |
| `AccessRegistryService`、`accessRegistryKey` | 抽象 `Service` 与服务名 | [src/cordis.ts](../src/cordis.ts) |

行为见 [SPEC.md](../SPEC.md)。`api/` 下的快照由 `pnpm run contract:api --write` 从 `dist` 的声明生成。
