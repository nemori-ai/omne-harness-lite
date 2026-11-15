import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { createTables, terminalDdl, terminalTables } from './relational-ddl.ts'
import { TERMINAL_MIGRATION } from './terminal-schema.ts'
export default {
  ...TERMINAL_MIGRATION,
  ...createTables(terminalDdl, terminalTables),
} satisfies MigrationModule
