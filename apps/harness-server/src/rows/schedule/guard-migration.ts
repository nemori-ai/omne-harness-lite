import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { SCHEDULE_GUARD_MIGRATION, SCHEDULE_QUOTA_TABLE } from './guard.ts'

export default {
  ...SCHEDULE_GUARD_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE ${SCHEDULE_QUOTA_TABLE} (schedule_id TEXT PRIMARY KEY, bucket TEXT NOT NULL, reservation TEXT NOT NULL, held INTEGER NOT NULL)`,
      [],
    )
  },
  verify(port) {
    port.execute(`SELECT * FROM ${SCHEDULE_QUOTA_TABLE} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
