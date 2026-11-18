import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  AUTHORIZATION_CONTEXT_MIGRATION,
  AUTHORIZATION_CONTEXT_STATEMENTS,
  AUTHORIZATION_CONTEXT_TABLES,
} from './permission-current-schema.ts'

const migration: MigrationModule = {
  ...AUTHORIZATION_CONTEXT_MIGRATION,
  up(port) {
    for (const statement of AUTHORIZATION_CONTEXT_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (${AUTHORIZATION_CONTEXT_TABLES.map(() => '?').join(', ')}) LIMIT 3`,
      [...AUTHORIZATION_CONTEXT_TABLES],
    )
    return found.rows.length === AUTHORIZATION_CONTEXT_TABLES.length
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'Session authorization context tables are missing' }
  },
}
export default migration
