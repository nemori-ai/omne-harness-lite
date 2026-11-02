// The migration module of the execution record tables. The provider runs it in its atomic migration.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  EXECUTION_RECORD_MIGRATION,
  EXECUTION_RECORD_SCHEMA,
  EXECUTION_RECORD_TABLES,
} from './execution-record-schema.ts'

const migration: MigrationModule = {
  owner: EXECUTION_RECORD_MIGRATION.owner,
  id: EXECUTION_RECORD_MIGRATION.id,
  up(port) {
    for (const statement of EXECUTION_RECORD_SCHEMA) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 3) = 'er_' LIMIT 100`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = EXECUTION_RECORD_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
