// The migration module of the scope owners of the Session log. The provider runs it in its atomic
// migration, after the Session log tables.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { SCOPE_INDEX_MIGRATION, SCOPE_INDEX_STATEMENTS, SCOPE_INDEX_TABLES } from './schema.ts'

const migration: MigrationModule = {
  owner: SCOPE_INDEX_MIGRATION.owner,
  id: SCOPE_INDEX_MIGRATION.id,
  up(port) {
    for (const statement of SCOPE_INDEX_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'sl_scope_idx' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = SCOPE_INDEX_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
