import { open, stat, statfs } from 'node:fs/promises'
import { dirname } from 'node:path'
import { AsyncSqliteDatabase } from '../sqlite/async-database.ts'
import { SnapshotFailure } from '@omne-harness-lite/storage'
import { assertProductionStoragePath } from '../sqlite/protection.ts'
import { MAX_SNAPSHOT_BYTES } from './view.ts'
import { withCleanup } from './failure.ts'
import type { SnapshotProducer } from './engine.ts'

async function numberPragma(db: AsyncSqliteDatabase, sql: string): Promise<number> {
  const row = await db.get(sql)
  const value = row === undefined ? undefined : Object.values(row)[0]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new SnapshotFailure('invalid-data')
  return value
}

/** Constructed only by the already-owned SqlStorage, never from an ops payload. */
export function sqliteSnapshotProducer(
  sourceFile: string,
  /** Package-private fault/scheduling points; the production assembly supplies none. */
  hooks: { readonly afterPinned?: () => void; readonly progress?: () => void } = {},
): SnapshotProducer {
  return async (file, signal, resources) => {
    const check = async () => {
      if (signal.aborted) throw new SnapshotFailure('cancelled')
      try {
        if ((await stat(`${sourceFile}-wal`)).size >= MAX_SNAPSHOT_BYTES)
          throw new SnapshotFailure('capacity')
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      }
    }
    await check()
    const canonical = assertProductionStoragePath(sourceFile)
    const reader = new AsyncSqliteDatabase(canonical, { readOnly: true, timeout: 0 })
    const closeReader = resources.own(
      async () => {
        try {
          await reader.rollback()
        } finally {
          await reader.close()
        }
      },
      () => !reader.isOpen,
    )
    await withCleanup(
      async () => {
        await reader.exec('PRAGMA query_only=ON; BEGIN')
        // Read a real page before calling backup: all subsequent pages use this observation.
        await reader.get('SELECT name FROM sqlite_schema LIMIT 1')
        const pages = await numberPragma(reader, 'PRAGMA page_count')
        const size = await numberPragma(reader, 'PRAGMA page_size')
        hooks.afterPinned?.()
        if (pages * size > MAX_SNAPSHOT_BYTES) throw new SnapshotFailure('capacity')
        const space = await statfs(dirname(file))
        if (space.bavail * space.bsize < pages * size * 2 + 268_435_456)
          throw new SnapshotFailure('capacity')
        const target = await open(file, 'wx', 0o600)
        const closeTarget = resources.own(() => target.close())
        await closeTarget()
        await check()
        await reader.backup(file, {
          signal,
          limits: { pageSize: size, maxBytes: MAX_SNAPSHOT_BYTES, walFile: `${sourceFile}-wal` },
          ...(hooks.progress === undefined ? {} : { progress: hooks.progress }),
        })
      },
      async () => {
        // This executes only after backup's promise really settled, including callback cancellation.
        await closeReader()
      },
    )
  }
}
