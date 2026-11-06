import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { canonical, digest, equal, json } from './encoding.ts'
import { HitlSqlBindingSchema } from './terminal-schema.ts'
import { PLAN_FACT, RequestPlanSchema, WAIT_ACCEPTED_FACT } from './request-schema.ts'
import { WAIT_ACCEPT, WAIT_PROTOCOL } from './independent-schema.ts'
import { waitKey } from './independent-records.ts'

export default {
  participant: WAIT_ACCEPT,
  protocol: WAIT_PROTOCOL,
  execute(facts, port) {
    const binding = HitlSqlBindingSchema.parse(facts['binding'])
    const plan = RequestPlanSchema.parse(port.requireFact(PLAN_FACT))
    if (!equal(binding, plan.binding)) return { kind: 'failed', diagnostic: 'wait_plan_binding' }
    const key = waitKey(binding.operationRef.tenantRef, plan.waitRef)
    if (plan.effect.kind === 'register') {
      port.execute('INSERT INTO hi_wait_active (wait_key, record) VALUES (?, ?)', [
        key,
        canonical({ requestRef: plan.effect.requestRef, cardIds: plan.effect.cardIds }),
      ])
    } else if (plan.effect.kind === 'deliver') {
      if (!plan.update) return { kind: 'failed', diagnostic: 'wait_missing_request_update' }
      port.execute('INSERT INTO hi_wait_inbox (wait_key, decision_key, record) VALUES (?, ?, ?)', [
        key,
        digest(plan.effect.decision.ref),
        canonical({
          decision: plan.effect.decision,
          wait: plan.waitRef,
          positionRef: plan.update.origin.positionRef,
          adoptionRef: plan.update.origin.adoptionRef,
        }),
      ])
    }
    const receipt = { binding, planDigest: digest(plan) }
    port.provideFact(WAIT_ACCEPTED_FACT, json(receipt))
    return { kind: 'participated', response: json(receipt) }
  },
} satisfies ParticipantModule
