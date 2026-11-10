import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { ACTIVATION_PLAN, MUTATION_PLANNER } from './activation-schema.ts'
import { businessOriginal } from './business-plan.ts'
import { json } from './encoding.ts'
export default {
  participant: MUTATION_PLANNER,
  protocol: ACTIVATION_PLAN.protocol,
  execute(facts, port) {
    const original = businessOriginal(port, facts['request'], 'mutation')
    const plan = original.kind === 'observation' ? original : { ...original, kind: 'mutation' }
    port.provideFact(ACTIVATION_PLAN, json(plan))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
