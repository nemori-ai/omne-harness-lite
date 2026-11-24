// The migration module of the item rows of the Agent journal: it creates `er_item`, its open
// index and `er_item_content`. It moves no data: 0.0.x keeps no old records. The provider runs it in its atomic migration.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { ITEM_MIGRATION, ITEM_SCHEMA, ITEM_TABLES } from './execution-record-schema.ts'

const migration: MigrationModule = {
  owner: ITEM_MIGRATION.owner,
  id: ITEM_MIGRATION.id,
  up(port) {
    for (const statement of ITEM_SCHEMA) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE (type = 'table' AND name IN ('er_item', 'er_item_content')) OR (type = 'index' AND name = 'er_item_open') LIMIT 3`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = [...ITEM_TABLES, 'er_item_open'].filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing: ${missing.join(',')}` }
  },
}
export default migration
