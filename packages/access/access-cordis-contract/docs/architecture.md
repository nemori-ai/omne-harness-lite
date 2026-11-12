# 内部架构

## 模块与依赖

| 模块 | 责任 |
| --- | --- |
| `src/contribution.ts` | 贡献、处理函数、上下文、帧来源的类型，从公开契约的 `OperationContract`、`ObservationContract`、`Codec` 推出；不透明的 `LoginIdentity`、`Principal`；`AccessAssemblyError` |
| `src/cordis.ts` | `AccessRegistryService`：`mount` 的效应绑定与受保护的 `attach` |
| `src/index.ts` | 根入口，只转出 `contribution.ts` |

只依赖 `@omne-harness/public-contract` 与 `@deepseek-ai/cordis`。

## 关键机制与理由

- **效应绑定写在服务定义里。** 「插件卸载就是撤下」只写在 `mount` 一处，每个提供者只实现 `attach`。这样领域的接入插件不可能忘了撤下，提供者也不可能把撤下绑错作用域。
- **管道的方法不在这里。** `enter` 与 `subscribe` 只在服务端接入的提供者上，领域在类型上就碰不到它们。
- **类型从契约推出。** 处理函数的参数与答复不另写一份，所以契约变了，贡献跟着编不过，不会悄悄失配。

## 验证与维护

见 [SPEC.md](../SPEC.md#组合与验证)。公开契约的契约类型变了，同步 `src/contribution.ts` 与 `tests/contribution.spec-d.ts`。
