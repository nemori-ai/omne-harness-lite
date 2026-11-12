import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { createTables, requestDdl, requestTables } from './relational-ddl.ts'
import { REQUEST_MIGRATION } from './request-schema.ts'
export default {
  ...REQUEST_MIGRATION,
  ...createTables(requestDdl, requestTables),
} satisfies MigrationModule
