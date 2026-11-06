import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { digest, equal, json } from './encoding.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import {
  LOCAL_PROTOCOL,
  PLAN_FACT,
  REQUEST_PLANNER,
  RequestPlanSchema,
  SqlCommandSchema,
  WAIT_BASIS_FACT,
} from './request-schema.ts'
import { WaitPlanSchema } from './wait-schema.ts'
import { JointPlanSchema } from './joint-schema.ts'
import { planRequest } from './request-plan.ts'

export default {
  participant: REQUEST_PLANNER,
  protocol: LOCAL_PROTOCOL,
  execute(facts, port) {
    const wait = WaitPlanSchema.parse(port.requireFact(WAIT_BASIS_FACT))
    const binding = wait.binding
    if (!equal(port.requireFact(TERMINAL_FACT), { kind: 'consume', binding }))
      return { kind: 'failed', diagnostic: 'local_terminal_binding' }
    const waitPlanDigest = digest(wait)
    if (wait.kind === 'wait-operation') {
      if (!equal(facts['binding'], binding))
        return { kind: 'failed', diagnostic: 'local_recovery_binding' }
      const joint = JointPlanSchema.parse({ kind: 'wait-operation', waitPlanDigest, plan: wait })
      port.provideFact(PLAN_FACT, json(joint))
      return { kind: 'participated', response: json({ binding, planDigest: digest(joint) }) }
    }
    const input = SqlCommandSchema.parse(facts['input'])
    if (
      !equal(binding, { operationRef: input.command.operation, inputDigest: digest(input) }) ||
      !equal(binding, wait.basis.binding) ||
      input.method !== wait.basis.method ||
      !equal(wait.waitRef, wait.basis.origin.wait)
    )
      return { kind: 'failed', diagnostic: 'local_request_binding' }
    const audience = wait.basis.readAudience
    if (
      input.method === 'registerRequest' &&
      (!audience ||
        audience.tenantRef !== binding.operationRef.tenantRef ||
        !equal(audience.waitRef, wait.waitRef) ||
        audience.preparationRef !== wait.basis.preparationRef ||
        audience.registrationDigest !== wait.basis.registrationDigest ||
        !audience.readers.includes(wait.ownerActor))
    )
      return { kind: 'failed', diagnostic: 'local_read_audience' }
    const planned = RequestPlanSchema.parse(planRequest(input, wait.basis, port))
    const joint = JointPlanSchema.parse({ kind: 'request-plan', waitPlanDigest, plan: planned })
    port.provideFact(PLAN_FACT, json(joint))
    return { kind: 'participated', response: json({ binding, planDigest: digest(joint) }) }
  },
} satisfies ParticipantModule
