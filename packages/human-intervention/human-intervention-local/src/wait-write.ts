import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { digest, equal, json } from './encoding.ts'
import { JointPlanSchema } from './joint-schema.ts'
import { PLAN_FACT, WAIT_ACCEPTED_FACT, WAIT_BASIS_FACT } from './request-schema.ts'
import { HitlSqlBindingSchema } from './terminal-schema.ts'
import { WAIT_PROTOCOL } from './independent-schema.ts'
import { WAIT_WRITER, WaitPlanSchema } from './wait-schema.ts'
import { applyWaitDelta, insertActive, insertInbox } from './wait-store.ts'
import { countSchema } from './relational-values.ts'
import { waitKey } from './wait-record.ts'

export default {
  participant: WAIT_WRITER,
  protocol: WAIT_PROTOCOL,
  execute(facts, port) {
    const binding = HitlSqlBindingSchema.parse(facts['binding'])
    const wait = WaitPlanSchema.parse(port.requireFact(WAIT_BASIS_FACT))
    const joint = JointPlanSchema.parse(port.requireFact(PLAN_FACT))
    if (
      !equal(binding, wait.binding) ||
      !equal(binding, joint.plan.binding) ||
      joint.waitPlanDigest !== digest(wait) ||
      !equal(joint.plan.waitRef, wait.waitRef)
    )
      return { kind: 'failed', diagnostic: 'wait_plan_binding' }
    if (joint.kind === 'wait-operation') {
      if (wait.kind !== 'wait-operation' || !equal(wait, joint.plan))
        return { kind: 'failed', diagnostic: 'wait_recovery_plan' }
      applyWaitDelta(port, wait)
      port.provideFact(WAIT_ACCEPTED_FACT, json({ binding, planDigest: digest(joint) }))
      return { kind: 'participated', response: json(wait.response) }
    }
    if (wait.kind !== 'request-basis') return { kind: 'failed', diagnostic: 'wait_request_plan' }
    applyWaitDelta(port, wait)
    const plan = joint.plan,
      tenant = binding.operationRef.tenantRef
    if (plan.effect.kind === 'register') {
      if (
        plan.update.kind !== 'register' ||
        !equal(plan.update.record.ref, plan.effect.requestRef) ||
        !equal(
          plan.update.record.cards.map(card => card.ref.cardId),
          plan.effect.cardIds,
        ) ||
        !equal(plan.update.audience, wait.basis.readAudience)
      )
        return { kind: 'failed', diagnostic: 'wait_registration_effect' }
      insertActive(port, tenant, plan.waitRef, plan.effect.requestRef, plan.effect.cardIds)
    } else if (plan.effect.kind === 'deliver') {
      if (plan.update.kind !== 'decide')
        return { kind: 'failed', diagnostic: 'wait_decision_effect' }
      const decision = plan.effect.decision
      const row = port.execute(
        `SELECT c.card_ordinal,a.request_id FROM hi_wait_cards_v2 c JOIN hi_wait_active_v2 a USING(tenant_ref,wait_key)
 WHERE c.tenant_ref=? AND c.wait_key=? AND c.card_id=? LIMIT 1`,
        [tenant, waitKey(tenant, plan.waitRef), decision.ref.card.cardId],
      ).rows[0]
      if (
        !row ||
        row[1] !== decision.ref.card.request.requestId ||
        decision.ref.card.request.tenantRef !== tenant ||
        countSchema.parse(row[0]) !== plan.update.ordinal
      )
        return { kind: 'failed', diagnostic: 'wait_card_binding' }
      insertInbox(port, {
        tenant,
        wait: plan.waitRef,
        ordinal: plan.update.ordinal,
        owner: wait.ownerActor,
        decision,
        pending: true,
      })
    }
    const accepted = { binding, planDigest: digest(joint) }
    port.provideFact(WAIT_ACCEPTED_FACT, json(accepted))
    return { kind: 'participated', response: json(accepted) }
  },
} satisfies ParticipantModule
