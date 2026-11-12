import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { createTables, waitDdl, waitTables } from './relational-ddl.ts'
import { WAIT_MIGRATION } from './wait-schema.ts'
export default {
  ...WAIT_MIGRATION,
  ...createTables(waitDdl, waitTables),
} satisfies MigrationModule
