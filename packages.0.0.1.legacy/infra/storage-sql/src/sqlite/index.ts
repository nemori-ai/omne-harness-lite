import { Kysely, sql } from 'kysely'
import type { UntypedDb } from '@omne-harness-lite/storage'
import { NodeSqliteDialect, type NodeSqliteDialectOptions } from './driver.ts'
import type { DialectHandles } from '../provider.ts'
import { assertProductionStoragePath } from './protection.ts'

export interface SqliteOptions {
  readonly file: string
  readonly synchronous?: NodeSqliteDialectOptions['synchronous']
  readonly writeLockTimeoutMs?: number
}

export function openSqlite(options: SqliteOptions): DialectHandles {
  assertProductionStoragePath(options.file)
  const base = {
    synchronous: options.synchronous ?? 'normal',
    ...(options.writeLockTimeoutMs === undefined
      ? {}
      : { writeLockTimeoutMs: options.writeLockTimeoutMs }),
  }
  const writeDialect = new NodeSqliteDialect({ file: options.file, role: 'write', ...base })
  const writeDb: UntypedDb = new Kysely({ dialect: writeDialect })
  const readDialect = new NodeSqliteDialect({ file: options.file, role: 'read', ...base })
  const readDb: UntypedDb = new Kysely({ dialect: readDialect })
  return {
    readDb,
    writeDb,
    resourcesClosed: () =>
      readDialect.driver.resourcesClosed && writeDialect.driver.resourcesClosed,
    // BEGIN IMMEDIATE 已持库级写锁：行锁与哨兵锁平凡成立，不发语句
    async lockRow() {},
    async lockSentinel() {},
    readIsolation: undefined,
    writeIsolation: undefined,
    async listTables(db) {
      const { rows } = await sql<{
        name: string
      }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'`.execute(
        db,
      )
      return rows.map(row => row.name)
    },
  }
}
