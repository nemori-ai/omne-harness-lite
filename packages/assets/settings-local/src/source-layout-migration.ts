import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import { stateRecordSchema, SOURCE_LAYOUT_MIGRATION } from './schema.ts'

function visit(port: Parameters<MigrationModule['up']>[0], migrate: boolean): boolean {
  let after = ''
  for (;;) {
    const rows = port.execute(
      'SELECT target_key, record FROM st_states WHERE target_key > ? ORDER BY target_key LIMIT 64',
      [after],
    ).rows
    for (const row of rows) {
      after = z.string().parse(row[0])
      const raw = z.record(z.string(), z.unknown()).parse(JSON.parse(z.string().parse(row[1])))
      if (Object.hasOwn(raw, 'sourceLayout')) {
        stateRecordSchema.parse(raw)
      } else {
        if (!migrate) return false
        const legacy = z
          .object({
            state: z
              .object({ sources: z.array(z.object({ id: z.string() }).passthrough()) })
              .passthrough(),
          })
          .passthrough()
          .parse(raw)
        const next = {
          ...legacy,
          sourceLayout: {
            kind: 'unmapped',
            sourceIds: legacy.state.sources.map(source => source.id),
          },
        }
        stateRecordSchema.parse(next)
        port.execute('UPDATE st_states SET record = ? WHERE target_key = ?', [
          JSON.stringify(next),
          after,
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
        : { kind: 'failed', diagnostic: 'st_states_source_layout_missing' }
    } catch {
      return { kind: 'failed', diagnostic: 'st_states_source_layout_invalid' }
    }
  },
} satisfies MigrationModule
