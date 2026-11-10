import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { json, withinBudget } from './encoding.ts'
import { sourceWriteObservationSchema } from './source-write.ts'
import {
  SOURCE_SNAPSHOT_FACT,
  SOURCE_SNAPSHOT_PARTICIPANT,
  SOURCE_SNAPSHOT_PROTOCOL,
} from './source-retention-schema.ts'
export function projectSourceWrite(raw: unknown, port: ParticipantPort) {
  if (!withinBudget(raw))
    return { kind: 'failed' as const, diagnostic: 'settings_source_write_limit' }
  const parsed = sourceWriteObservationSchema.safeParse(raw)
  if (!parsed.success) return { kind: 'failed' as const, diagnostic: 'settings_source_write_input' }
  port.provideFact(SOURCE_SNAPSHOT_FACT, json(parsed.data))
  return { kind: 'participated' as const, response: null }
}
export default {
  participant: SOURCE_SNAPSHOT_PARTICIPANT,
  protocol: SOURCE_SNAPSHOT_PROTOCOL,
  execute: projectSourceWrite,
} satisfies ParticipantModule
