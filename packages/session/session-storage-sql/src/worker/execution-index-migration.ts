// The migration module of the execution index of the Session log. The provider runs it in its
// atomic migration, after the Session log tables.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  EXECUTION_INDEX_MIGRATION,
  EXECUTION_INDEX_STATEMENTS,
  EXECUTION_INDEX_TABLES,
} from './schema.ts'

const migration: MigrationModule = {
  owner: EXECUTION_INDEX_MIGRATION.owner,
  id: EXECUTION_INDEX_MIGRATION.id,
  up(port) {
    for (const statement of EXECUTION_INDEX_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'sl_execution_idx' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = EXECUTION_INDEX_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
