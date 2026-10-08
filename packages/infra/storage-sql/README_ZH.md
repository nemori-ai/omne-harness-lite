# @omne-harness-lite/storage-sql

根入口公开独立 SQL 提供者。`./cordis` 公开两个拥有插件、纯数据 `StorageSqlPluginConfig` 和借用绑定 `SqlStorageService`。服务键及资源服务归 `@omne-harness-lite/storage/cordis`。见[集成承诺](SPEC.md)。

[English](README.md)

共享[存储协议](../../core/storage/README.md)的 Kysely 提供者：文件 SQLite 使用 Node 内置 `node:sqlite`，PostgreSQL 使用 `pg`。公开读写事务、显式共同事务单元、迁移、Cordis 服务，以及可选的属主升级与 SQLite 快照维护。

本包当前是私有、尚未发布的 ESM workspace 成员。构建检出后，从 workspace 消费者通过公开包名导入；目前没有可用的 npm 发布版本。Node 与 pnpm 工具链见[开发指南](../../../docs/development.md)。消费者也要声明自己导入的公开包，例如 `kysely` 和 `@omne-harness-lite/storage`。

## 公开 API

| 用途             | 导出                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 直接提供者       | `openStorage`, `OpenStorageOptions`, `SqlStorage`, `StorageSqlConfig` （运行时 schema 与类型）                                                                               |
| Cordis 服务      | `./cordis`: `storageSqlPlugin`, `managedStorageSqlPlugin`, `StorageSqlPluginConfig`, `SqlStorageService` |
| 属主升级         | `createUpgradeGuard`, `UpgradeGuard`, `UpgradeGuardNotAttached`, `StorageStartupFailure`, `StorageStartupStage`, `StorageSqlLogger`; `storage`: `UpgradeConfirmation`, `UpgradePending` |
| 底层 SQLite 接入 | `NodeSqliteDialect`, `NodeSqliteDriver`, `NodeSqliteDialectOptions`                                                                                                          |
| 错误翻译         | `translateSqliteError`, `translatePgError`                                                                                                                                   |
| SQLite 检查      | `openSnapshotInspection`, `storageSnapshotCheck`, `STORAGE_SNAPSHOT_TABLES`                                                                                                  |

提供者拥有数据库句柄、事务边界、方言行为和已配置迁移的执行。应用拥有自己的表和迁移。存储错误、`narrow<DB>()` 与迁移组合由 `@omne-harness-lite/storage` 导出。

## 提交、共享事务与回滚

这个完整例子创建并移除临时 SQLite 数据库。`upgrade: false` 明确关闭这份可丢弃夹具的属主机制与升级快照；生产存储应使用下个例子的守卫。

```ts
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MigrationProvider } from 'kysely/migration'
import { StorageUnavailable, narrow } from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'

interface Tables {
  notes: { id: string; title: string }
}
const migrations: MigrationProvider = {
  async getMigrations() {
    return {
      '0001_notes': {
        async up(db) {
          await db.schema
            .createTable('notes')
            .ifNotExists()
            .addColumn('id', 'text', c => c.primaryKey())
            .addColumn('title', 'text', c => c.notNull())
            .execute()
        },
      },
    }
  },
}
const directory = await mkdtemp(join(tmpdir(), 'omne-sql-example-'))
let storage: SqlStorage | undefined
try {
  const db = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'notes.sqlite'),
    migrations,
    upgrade: false,
  })
  storage = db
  let notified = false
  await db.atomic(async unit => {
    unit.assertStorage(db)
    await unit.mutate(async tx => {
      await narrow<Tables>(tx).insertInto('notes').values({ id: 'n1', title: 'Draft' }).execute()
    })
    await unit.run(async () => {
      await unit.mutate(async tx => {
        await narrow<Tables>(tx)
          .updateTable('notes')
          .set({ title: 'Ready' })
          .where('id', '=', 'n1')
          .execute()
      })
    })
    unit.afterCommit(() => {
      notified = true
    })
  })
  assert.equal(notified, true)
  const abort = new Error('cancel this write')
  await assert.rejects(
    db.write(async tx => {
      await narrow<Tables>(tx)
        .updateTable('notes')
        .set({ title: 'Discarded' })
        .where('id', '=', 'n1')
        .execute()
      throw abort
    }),
    error => error === abort,
  )
  const note = await db.read(async tx =>
    narrow<Tables>(tx)
      .selectFrom('notes')
      .select(['id', 'title'])
      .where('id', '=', 'n1')
      .executeTakeFirstOrThrow(),
  )
  assert.equal(note.title, 'Ready')
  console.log(note.title)
  await db.close()
  await assert.rejects(
    db.read(async () => 1),
    StorageUnavailable,
  )
} finally {
  await storage?.close()
  await rm(directory, { recursive: true, force: true })
}
```

