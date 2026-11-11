import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { CATALOG_TERMINAL_MIGRATION } from './catalog-terminal-schema.ts'
export default {
  ...CATALOG_TERMINAL_MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE st_catalog_terminals (operation_key TEXT NOT NULL PRIMARY KEY, record TEXT NOT NULL) STRICT',
      [],
    )
  },
  verify(port) {
    port.execute('SELECT operation_key, record FROM st_catalog_terminals LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
