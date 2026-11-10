import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import { StandaloneRecordSchema, STANDALONE_SOURCE_LAYOUT_MIGRATION } from './standalone-schema.ts'

function visit(port: Parameters<MigrationModule['up']>[0], migrate: boolean): boolean {
  let after = ''
  for (;;) {
    const rows = port.execute(
      'SELECT target_key, record FROM st_targets WHERE target_key > ? ORDER BY target_key LIMIT 64',
      [after],
    ).rows
    for (const row of rows) {
      after = z.string().parse(row[0])
      const raw = z.record(z.string(), z.unknown()).parse(JSON.parse(z.string().parse(row[1])))
      if (
        Object.hasOwn(
          z.object({ projection: z.record(z.string(), z.unknown()) }).parse(raw).projection,
          'sourceLayout',
        )
      ) {
        StandaloneRecordSchema.parse(raw)
      } else {
        if (!migrate) return false
        const legacy = z
          .object({ projection: z.object({ sourceIds: z.array(z.string()) }).passthrough() })
          .passthrough()
          .parse(raw)
        const { sourceIds, ...projection } = legacy.projection
        const next = {
          ...legacy,
          projection: { ...projection, sourceLayout: { kind: 'unmapped', sourceIds } },
        }
        StandaloneRecordSchema.parse(next)
        port.execute('UPDATE st_targets SET record = ? WHERE target_key = ?', [
          JSON.stringify(next),
          after,
        ])
      }
    }
    if (rows.length < 64) return true
  }
}
export default {
  ...STANDALONE_SOURCE_LAYOUT_MIGRATION,
  up(port) {
    visit(port, true)
  },
  verify(port) {
    try {
      return visit(port, false)
        ? { kind: 'verified' }
        : { kind: 'failed', diagnostic: 'st_targets_source_layout_missing' }
    } catch {
      return { kind: 'failed', diagnostic: 'st_targets_source_layout_invalid' }
    }
  },
} satisfies MigrationModule
