// The migration module of the Tool tables. The provider runs it in its atomic migration.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, SCHEMA_STATEMENTS, TOOL_TABLES } from './schema.ts'

const migration: MigrationModule = {
  owner: MIGRATION.owner,
  id: MIGRATION.id,
  up(port) {
    for (const statement of SCHEMA_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 3) = 'tl_' LIMIT 100`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = TOOL_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
