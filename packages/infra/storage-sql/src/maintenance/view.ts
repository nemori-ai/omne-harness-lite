import type { SqliteRow } from '../sqlite/worker-protocol.ts'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { AsyncSqliteDatabase } from '../sqlite/async-database.ts'
import {
  SnapshotFailure,
  type SnapshotView,
  type SnapshotStructure,
} from '@omne-harness-lite/storage'
import { readMigrationRegistry } from '../upgrade/registry.ts'
import { checkPhysicalSnapshot } from './physical-check.ts'
import { snapshotReadDb } from './read-db.ts'
import { snapshotStructure } from './structure.ts'
import { withCleanup } from './failure.ts'
import { SnapshotResources } from './resources.ts'

export const MAX_SNAPSHOT_BYTES = 1_073_741_824
export const SNAPSHOT_CHUNK_BYTES = 65_536

/** Package-private: caller owns this completed immutable file in its protected task. */
export async function useSnapshotView<T>(
  file: string,
  use: (view: SnapshotView) => Promise<T>,
  resources = new SnapshotResources(),
): Promise<T> {
  await checkPhysicalSnapshot(file)
  const source = new AsyncSqliteDatabase(file, { readOnly: true })
  const db = snapshotReadDb(source)
  resources.own(
    async () => {
      // A failed query drain must not close its dependency out from under it.
      await db.destroy()
      try {
        await source.rollback()
      } finally {
        await source.close()
      }
    },
    () => !source.isOpen,
  )
  let live = true
  const reads = new Set<Promise<Uint8Array>>()
  let readFailure: unknown
  return withCleanup(
    async () => {
      await source.exec('PRAGMA query_only = ON; BEGIN')
      const structure = await snapshotStructure(source)
      await validateRegistry(source, structure)
      const appliedMigrations = await readMigrationRegistry(db)
      const bytes = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
      const closeBytes = resources.own(() => bytes.close())
      return withCleanup(async () => {
        const info = await bytes.stat()
        if (!info.isFile() || info.size < 1) throw new SnapshotFailure('invalid-data')
        if (info.size > MAX_SNAPSHOT_BYTES) throw new SnapshotFailure('capacity')
        const view: SnapshotView = {
          inspection: {
            tx: { db },
            tables: new Set(structure.tables.map(t => t.name)),
            appliedMigrations,
          },
          structure,
          byteLength: info.size,
          read(offset, length) {
            if (!live) return Promise.reject(new SnapshotFailure('unavailable'))
            if (
              !Number.isSafeInteger(offset) ||
              !Number.isSafeInteger(length) ||
              offset < 0 ||
              length < 1 ||
              length > SNAPSHOT_CHUNK_BYTES ||
              offset + length > info.size
            )
              return Promise.reject(new SnapshotFailure('capacity'))
            const task = (async () => {
              const buffer = Buffer.alloc(length)
              let filled = 0
              while (filled < length) {
                const result = await bytes.read(buffer, filled, length - filled, offset + filled)
                if (result.bytesRead === 0) throw new SnapshotFailure('unavailable')
                filled += result.bytesRead
              }
              return buffer
            })()
            reads.add(task)
            void task.then(
              () => reads.delete(task),
              error => {
                reads.delete(task)
                readFailure ??= error
              },
            )
            return task
          },
        }
        return withCleanup(
          () => use(view),
          async () => {
            live = false
            await Promise.allSettled(reads)
            if (readFailure !== undefined) throw readFailure
          },
        )
      }, closeBytes)
    },
    async () => {
      live = false
      await resources.close()
    },
  )
}

async function validateRegistry(
  source: AsyncSqliteDatabase,
  structure: SnapshotStructure,
): Promise<void> {
  const registry = structure.tables.find(table => table.name === 'kysely_migration')
  if (
    registry === undefined ||
    !['name', 'timestamp'].every(name => registry.columns.some(c => c.name === name))
  )
    throw new SnapshotFailure('invalid-data')
  const rows = await source.all(
    `SELECT
      typeof(name) AS name_type,length(name) AS name_length,substr(name,1,129) AS name,
      typeof(timestamp) AS timestamp_type,length(timestamp) AS timestamp_length,
      substr(timestamp,1,41) AS timestamp FROM kysely_migration LIMIT 257`,
  )
  if (rows.length > 256) throw new SnapshotFailure('capacity')
  const names = new Set<string>()
  for (const row of rows) {
    validateRegistryRow(row)
    if (names.has(row.name)) throw new SnapshotFailure('invalid-data')
    names.add(row.name)
  }
  if (rows.length === 0) throw new SnapshotFailure('invalid-data')
}

function validateRegistryRow(row: SqliteRow): asserts row is SqliteRow & { name: string } {
  if (
    row.name_type !== 'text' ||
    typeof row.name_length !== 'number' ||
    row.name_length > 128 ||
    row.timestamp_type !== 'text' ||
    typeof row.timestamp_length !== 'number' ||
    row.timestamp_length > 40 ||
    typeof row.name !== 'string' ||
    !/^[A-Za-z0-9_]{1,128}$/.test(row.name) ||
    typeof row.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(row.timestamp))
  )
    throw new SnapshotFailure('invalid-data')
}
