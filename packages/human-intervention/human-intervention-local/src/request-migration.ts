import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { REQUEST_MIGRATION } from './request-schema.ts'
export default {
  ...REQUEST_MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE hi_requests (sequence INTEGER PRIMARY KEY AUTOINCREMENT, tenant_ref TEXT NOT NULL, request_id TEXT NOT NULL, record TEXT NOT NULL, UNIQUE (tenant_ref, request_id))',
      [],
    )
    port.execute(
      'CREATE TABLE hi_request_versions (tenant_ref TEXT PRIMARY KEY, revision TEXT NOT NULL)',
      [],
    )
  },
  verify(port) {
    port.execute('SELECT * FROM hi_requests LIMIT 0', [])
    port.execute('SELECT * FROM hi_request_versions LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
