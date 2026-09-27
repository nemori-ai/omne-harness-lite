# @omne-harness-lite/storage-sql

[中文](README_ZH.md)

A Kysely provider for the shared [storage protocol](../../core/storage/README.md),
using Node’s `node:sqlite` for file-backed SQLite or `pg` for PostgreSQL. It exposes
read and write transactions, explicit shared transaction units, migrations, a
Cordis service, and optional owned upgrade and SQLite snapshot maintenance.

This is currently a private, unpublished ESM workspace package. Use its public
package import from a workspace consumer after building the checkout; an npm
release is not available. See the [development guide](../../../docs/development.md)
for the Node and pnpm toolchain. Consumers also declare the public packages they
import, such as `kysely` and `@omne-harness-lite/storage`.

## Public API

| Purpose                        | Exports                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct provider                | `openStorage`, `OpenStorageOptions`, `SqlStorage`, `StorageSqlConfig` (runtime schema and type)                                                                              |
| Cordis service                 | `storageSqlPlugin`, `STORAGE_SERVICE` (`'storage'`)                                                                                                                          |
| Owned upgrade                  | `createUpgradeGuard`, `UpgradeGuard`, `UpgradeConfirmation`, `UpgradePending`, `UpgradeGuardNotAttached`, `StorageStartupFailure`, `StorageStartupStage`, `StorageSqlLogger` |
| Lower-level SQLite integration | `NodeSqliteDialect`, `NodeSqliteDriver`, `NodeSqliteDialectOptions`                                                                                                          |
| Error translation              | `translateSqliteError`, `translatePgError`                                                                                                                                   |
| SQLite inspection              | `openSnapshotInspection`, `storageSnapshotCheck`, `STORAGE_SNAPSHOT_TABLES`                                                                                                  |

The provider owns database handles, transaction boundaries, dialect behavior, and
configured migration execution. The application owns its tables and migrations.
Storage errors, `narrow<DB>()`, and migration composition are exported by
`@omne-harness-lite/storage`.

## Commit, share a transaction, and roll back

This self-contained example creates and removes a temporary SQLite database.
`upgrade: false` explicitly disables ownership and upgrade snapshots for the
disposable fixture; production storage should use the guard shown next.

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

`write` commits when its callback fulfills and rolls back when it throws,
propagating the thrown value unchanged. `read` uses a read-only transaction.
Keep queries and transaction-bound references inside the callback; `narrow`
provides a TypeScript view of your schema, not runtime schema validation.

`atomic` supplies one explicitly shared unit. Await unit calls sequentially and
use `assertStorage` in participating providers. Ordinary `read` or `write` inside
any transaction is rejected, rather than implicitly joining it. `unit.query` uses
the shared write transaction, so its read-only TypeScript interface does not make
the database connection read-only. `afterCommit` is a synchronous best-effort
notification after commit, with no reliable delivery or compensation; do not put
secrets in notifications.

## Own an upgrade through Cordis

Give each live owner its own guard. Confirm only after the application’s startup
checks succeed; this small example checks a query before confirming. An empty
migration provider is sufficient to demonstrate the lifecycle.

```ts
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { sql } from 'kysely'
import {
  STORAGE_SERVICE,
  createUpgradeGuard,
  storageSqlPlugin,
  type SqlStorage,
} from '@omne-harness-lite/storage-sql'

const directory = await mkdtemp(join(tmpdir(), 'omne-sql-owner-example-'))
const ctx = new Context()
const guard = createUpgradeGuard()
let fiber: Fiber | undefined
try {
  fiber = ctx.plugin(storageSqlPlugin, {
    dialect: 'sqlite',
    file: join(directory, 'owned.sqlite'),
    synchronous: 'full',
    migrations: { getMigrations: async () => ({}) },
    upgrade: { checks: [], guard },
  })
  await fiber
  const storage = ctx.get(STORAGE_SERVICE) as SqlStorage | undefined
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
  // Cordis logs disposer failures; retain the fixture if recovery is pending.
  assert.equal(await guard.pending(), 'clear')
  await rm(directory, { recursive: true, force: true })
}
```

