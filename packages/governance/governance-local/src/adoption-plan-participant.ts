import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { ACTIVATION_PLAN, ADOPTION_CURRENT, ADOPTION_PLANNER } from './activation-schema.ts'
import { adoptionEvidenceSchema } from './adoption-schema.ts'
import { businessOriginal } from './business-plan.ts'
import { json, equal, canonical } from './encoding.ts'
function currentEvidence(port: ParticipantPort) {
  const raw = port.requireFact(ADOPTION_CURRENT)
  if (Buffer.byteLength(canonical(raw)) > 2 * 1024 * 1024)
    throw new Error('Governance current evidence exceeds byte limit')
  const parsed = adoptionEvidenceSchema.parse(raw)
  if (!equal(raw, parsed)) throw new Error('Governance current evidence is not canonical')
  return parsed
}
export default {
  participant: ADOPTION_PLANNER,
  protocol: ACTIVATION_PLAN.protocol,
  execute(facts, port) {
    const original = businessOriginal(port, facts['request'], 'adoption')
    const plan =
      original.kind === 'observation'
        ? original
        : {
            ...original,
            kind: 'adoption',
            evidence: currentEvidence(port),
          }
    port.provideFact(ACTIVATION_PLAN, json(plan))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
