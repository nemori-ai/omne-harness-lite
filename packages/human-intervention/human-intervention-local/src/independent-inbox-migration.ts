import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { INBOX_MIGRATION } from './independent-schema.ts'
export default {
  ...INBOX_MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE hi_wait_active (wait_key TEXT PRIMARY KEY, record TEXT NOT NULL)',
      [],
    )
    port.execute(
      'CREATE TABLE hi_wait_inbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, wait_key TEXT NOT NULL, decision_key TEXT NOT NULL, record TEXT NOT NULL, UNIQUE (wait_key, decision_key))',
      [],
    )
  },
  verify(port) {
    port.execute('SELECT * FROM hi_wait_active LIMIT 0', [])
    port.execute('SELECT * FROM hi_wait_inbox LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
