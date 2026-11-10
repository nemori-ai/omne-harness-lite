import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import { STANDALONE_ENABLEMENT_MIGRATION } from './standalone-schema.ts'

export default {
  ...STANDALONE_ENABLEMENT_MIGRATION,
  up(port) {
    const legacySchema = z
      .object({
        projection: z.object({ enabled: z.boolean().optional() }).passthrough(),
      })
      .passthrough()
    let after = ''
    for (;;) {
      const rows = port.execute(
        'SELECT target_key, record FROM st_targets WHERE target_key > ? ORDER BY target_key LIMIT 64',
        [after],
      ).rows
      for (const row of rows) {
        after = z.string().parse(row[0])
        const record = legacySchema.parse(JSON.parse(z.string().parse(row[1])))
        if (record.projection.enabled !== undefined) continue
        port.execute('UPDATE st_targets SET record = ? WHERE target_key = ?', [
          JSON.stringify({ ...record, projection: { ...record.projection, enabled: true } }),
          after,
        ])
      }
      if (rows.length < 64) break
    }
  },
  verify(port) {
    const invalid = port.execute(
      "SELECT target_key FROM st_targets WHERE json_type(record, '$.projection.enabled') IS NULL OR json_type(record, '$.projection.enabled') NOT IN ('true', 'false') LIMIT 1",
      [],
    ).rows
    return invalid.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'settings_target_enablement_invalid' }
  },
} satisfies MigrationModule
