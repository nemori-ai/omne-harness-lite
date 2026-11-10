import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import { ENABLEMENT_MIGRATION } from './schema.ts'

export default {
  ...ENABLEMENT_MIGRATION,
  up(port) {
    const legacySchema = z.object({ enabled: z.boolean().optional() }).passthrough()
    let scope = '',
      holding = ''
    for (;;) {
      const rows = port.execute(
        'SELECT scope_key, holding_ref, record FROM al_holdings WHERE (scope_key, holding_ref) > (?, ?) ORDER BY scope_key, holding_ref LIMIT 64',
        [scope, holding],
      ).rows
      for (const row of rows) {
        scope = z.string().parse(row[0])
        holding = z.string().parse(row[1])
        const record = legacySchema.parse(JSON.parse(z.string().parse(row[2])))
        if (record.enabled !== undefined) continue
        port.execute('UPDATE al_holdings SET record = ? WHERE scope_key = ? AND holding_ref = ?', [
          JSON.stringify({ ...record, enabled: true }),
          scope,
          holding,
        ])
      }
      if (rows.length < 64) break
    }
  },
  verify(port) {
    const invalid = port.execute(
      "SELECT holding_ref FROM al_holdings WHERE json_type(record, '$.enabled') IS NULL OR json_type(record, '$.enabled') NOT IN ('true', 'false') LIMIT 1",
      [],
    ).rows
    return invalid.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'assets_enablement_invalid' }
  },
} satisfies MigrationModule
