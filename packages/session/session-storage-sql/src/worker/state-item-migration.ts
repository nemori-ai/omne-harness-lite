// The migration module of the chunk rows of the Session snapshots. The provider runs it
// in its atomic migration, after the operation evidence table.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { STATE_ITEM_MIGRATION, STATE_ITEM_STATEMENTS, STATE_ITEM_TABLES } from './schema.ts'

const migration: MigrationModule = {
  owner: STATE_ITEM_MIGRATION.owner,
  id: STATE_ITEM_MIGRATION.id,
  up(port) {
    for (const statement of STATE_ITEM_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'sl_state_item' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = STATE_ITEM_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
