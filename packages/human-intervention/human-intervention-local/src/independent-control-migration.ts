import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { CONTROL_MIGRATION } from './independent-schema.ts'
export default {
  ...CONTROL_MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE hi_wait_controls (wait_key TEXT PRIMARY KEY, record TEXT NOT NULL)',
      [],
    )
  },
  verify(port) {
    port.execute('SELECT * FROM hi_wait_controls LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
