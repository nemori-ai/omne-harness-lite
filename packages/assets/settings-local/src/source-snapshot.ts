import { z } from 'zod'
import { sourceSettlementFactSchema } from './source-service-schema.ts'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { sourceObservationSchema, sourceRequestSchema } from './source-retention-schema.ts'
import { captureSource } from './source-capture.ts'
import { json, withinBudget } from './encoding.ts'

import {
  SOURCE_SNAPSHOT_PARTICIPANT,
  SOURCE_SNAPSHOT_PROTOCOL,
  SOURCE_SNAPSHOT_FACT,
} from './source-retention-schema.ts'
import { sourceWriteObservationSchema } from './source-write.ts'
export {
  SOURCE_SNAPSHOT_PARTICIPANT,
  SOURCE_SNAPSHOT_PROTOCOL,
  SOURCE_SNAPSHOT_FACT,
} from './source-retention-schema.ts'
export const sourceSnapshotFactSchema = z.strictObject({
  request: sourceRequestSchema,
  observation: sourceObservationSchema,
})
export default {
  participant: SOURCE_SNAPSHOT_PARTICIPANT,
  protocol: SOURCE_SNAPSHOT_PROTOCOL,
  execute(facts, port) {
    if (!withinBudget(facts))
      return { kind: 'failed', diagnostic: 'settings_source_snapshot_limit' }
    if (facts['kind'] === 'settlement') {
      port.provideFact(SOURCE_SNAPSHOT_FACT, json(sourceSettlementFactSchema.parse(facts)))
      return { kind: 'participated', response: null }
    }
    if (facts['kind'] === 'write') {
      const write = sourceWriteObservationSchema.safeParse(facts)
      if (!write.success) return { kind: 'failed', diagnostic: 'settings_source_write_input' }
      port.provideFact(SOURCE_SNAPSHOT_FACT, json(write.data))
      return { kind: 'participated', response: null }
    }
    const parsed = sourceRequestSchema.safeParse(facts['request'])
    if (!parsed.success) return { kind: 'failed', diagnostic: 'settings_source_snapshot_input' }
    try {
      const fact = sourceSnapshotFactSchema.parse({
        request: parsed.data,
        observation: captureSource(port, parsed.data.source),
      })
      if (!withinBudget(fact))
        return { kind: 'failed', diagnostic: 'settings_source_snapshot_limit' }
      port.provideFact(SOURCE_SNAPSHOT_FACT, json(fact))
      return { kind: 'participated', response: null }
    } catch {
      return { kind: 'failed', diagnostic: 'settings_source_snapshot_invalid_data' }
    }
  },
} satisfies ParticipantModule
