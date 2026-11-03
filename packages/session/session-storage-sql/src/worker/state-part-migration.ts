// The migration module of the state parts of the execution record participant. It requires
// `execution-record/001-execution-record` and adds one table beside `er_state`; the provider runs it
// in its atomic migration. `up` is `CREATE TABLE IF NOT EXISTS`, so a run on a database that already
// has the table changes nothing.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  STATE_PART_MIGRATION,
  STATE_PART_SCHEMA,
  STATE_PART_TABLES,
} from './execution-record-schema.ts'

const migration: MigrationModule = {
  owner: STATE_PART_MIGRATION.owner,
  id: STATE_PART_MIGRATION.id,
  up(port) {
    for (const statement of STATE_PART_SCHEMA) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'er_state_part' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = STATE_PART_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
