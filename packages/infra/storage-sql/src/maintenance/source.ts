import { statSync } from 'node:fs'
import { open, statfs } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'
import { SnapshotFailure } from '@omne-harness-lite/storage'
import { assertProductionStoragePath } from '../sqlite/protection.ts'
import { MAX_SNAPSHOT_BYTES } from './view.ts'
import { withCleanup } from './failure.ts'
import type { SnapshotProducer } from './engine.ts'

function numberPragma(db: DatabaseSync, sql: string): number {
  const row = db.prepare(sql).get()
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
    const check = () => {
      if (signal.aborted) throw new SnapshotFailure('cancelled')
      try {
        if (statSync(`${sourceFile}-wal`).size >= MAX_SNAPSHOT_BYTES)
          throw new SnapshotFailure('capacity')
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      }
    }
    check()
    const canonical = assertProductionStoragePath(sourceFile)
    const reader = new DatabaseSync(canonical, { readOnly: true, timeout: 0 })
    const closeReader = resources.own(
      () => {
        try {
          if (reader.isTransaction) reader.exec('ROLLBACK')
        } finally {
          reader.close()
        }
      },
      () => !reader.isOpen,
    )
    await withCleanup(
      async () => {
        reader.exec('PRAGMA query_only=ON; BEGIN')
        // Read a real page before calling backup: all subsequent pages use this observation.
        reader.prepare('SELECT name FROM sqlite_schema LIMIT 1').get()
        const pages = numberPragma(reader, 'PRAGMA page_count')
        const size = numberPragma(reader, 'PRAGMA page_size')
        hooks.afterPinned?.()
        if (pages * size > MAX_SNAPSHOT_BYTES) throw new SnapshotFailure('capacity')
        const space = await statfs(dirname(file))
        if (space.bavail * space.bsize < pages * size * 2 + 268_435_456)
          throw new SnapshotFailure('capacity')
        const target = await open(file, 'wx', 0o600)
        const closeTarget = resources.own(() => target.close())
        await closeTarget()
        check()
        await backup(reader, file, {
          rate: 128,
          progress: ({ totalPages }) => {
            hooks.progress?.()
            check()
            if (totalPages * size > MAX_SNAPSHOT_BYTES) throw new SnapshotFailure('capacity')
          },
        })
      },
      async () => {
        // This executes only after backup's promise really settled, including callback cancellation.
        await closeReader()
      },
    )
  }
}
