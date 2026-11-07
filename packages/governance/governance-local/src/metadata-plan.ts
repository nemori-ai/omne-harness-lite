import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { ACTIVATION_PLAN, METADATA_PLANNER, controlRequestSchema } from './activation-schema.ts'
import { json } from './encoding.ts'
export default {
  participant: METADATA_PLANNER,
  protocol: ACTIVATION_PLAN.protocol,
  execute(facts, port) {
    const request = controlRequestSchema.parse(facts['request'])
    port.provideFact(ACTIVATION_PLAN, json({ kind: 'control', request }))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
