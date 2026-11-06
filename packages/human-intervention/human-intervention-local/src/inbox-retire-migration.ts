import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { INBOX_RETIRE_MIGRATION } from './relational-migrations.ts'
export default {
  ...INBOX_RETIRE_MIGRATION,
  up(port) {
    port.execute('DROP TABLE hi_wait_inbox', [])
    port.execute('DROP TABLE hi_wait_active', [])
  },
  verify(port) {
    return port.execute(
      "SELECT 1 FROM sqlite_schema WHERE name IN ('hi_wait_inbox','hi_wait_active') LIMIT 1",
      [],
    ).rows.length
      ? { kind: 'failed', diagnostic: 'legacy_inbox_retained' }
      : { kind: 'verified' }
  },
} satisfies MigrationModule