With migrations, configuration must explicitly give either `upgrade: false` or
`upgrade: { checks, guard }`. A guarded SQLite owner takes an exclusive owner lock,
checks the database before migration, and retains an upgrade snapshot or an
absent-database marker until confirmation. Closing or restarting an unconfirmed
upgrade restores that state, including undoing writes made after the snapshot.
Do not expose normal application traffic before deciding to confirm.

`confirm()` returns `{ migrated, snapshotTaken, snapshotRemoved }`. Check
`snapshotTaken ⇒ snapshotRemoved`; it can be false if another actor removed the
snapshot. Calling before the owner is ready or after disposal begins rejects with
`UpgradeGuardNotAttached`. After disposal, `pending()` reports retained recovery
work; `'clear'` describes snapshot state, not universal resource health. Ownership
excludes other guarded owners; it cannot prevent an unguarded process from opening
the same production database. Use guarded access consistently.

The Cordis 4.0.4 plugin provides storage after startup succeeds and closes it on
disposal. Runtime transaction failures reject the operation while the service
remains present. Dispose consumers before storage. Direct consumers should await
`close()`, which rejects new work, waits for accepted work, and closes handles;
repeated calls share the same closing operation. Cordis logs disposer errors, so
applications must also inspect diagnostics and recovery state.

## Select PostgreSQL configuration

This example validates configuration only and does not connect to PostgreSQL.
An actual server and a caller-supplied connection string are required for database
operations; the placeholder is not a runnable deployment.

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

The same transaction API is used by both dialects, but application migrations
and SQL must suit the selected database. PostgreSQL uses a shared `pg` pool,
read-only repeatable-read transactions, row locks, and advisory sentinel locks.
The write driver uses per-statement savepoints so mapped uniqueness or reference
conflicts can be handled without aborting the whole transaction. PostgreSQL has
no SQLite upgrade snapshot: once migration commits, a later application startup
failure does not automatically revert it.

## Failures, maintenance, and limits

The storage protocol distinguishes `StorageUnavailable` (connection, lock-wait,
I/O, capacity, or closed provider), `UniqueViolation`, `ReferenceViolation`, and
`StorageDefect` (schema, syntax, read-only writes, or misuse). Do not convert
defects into transient retries. Guarded startup additionally reports
`StorageStartupFailure.stage`: `occupied`, `restore`, `preflight`, `snapshot`, or
`migration`; retain its cause and recovery diagnostics.

SQLite requires a file; in-memory databases are rejected. The provider uses WAL,
foreign-key enforcement, and `BEGIN IMMEDIATE` writes with asynchronous lock
waiting. `synchronous` defaults to `normal`; `full` requests stronger durability
when the OS, filesystem, and device honor synchronization. Process-restart tests
do not establish physical power-loss behavior. This is a single-host provider,
without distributed coordination or automatic tenant access control: applications
own tenant checks, columns, constraints, and queries.

There is a known Node 24.18 `node:sqlite` limitation in schema changes across
already-open connections: the first `SELECT *` can miss new columns or fail with
`ERR_INVALID_STATE`. The examples use explicit columns and do not claim that
schema-changing multi-connection workflows are safe. Treat such a failure as a
defect to investigate, rather than evidence that no data exists.

For optional SQLite maintenance, configure an absolute `maintenance.workDirectory`
and `maintenance.onClosed` alongside a guarded owner. After confirmation,
`storage.maintenance.run` supplies borrowed snapshot/inspection sessions. Offline
`openSnapshotInspection(workDirectory)` supplies an inspection lifetime that the
caller must close. Await session work, use one operation at a time, and do not
retain views beyond their callback. Cancellation requests cleanup; only completed
closure establishes release. `storageSnapshotCheck` checks migration-table
structure, not business validity, tenant authority, or permission to reopen a
restored application. These APIs do not perform disaster recovery.

For package development, run this member's `build`, `typecheck`, and `test`
scripts. PostgreSQL tests require a dedicated `OMNE_TEST_PG_URL`; skipping them
does not verify PostgreSQL behavior.
