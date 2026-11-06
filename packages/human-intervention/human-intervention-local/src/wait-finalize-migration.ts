import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { WAIT_FINAL_MIGRATION } from './wait-schema.ts'
import { MigrationExportSchema } from './migration-export.ts'
import { parseJson } from './relational-values.ts'
import { z } from 'zod'
export default {
  ...WAIT_FINAL_MIGRATION,
  up(port) {
    let tenant = '',
      request = ''
    for (;;) {
      const row = port.execute(
        'SELECT tenant_ref,request_id,export_json FROM hi_wait_hitl_export_v2 WHERE (tenant_ref,request_id)>(?,?) ORDER BY tenant_ref,request_id LIMIT 1',
        [tenant, request],
      ).rows[0]
      if (!row) break
      tenant = z.string().parse(row[0])
      request = z.string().parse(row[1])
      const proof = MigrationExportSchema.parse(parseJson(row[2]))
      const adopted = port.execute(
        'SELECT audience_digest FROM hi_requests_v2 WHERE tenant_ref=? AND request_id=? LIMIT 1',
        [tenant, request],
      ).rows[0]
      if (adopted?.[0] !== proof.audience.audienceDigest)
        throw new TypeError('Unadopted migration audience')
    }
    port.execute('DROP TABLE hi_wait_hitl_export_v2', [])
  },
  verify(port) {
    return port.execute(
      "SELECT 1 FROM sqlite_schema WHERE name='hi_wait_hitl_export_v2' LIMIT 1",
      [],
    ).rows.length
      ? { kind: 'failed', diagnostic: 'migration_export_retained' }
      : { kind: 'verified' }
  },
} satisfies MigrationModule
