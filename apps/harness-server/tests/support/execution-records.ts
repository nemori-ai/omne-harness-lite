import { DatabaseSync } from 'node:sqlite'
import { sqliteFiles } from './release-tree.ts'

export type ExecutionRecords = Readonly<{ settled: number; unsettled: number; facts: number }>

export function executionRecords(storageRoot: string): ExecutionRecords {
  let settled = 0
  let unsettled = 0
  let facts = 0
  const count = (db: DatabaseSync, sql: string): number =>
    Number((db.prepare(sql).get() as { n?: unknown } | undefined)?.n ?? 0)
  for (const file of sqliteFiles(storageRoot)) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const held = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'er_execution'")
        .get()
      if (held === undefined) continue
      settled += count(db, 'SELECT COUNT(*) AS n FROM er_execution WHERE settled IS NOT NULL')
      unsettled += count(db, 'SELECT COUNT(*) AS n FROM er_execution WHERE settled IS NULL')
      facts += count(db, 'SELECT COUNT(*) AS n FROM er_fact')
    } finally {
      db.close()
    }
  }
  return { settled, unsettled, facts }
}
