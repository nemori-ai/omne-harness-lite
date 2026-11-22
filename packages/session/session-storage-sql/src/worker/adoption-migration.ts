import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { ADOPTION_MIGRATION, ADOPTION_SCHEMA, ADOPTION_TABLES } from './execution-record-schema.ts'

const migration: MigrationModule = {
  owner: ADOPTION_MIGRATION.owner,
  id: ADOPTION_MIGRATION.id,
  up(port) {
    for (const statement of ADOPTION_SCHEMA) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('er_session_adoption', 'er_request_choice') LIMIT 2`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = ADOPTION_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing: ${missing.join(',')}` }
  },
}
export default migration
