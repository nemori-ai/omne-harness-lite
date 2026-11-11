import { backfillPermissionCurrent } from './permission-current-backfill.ts'
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  PERMISSION_CURRENT_MIGRATION,
  PERMISSION_CURRENT_STATEMENTS,
} from './permission-current-schema.ts'

const migration: MigrationModule = {
  ...PERMISSION_CURRENT_MIGRATION,
  up(port) {
    for (const statement of PERMISSION_CURRENT_STATEMENTS) port.execute(statement, [])
    backfillPermissionCurrent(port)
  },
  verify(port) {
    const found = port.execute(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('sl_permission_head', 'sl_permission_assignment') LIMIT 2",
      [],
    )
    return found.rows.length === 2
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'Session permission tables are missing' }
  },
}
export default migration
