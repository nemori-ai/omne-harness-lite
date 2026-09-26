import { Kysely, sql } from 'kysely'
import type { UntypedDb } from '@omne-harness-lite/storage'
import { NodeSqliteDialect } from './driver.ts'
import type { DialectHandles } from '../provider.ts'

export interface SqliteOptions {
  readonly file: string
  readonly writeLockTimeoutMs?: number
}

export function openSqlite(options: SqliteOptions): DialectHandles {
  const base =
    options.writeLockTimeoutMs === undefined
      ? {}
      : { writeLockTimeoutMs: options.writeLockTimeoutMs }
  const writeDb: UntypedDb = new Kysely({
    dialect: new NodeSqliteDialect({ file: options.file, role: 'write', ...base }),
  })
  const readDb: UntypedDb = new Kysely({
    dialect: new NodeSqliteDialect({ file: options.file, role: 'read', ...base }),
  })
  return {
    readDb,
    writeDb,
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
