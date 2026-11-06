import { z } from 'zod'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { sourceReferenceSchema, sourceUpdateSchema } from './source-retention-schema.ts'
import { readSourceGate } from './source-retention-records.ts'
import { equal, json, withinBudget } from './encoding.ts'

export const SOURCE_READINESS_PARTICIPANT = 'settings.source-readiness'
export const SOURCE_READINESS_PROTOCOL = 'settings-source-readiness/1'
export const SOURCE_READINESS_FACT = {
  key: SOURCE_READINESS_PARTICIPANT,
  protocol: SOURCE_READINESS_PROTOCOL,
}
export const sourceReadinessFactSchema = z
  .strictObject({
    binding: settingsAttemptBindingSchema,
    gate: z.strictObject({
      kind: z.literal('gate'),
      source: sourceReferenceSchema,
      pending: sourceUpdateSchema.nullable(),
      held: z.number().int().min(0).max(128),
    }),
  })
  .refine(
    fact =>
      equal(fact.gate.source, {
        domain: fact.binding.identity.domain,
        target: fact.binding.identity.operation.target,
      }) &&
      (fact.gate.pending === null || equal(fact.gate.pending.source, fact.gate.source)),
  )
export default {
  participant: SOURCE_READINESS_PARTICIPANT,
  protocol: SOURCE_READINESS_PROTOCOL,
  execute(facts, port) {
    if (!withinBudget(facts))
      return { kind: 'failed', diagnostic: 'settings_source_readiness_limit' }
    const parsed = settingsAttemptBindingSchema.safeParse(facts['binding'])
    if (!parsed.success) return { kind: 'failed', diagnostic: 'settings_source_readiness_binding' }
    try {
      const binding = parsed.data
      const gate = readSourceGate(port, {
        domain: binding.identity.domain,
        target: binding.identity.operation.target,
      })
      port.provideFact(
        SOURCE_READINESS_FACT,
        json(sourceReadinessFactSchema.parse({ binding, gate })),
      )
      return { kind: 'participated', response: null }
    } catch {
      return { kind: 'failed', diagnostic: 'settings_source_readiness_invalid_data' }
    }
  },
} satisfies ParticipantModule