`write` 在回调成功返回时提交，回调抛出时回滚，并原样传播抛出的值。`read` 使用只读事务。查询和绑定事务的引用应留在回调内；`narrow` 只提供 schema 的 TypeScript 视图，不做运行时结构校验。

`atomic` 提供一份显式共同事务单元。顺序等待单元调用，参与提供者应使用 `assertStorage`。任何事务内调用普通 `read` 或 `write` 都会被拒绝，不会隐式加入事务。`unit.query` 使用共同写事务，它的只读 TypeScript 接口不代表数据库连接只读。`afterCommit` 是实际提交后的同步尽力通知，没有可靠投递或补偿；通知不得携带秘密。

## 通过 Cordis 拥有一次升级

每个在役属主使用自己的守卫。只有在应用启动核对成功后才确认；这个小例子在确认前检查一条查询。空迁移 provider 足以展示生命周期。

```ts
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { sql } from 'kysely'
import { createUpgradeGuard } from '@omne-harness-lite/storage-sql'
import { storageSqlPlugin, type SqlStorageService } from '@omne-harness-lite/storage-sql/cordis'
import { STORAGE_SERVICE, StorageStartup } from '@omne-harness-lite/storage/cordis'

const directory = await mkdtemp(join(tmpdir(), 'omne-sql-owner-example-'))
const ctx = new Context()
const guard = createUpgradeGuard()
class Startup extends StorageStartup {
  readonly migrations = { getMigrations: async () => ({}) }
  readonly upgrade = { checks: [], guard }
}
let fiber: Fiber | undefined
try {
  await ctx.plugin(inner => { new Startup(inner) })
  fiber = ctx.plugin(storageSqlPlugin, {
    dialect: 'sqlite',
    file: join(directory, 'owned.sqlite'),
    synchronous: 'full',
    startup: 'migrate',
  })
  await fiber
  const storage = ctx.get(STORAGE_SERVICE) as SqlStorageService | undefined
  assert.ok(storage)
  const rows = await storage.read(
    async tx => (await sql<{ ready: number }>`SELECT 1 AS ready`.execute(tx.db)).rows,
  )
  assert.equal(rows[0]?.ready, 1)
  const confirmation = await guard.confirm()
  assert.ok(!confirmation.snapshotTaken || confirmation.snapshotRemoved)
  console.log(confirmation)
} finally {
  await fiber?.dispose()
  await ctx.fiber.dispose()
  // Cordis logs disposer failures; retain the fixture if recovery is pending.
  assert.equal(await guard.pending(), 'clear')
  await rm(directory, { recursive: true, force: true })
}
```

拥有插件使用 `startup: 'migrate'` 从 `StorageStartup` 取得 migrations 和 upgrade。
缺省 `startup: 'plain'` 不依赖资源服务，也不允许维护。插件配置拒绝运行对象及未知字段。
带迁移时，独立输入或启动资源必须明确给出 `upgrade: false` 或 `upgrade: { checks, guard }`。受守卫保护的 SQLite 属主取得排他属主锁，在迁移前核对数据库，并将升级快照或“数据库原先不存在”标记保留到确认。关闭或重启未确认升级会恢复该状态，包括撤回快照之后的写。决定确认前不要放行正常应用流量。

