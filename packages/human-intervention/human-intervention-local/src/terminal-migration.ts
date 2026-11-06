import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { TERMINAL_MIGRATION } from './terminal-schema.ts'
export default {
  ...TERMINAL_MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE hi_terminals (operation_key TEXT PRIMARY KEY, record TEXT NOT NULL)',
      [],
    )
  },
  verify(port) {
    port.execute('SELECT operation_key, record FROM hi_terminals LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
