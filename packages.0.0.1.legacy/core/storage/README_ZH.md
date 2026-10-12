# @omne-harness-lite/storage

根入口保持纯定义。`./cordis` 公开共享 Service 与唯一服务键，行为见[集成承诺](SPEC.md)。

[English](README.md)

面向消费者与提供者的存储协议：Kysely 事务视图、显式锁、分类失败、迁移组合、预检与快照接口，以及提供者符合性套件。本包不打开数据库，也不实现存储提供者。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/storage": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 公开 API                                                             | 用途                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Storage`、`ReadTx`、`WriteTx`、`narrow<DB>`                         | 读写事务协议与消费者拥有的表类型                                                                            |
| `AtomicStorage`、`StorageUnit`、`StorageInstance`                    | 显式共同事务扩展与实例生命周期                                                                              |
| 四类存储异常、`mapStorageError`                                      | 区分不可用、唯一冲突、引用违反与缺陷                                                                        |
| `MigrationFragment`、`composeMigrations`、`composedMigrationName`    | 顺序组合 Kysely 迁移                                                                                        |
| `PreflightCheck`、快照类型、`SnapshotFailure`、`checkSnapshotTables` | 提供者／数据拥有者的维护契约与结构检查                                                                      |
| `./conformance`                                                      | `describeStorageConformance`、`describeAtomicStorageConformance`；调用方传入 Vitest runner 与真实提供者工厂 |

## 使用示例

每个 TypeScript 示例独立完整，使用构建后的公开导出。

### 通过类型化事务消费提供者

```ts
import { narrow, type Storage } from '@omne-harness-lite/storage'

interface Tables {
  counters: { id: string; value: number }
}
export async function increment(storage: Storage, id: string): Promise<number> {
  return storage.write(async tx => {
    await tx.lockRow('counters', { id })
    const db = narrow<Tables>(tx)
    const row = await db
      .selectFrom('counters')
      .select('value')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    const next = row.value + 1
    await db.updateTable('counters').set({ value: next }).where('id', '=', id).execute()
    return next
  })
}
```

这是可复用消费者函数，需传入提供者，并事先存在 `counters` 行。`narrow` 只是类型断言，不创建或检查表。`lockRow` 不会锁住缺失行。

### 组合具名迁移，无需打开数据库

```ts
import { composeMigrations, type MigrationFragment } from '@omne-harness-lite/storage'

const fragments: readonly MigrationFragment[] = [
  {
    name: 'counter-table',
    migration: {
      async up(db) {
        await db.schema
          .createTable('counters')
          .addColumn('id', 'text', column => column.primaryKey())
          .addColumn('value', 'integer', column => column.notNull())
          .execute()
      },
    },
  },
]
const provider = composeMigrations(fragments)
console.log(Object.keys(await provider.getMigrations())) // ['0001_counter-table']
```

组合不会执行迁移。应用需把返回的 provider 交给自己的数据库迁移运行器。

### 只映射不可用失败

```ts
import { mapStorageError, StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'

console.log(mapStorageError(new StorageUnavailable('offline'), 'storage-unavailable'))
// { failure: 'storage-unavailable' }
const defect = new StorageDefect('unknown column')
try {
  mapStorageError(defect, 'storage-unavailable')
} catch (error) {
  console.log(error === defect) // true: the original defect is rethrown
}
```

## 边界与失败处理

`read` 要求在一个已提交快照上读取，并拒绝写入。`write` 在回调正常返回时提交，抛出时回滚并原样重抛。符合协议的提供者在调用方处理 `UniqueViolation` 或 `ReferenceViolation` 后，仍允许同一事务继续使用。这些是对提供者的要求，不是导入协议就能获得的保证。

`StorageUnavailable` 表示不可用，`UniqueViolation` 携带具名约束，`ReferenceViolation` 区分 `missing-target` 与 `delete-restricted`。`StorageDefect` 及意外异常继续上抛。`mapStorageError` 只映射第一类。组合内迁移片段名必须唯一，重复即抛异常；发布后的顺序必须稳定。

`atomic` 是显式可选扩展：参与方须使用同一存储实例，等待串行的 `unit.run`，并在自己的 run 边界内处理可恢复冲突。异常逃出该边界后，即使祖先捕获也不能提交。普通 `read`／`write` 不会隐式加入共同事务。`afterCommit` 是尽力通知，不提供可靠投递，也不得携带秘密。快照 API 定义借用资源的生命周期与分类物理失败；实际持久性、取消、清理和数据库行为需要针对提供者验证。

## 开发

```sh
pnpm --filter @omne-harness-lite/storage run build
pnpm --filter @omne-harness-lite/storage run typecheck
pnpm --filter @omne-harness-lite/storage run test
```

先构建 workspace 依赖。这些检查覆盖本包；组合行为需针对实际消费者与提供者验证。
