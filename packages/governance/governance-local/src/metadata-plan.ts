import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { ACTIVATION_PLAN, METADATA_PLANNER, controlRequestSchema } from './activation-schema.ts'
import { json, equal, canonical } from './encoding.ts'
export default {
  participant: METADATA_PLANNER,
  protocol: ACTIVATION_PLAN.protocol,
  execute(facts, port) {
    if (Buffer.byteLength(canonical(facts['request'])) > 5 * 1024 * 1024)
      throw new Error('Governance metadata request exceeds budget')
    const request = controlRequestSchema.parse(facts['request'])
    if (request.kind === 'persist-stage' && !equal(request, facts['request']))
      throw new Error('Noncanonical governance SQL custody request')
    port.provideFact(ACTIVATION_PLAN, json({ kind: 'control', request }))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
