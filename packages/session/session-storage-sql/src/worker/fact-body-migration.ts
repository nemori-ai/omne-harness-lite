// The migration module of the fact bodies of the execution record participant (C-WORKCACHE design
// §5.2). It requires `execution-record/001-execution-record` and adds one table beside
// `er_fact_idx`; the provider runs it in its atomic migration. `up` is `CREATE TABLE IF NOT EXISTS`,
// so a run on a database that already has the table changes nothing.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  FACT_BODY_MIGRATION,
  FACT_BODY_SCHEMA,
  FACT_BODY_TABLES,
} from './execution-record-schema.ts'

const migration: MigrationModule = {
  owner: FACT_BODY_MIGRATION.owner,
  id: FACT_BODY_MIGRATION.id,
  up(port) {
    for (const statement of FACT_BODY_SCHEMA) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'er_fact_body' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = FACT_BODY_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
