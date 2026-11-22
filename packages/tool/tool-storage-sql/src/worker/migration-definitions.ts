import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { DEFINITION_MIGRATION, DEFINITION_STATEMENTS, DEFINITION_TABLES } from './schema.ts'

const migration: MigrationModule = {
  owner: DEFINITION_MIGRATION.owner,
  id: DEFINITION_MIGRATION.id,
  up(port) {
    for (const statement of DEFINITION_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 13) = 'tl_definition'
       LIMIT 10`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = DEFINITION_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
