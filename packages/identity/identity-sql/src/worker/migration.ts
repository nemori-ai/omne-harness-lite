// The migration `identity/001-identity`: the six tables and their unique indexes. The provider
// runs `up` and `verify` in one transaction and writes the mark with the checksum of this file.
// Published bytes do not change: a later shape is a new migration (sqlite-provider §5.4).
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { IDENTITY_TABLES, MIGRATION, SCHEMA_STATEMENTS } from './schema.ts'

const migration: MigrationModule = {
  owner: MIGRATION.owner,
  id: MIGRATION.id,
  up(port) {
    for (const statement of SCHEMA_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    // A missing table makes the statement throw, which fails the migration transaction.
    for (const table of IDENTITY_TABLES) port.execute(`SELECT 1 FROM ${table} LIMIT 1`, [])
    return { kind: 'verified' }
  },
}
export default migration
