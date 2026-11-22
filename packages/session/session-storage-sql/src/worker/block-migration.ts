import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { BLOCK_MIGRATION, BLOCK_SCHEMA, BLOCK_TABLES } from './execution-record-schema.ts'

const migration: MigrationModule = {
  owner: BLOCK_MIGRATION.owner,
  id: BLOCK_MIGRATION.id,
  up(port) {
    for (const statement of BLOCK_SCHEMA) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'er_block' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = BLOCK_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing: ${missing.join(',')}` }
  },
}
export default migration
