# @omne-harness-lite/client-local-state-sqlite

[English](README.md)

客户端本地选择、登录材料与读取副本的持久 SQLite 提供者。独立工厂与 Cordis 插件使用同一实现。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/client-local-state-sqlite": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                                          | 用途                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------ |
| `openClientLocalState`                                                                        | 通过调用方提供的私有存储工厂打开状态 |
| `OpenClientLocalStateOptions`, `OpenClientLocalStateDependencies`, `ClientLocalStateInstance` | 目录、存储依赖与读取／CAS／关闭接口  |
| `ClientStateOpenFailure`                                                                      | 分类打开失败                         |
| `./cordis`: `clientLocalStatePlugin`, `managedClientLocalStatePlugin`                         | 独立与装配管理绑定                   |

## 示例

```ts
import type { LocalStateStorageFactory } from '@omne-harness-lite/client-local-state'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'

export async function readLocalRevision(directory: string, storage: LocalStateStorageFactory) {
  const state = await openClientLocalState({ directory }, { storage })
  try {
    const reading = await state.read()
    if (reading.kind === 'failed') return reading
    return { kind: 'revision' as const, revision: reading.snapshot.revision }
  } finally {
    await state.close()
  }
}
```

调用方提供可信父目录下的专用目录及符合契约的 SQLite 工厂。示例只返回修订信息与分类失败。

## 边界与生命周期

私有目录使用受限权限。存储须提供完整持久性，不应用中心迁移。返回的存储归本实例所有，不能另行关闭。

读取与比较后替换遵循公共[本地状态契约](../../core/client-local-state/SPEC.md)。票据归一个存活实例。损坏数据不自动重置成空状态；安装未确认时保留不确定性。

`close()` 停止准入，并等待实际写入、持久化工作与存储关闭。两种绑定均依赖 `clientStateStorage`；管理绑定还依赖装配 lifetime 端口。详见 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/client-local-state-sqlite run build
pnpm --filter @omne-harness-lite/client-local-state-sqlite run typecheck
pnpm --filter @omne-harness-lite/client-local-state-sqlite run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

测试使用真实临时 SQLite 文件及文件系统权限，不据此证明所有文件系统上的生产持久性。

## 相关包

- [公共定义](../../core/client-local-state/README.md)
- [治理客户端协调者](../governance-client-operations-local/README.md)
