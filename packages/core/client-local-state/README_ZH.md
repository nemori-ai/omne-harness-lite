# @omne-harness-lite/client-local-state

[English](README.md)

客户端持久选择、登录材料及读取副本的公共契约。提供者签发归实例所有的快照，并支持比较后替换。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/client-local-state": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                          | 用途                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `LocalRecord`, `CachedRead`, `LocalSnapshot`, `SnapshotToken` | 存储数据与实例拥有的快照凭证                                                        |
| `ClientLocalState`, `ReadOutcome`, `ReplaceOutcome`           | 读取与有条件的持久替换                                                              |
| `ClientStateUsageDefect`                                      | 关闭实例或无效快照的使用错误                                                        |
| `LocalStateStorageFactory`, `LocalStateStorage`               | 私有持久 SQLite 存储的所有权接口                                                    |
| `./cordis`: `ClientLocalStateService`, `ClientStateStorage`   | 共享 Service 与 `CLIENT_LOCAL_STATE_SERVICE`、`CLIENT_STATE_STORAGE_SERVICE` 服务键 |

## 示例

```ts
import type { ClientLocalState } from '@omne-harness-lite/client-local-state'

export async function replaceSelection(
  state: ClientLocalState,
  value: unknown,
  operationId: string,
) {
  const reading = await state.read()
  if (reading.kind === 'failed') return reading
  return state.compareAndReplace(reading.snapshot.token, value, operationId)
}
```

调用方提供存活的提供者及有效操作标识。须保留冲突与未确认结果，不得伪造票据或复用其他实例的票据。

## 边界与生命周期

快照与记录可能包含 bearer 凭据，不得完整输出。无效记录或不支持的格式不能折成成功的空状态。

有条件替换须使用存活提供者签发的票据。`unconfirmed` 不表示安装失败，调用方须遵循恢复契约。

存储工厂以完整持久性打开私有 SQLite 文件，不应用治理中心迁移。返回存储的所有权交给本地状态提供者。精确数据、持久性与失败要求归 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/client-local-state run build
pnpm --filter @omne-harness-lite/client-local-state run typecheck
pnpm --filter @omne-harness-lite/client-local-state run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [SQLite 本地状态提供者](../../frontend/client-local-state-sqlite/README.md)
