// The migration module of the grant table of the attempts (R2-D349). The provider runs it in its
// atomic migration, after the state items of the same owner.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  ATTEMPT_GRANT_MIGRATION,
  ATTEMPT_GRANT_STATEMENTS,
  ATTEMPT_GRANT_TABLES,
} from './schema.ts'

const migration: MigrationModule = {
  owner: ATTEMPT_GRANT_MIGRATION.owner,
  id: ATTEMPT_GRANT_MIGRATION.id,
  up(port) {
    for (const statement of ATTEMPT_GRANT_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'sl_attempt_grant' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = ATTEMPT_GRANT_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
