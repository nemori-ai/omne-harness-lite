import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { CONTROL_RETIRE_MIGRATION } from './relational-migrations.ts'
export default {
  ...CONTROL_RETIRE_MIGRATION,
  up(port) {
    port.execute('DROP TABLE hi_wait_controls', [])
  },
  verify(port) {
    return port.execute("SELECT 1 FROM sqlite_schema WHERE name='hi_wait_controls' LIMIT 1", [])
      .rows.length
      ? { kind: 'failed', diagnostic: 'legacy_control_retained' }
      : { kind: 'verified' }
  },
} satisfies MigrationModule
