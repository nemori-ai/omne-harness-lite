// The migration module of the Agent fact family and the content blocks (R2-D292). It requires the
// migrations that create the tables it drops (`execution-record/001-execution-record`,
// `004-state-parts` and `005-fact-body`), drops them, recreates `er_operation` without the answer
// column and creates `er_fact` and `sl_blob`. It moves no data: 0.0.x keeps no old records. The
// provider runs it in its atomic migration.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  FACT_BLOB_MIGRATION,
  FACT_BLOB_SCHEMA,
  FACT_BLOB_TABLES,
  RETIRED_TABLES,
} from './execution-record-schema.ts'

const migration: MigrationModule = {
  owner: FACT_BLOB_MIGRATION.owner,
  id: FACT_BLOB_MIGRATION.id,
  up(port) {
    for (const statement of FACT_BLOB_SCHEMA) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND (substr(name, 1, 3) = 'er_' OR name = 'sl_blob') LIMIT 100`,
      [],
    )
    const tables = new Map(found.rows.map(row => [String(row[0]), String(row[1])]))
    const missing = FACT_BLOB_TABLES.filter(name => !tables.has(name))
    const left = RETIRED_TABLES.filter(name => tables.has(name))
    const answer = /\banswer\b/.test(tables.get('er_operation') ?? 'answer')
    if (missing.length === 0 && left.length === 0 && !answer) return { kind: 'verified' }
    return {
      kind: 'failed',
      diagnostic: `missing tables: ${missing.join(',')}; retired tables left: ${left.join(',')}; er_operation keeps answer: ${String(answer)}`,
    }
  },
}
export default migration
