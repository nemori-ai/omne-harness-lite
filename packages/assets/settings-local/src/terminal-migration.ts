import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { TERMINAL_MIGRATION } from './terminal-schema.ts'
export default {
  ...TERMINAL_MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE st_terminals (operation_key TEXT NOT NULL PRIMARY KEY, record TEXT NOT NULL) STRICT',
      [],
    )
  },
  verify(port) {
    port.execute('SELECT operation_key, record FROM st_terminals LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
