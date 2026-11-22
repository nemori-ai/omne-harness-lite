import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { askedAtDdl } from './relational-ddl.ts'
import { ASKED_AT_MIGRATION } from './request-schema.ts'
export default {
  ...ASKED_AT_MIGRATION,
  up(port) {
    port.execute(askedAtDdl, [])
  },
  verify(port) {
    const found = port.execute(
      "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='hi_requests_v2' AND instr(sql,'asked_at TEXT')>0 LIMIT 1",
      [],
    )
    return found.rows.length
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'column_missing: hi_requests_v2.asked_at' }
  },
} satisfies MigrationModule
