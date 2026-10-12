# @omne-harness-lite/storage

The root remains independent of Cordis. `./cordis` exposes the shared Service and its key. See [integration commitments](SPEC.md).

[中文](README_ZH.md)

A storage protocol for consumers and providers: Kysely transaction views, explicit locking, classified failures, migration composition, preflight and snapshot interfaces, and provider conformance suites. This package does not open a database or implement a storage provider.

## Workspace use

This is an experimental, private workspace package, currently not published on npm. In a repository checkout, use the [development setup](../../../docs/development.md), build the workspace, and declare `"@omne-harness-lite/storage": "workspace:*"` in the consuming member. Declare other packages imported by an example as direct dependencies too. Import through the public package entry; do not import sibling `src/` paths.

## Public API

| Public API                                                                 | Purpose                                                                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Storage`, `ReadTx`, `WriteTx`, `narrow<DB>`                               | Read/write transaction protocol and consumer-owned table types                                                                |
| `AtomicStorage`, `StorageUnit`, `StorageInstance`                          | Explicit shared transaction extension and instance lifecycle                                                                  |
| Four storage error classes, `mapStorageError`                              | Distinguish availability, uniqueness, references and defects                                                                  |
| `MigrationFragment`, `composeMigrations`, `composedMigrationName`          | Ordered Kysely migration composition                                                                                          |
| `PreflightCheck`, snapshot types, `SnapshotFailure`, `checkSnapshotTables` | Provider/owner maintenance contracts and structural checks                                                                    |
| `./conformance`                                                            | `describeStorageConformance`, `describeAtomicStorageConformance`; caller supplies a Vitest runner and a real provider factory |

## Examples

Each TypeScript example is self-contained and uses the built public exports.

### Consume a provider through a typed transaction

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

This reusable consumer function requires a caller-supplied provider and an existing `counters` row. `narrow` is only a type assertion; it does not create or check a table. `lockRow` does not lock a missing row.

### Compose named migrations without opening a database

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

Composition does not execute the migration. The application supplies this provider to its database migration runner.

### Map only availability failures

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

## Boundaries and failures

`read` requires one committed snapshot and rejects writes. `write` commits a normal callback return, rolls back a thrown value and rethrows it unchanged. A conforming provider preserves transaction usability after a handled `UniqueViolation` or `ReferenceViolation`. These are requirements on providers, not guarantees delivered by importing this protocol.

Catch `StorageUnavailable` for availability, `UniqueViolation` for a named constraint, and `ReferenceViolation` for `missing-target` or `delete-restricted`. `StorageDefect` and unexpected exceptions propagate. `mapStorageError` deliberately maps only the first class. Migration fragment names must be unique within a composition; duplicates throw, and published ordering must remain stable.

`atomic` is an explicit optional extension: participants must use the same storage instance, await sequential `unit.run` operations and handle recoverable conflicts inside their own run boundary. An exception escaping that boundary prevents commit even if an ancestor catches it. Ordinary `read`/`write` calls are not implicitly joined. `afterCommit` is a best-effort notification without reliable delivery and must not carry secrets. Snapshot APIs specify borrowed resource lifetimes and classified physical failures; actual durability, cancellation, cleanup and database behavior require provider-specific verification.

## Development

```sh
pnpm --filter @omne-harness-lite/storage run build
pnpm --filter @omne-harness-lite/storage run typecheck
pnpm --filter @omne-harness-lite/storage run test
```

Build workspace dependencies first. These checks cover this package; integration behavior requires the actual consumer and provider.
