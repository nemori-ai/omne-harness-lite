import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import { holdingSchema, SOURCE_LAYOUT_MIGRATION } from './schema.ts'

function visit(port: Parameters<MigrationModule['up']>[0], migrate: boolean): boolean {
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
      const raw = z.record(z.string(), z.unknown()).parse(JSON.parse(z.string().parse(row[2])))
      if (Object.hasOwn(raw, 'sourceLayout')) {
        holdingSchema.parse(raw)
      } else {
        if (!migrate) return false
        const { sourceIds, ...rest } = z
          .object({ sourceIds: z.array(z.string()) })
          .passthrough()
          .parse(raw)
        const next = { ...rest, sourceLayout: { kind: 'unmapped', sourceIds } }
        holdingSchema.parse(next)
        port.execute('UPDATE al_holdings SET record = ? WHERE scope_key = ? AND holding_ref = ?', [
          JSON.stringify(next),
          scope,
          holding,
        ])
      }
    }
    if (rows.length < 64) return true
  }
}
export default {
  ...SOURCE_LAYOUT_MIGRATION,
  up(port) {
    visit(port, true)
  },
  verify(port) {
    try {
      return visit(port, false)
        ? { kind: 'verified' }
        : { kind: 'failed', diagnostic: 'assets_source_layout_missing' }
    } catch {
      return { kind: 'failed', diagnostic: 'assets_source_layout_invalid' }
    }
  },
} satisfies MigrationModule