`confirm()` 返回 `{ migrated, snapshotTaken, snapshotRemoved }`。核验 `snapshotTaken ⇒ snapshotRemoved`；另一个参与者删掉快照时，这个条件可能为假。在属主就绪前或开始撤除后调用会以 `UpgradeGuardNotAttached` 拒绝。撤除后，`pending()` 报告残留恢复工作；`'clear'` 描述快照状态，不代表所有资源健康。属主机制排斥其他守卫属主，不能阻止无守卫进程打开同一生产库；应始终经守卫访问生产库。

Cordis 4.0.4 插件在启动成功后提供存储，撤除时关闭。运行期间的事务失败拒绝该次操作，服务仍在。先撤消费者，再撤存储。直接消费者应等待 `close()`：它拒绝新工作，等待已接纳工作并关闭句柄；重复调用共享同一次关闭。Cordis 会记录 disposer 错误，应用也须检查诊断和恢复状态。

## 选择 PostgreSQL 配置

这个例子只校验配置，不连接 PostgreSQL。数据库操作需要真实服务器与调用者提供的连接串；占位值不是可运行部署。

```ts
import assert from 'node:assert/strict'
import { StorageSqlConfig } from '@omne-harness-lite/storage-sql'

const config: StorageSqlConfig = {
  dialect: 'postgres',
  connectionString: 'postgresql://example@127.0.0.1:5432/example',
}
assert.equal(StorageSqlConfig.safeParse(config).success, true)
console.log(config.dialect)
```

两种方言使用同一事务 API，但应用迁移与 SQL 必须适合所选数据库。PostgreSQL 使用共享 `pg` pool、只读 repeatable-read 事务、行锁和 advisory sentinel 锁。写驱动逐语句使用 savepoint，让映射后的唯一或引用冲突可以在不废弃整个事务的情况下处理。PostgreSQL 没有 SQLite 升级快照：迁移一旦提交，之后的应用启动失败不会自动撤回它。

## 失败、维护与限界

存储协议区分 `StorageUnavailable`（连接、锁等待、I/O、容量或提供者已关闭）、`UniqueViolation`、`ReferenceViolation` 和 `StorageDefect`（结构、语法、只读写入或误用）。不要把缺陷转换成瞬时重试。守卫启动另报告 `StorageStartupFailure.stage`：`occupied`、`restore`、`preflight`、`snapshot` 或 `migration`；保留其 cause 和恢复诊断。

SQLite 必须使用文件，内存数据库被拒绝。提供者使用 WAL、外键约束和 `BEGIN IMMEDIATE` 写事务，并异步等待锁。`synchronous` 默认 `normal`；`full` 在 OS、文件系统和设备兑现同步请求时请求更强持久性。进程重启测试不建立物理断电保证。这是单主机提供者，不提供分布式协调或自动租户访问控制：租户核验、列、约束和查询归应用。

Node 24.18 的 `node:sqlite` 存在已知限界：已打开的连接跨结构变化后，第一次 `SELECT *` 可能漏掉新列，或报 `ERR_INVALID_STATE`。例子使用显式列，不声称改变结构的多连接流程安全。遇到这种失败应按缺陷调查，不应据此判定数据不存在。

可选 SQLite 维护需要在守卫属主上配置绝对路径 `maintenance.workDirectory` 与 `maintenance.onClosed`。确认后，`storage.maintenance.run` 提供借用的快照/检查会话。离线 `openSnapshotInspection(workDirectory)` 提供由调用者负责关闭的检查生命周期。等待会话工作，每次只执行一个操作，视图不得保留到回调外。取消请求清理，完成关闭才建立资源释放。`storageSnapshotCheck` 检查迁移登记表结构，不检查业务有效性、租户权限，也不授权恢复后的应用重新开放。这些 API 不执行灾难恢复。

拥有插件只在配置中给出 maintenance.workDirectory，完成目标从 `StorageCompletion.closed` 取得；独立 openStorage 仍在原输入中接收 onClosed。

开发本包时运行该成员的 `build`、`typecheck` 和 `test` 脚本。PostgreSQL 测试需要专用 `OMNE_TEST_PG_URL`；跳过不能验证 PostgreSQL 行为。

[行为承诺](SPEC.md)拥有类型之外的规则；[验证入口](verification/README.md)说明方法与限制。
