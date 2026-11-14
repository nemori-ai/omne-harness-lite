import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { IDENTITY_TABLES, MIGRATION, SCHEMA_STATEMENTS } from './schema.ts'

const migration: MigrationModule = {
  owner: MIGRATION.owner,
  id: MIGRATION.id,
  up(port) {
    for (const statement of SCHEMA_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    for (const table of IDENTITY_TABLES) port.execute(`SELECT 1 FROM ${table} LIMIT 1`, [])
    return { kind: 'verified' }
  },
}
export default migration
