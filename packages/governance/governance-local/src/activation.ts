import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  ACTIVATION_PLAN,
  ACTIVATION_PROTOCOL,
  activationInputSchema,
  activationPlanSchema,
  type ControlRequest,
  type ActivationPlan,
} from './activation-schema.ts'
import { GOVERNANCE_OWNER } from './migration.ts'
import { bootstrapScope } from './scope.ts'
import { acceptOperation, boundOperation, sealOperation, submitOperation } from './operation.ts'
import {
  prepareGovernanceStanding,
  recordGovernanceHeld,
  recordGovernanceSettled,
} from './standing-custody.ts'
import { applyStandingOperation, sealGovernanceStanding } from './standing-operation.ts'
import { persistSqlStage, requireApplyStage } from './sql-stage.ts'
import { digest, json } from './encoding.ts'

function control(
  port: ParticipantPort,
  request: Exclude<ControlRequest, { kind: 'persist-stage' }>,
) {
  switch (request.kind) {
    case 'bootstrap':
      return bootstrapScope(port, request.input)
    case 'accept':
      return acceptOperation(port, request.input)
    case 'standing-prepare':
      return prepareGovernanceStanding(port, request.input)
    case 'standing-held':
      return recordGovernanceHeld(port, request.binding, request.reservation)
    case 'standing-settled':
      return recordGovernanceSettled(port, request.binding, request.reservation, request.outcome)
    case 'submit':
      return submitOperation(port, request.binding, request.execution)
    case 'seal':
      return sealOperation(port, request.binding)
    case 'standing-seal':
      return sealGovernanceStanding(port, request.reservation, request.route)
    default: {
      const exhaustive: never = request
      return exhaustive
    }
  }
}
function applyPlan(port: ParticipantPort, plan: Exclude<ActivationPlan, { kind: 'control' }>) {
  const found = boundOperation(port, plan.request.binding)
  if (
    found.kind !== 'found' ||
    found.record.state === 'committed' ||
    found.record.state === 'aborted'
  )
    return found
  if (plan.kind === 'observation') throw new Error('Governance observation is not terminal')
  if (
    found.record.epoch !== plan.epoch ||
    found.record.sqlIdentity.transactionDomain !== plan.transactionDomain
  )
    throw new Error('Governance plan binding changed')
  if ((found.record.request.owner === 'adopt') !== (plan.kind === 'adoption'))
    throw new Error('Governance plan owner mismatch')
  requireApplyStage(port, plan.request.binding, found.record.execution, plan.request.execution)
  return applyStandingOperation(
    port,
    plan.request.binding,
    plan.request.execution,
    plan.kind === 'adoption' ? plan.evidence : undefined,
  )
}
function metadata(port: ParticipantPort, request: ControlRequest) {
  return request.kind === 'persist-stage'
    ? persistSqlStage(port, request.input)
    : control(port, request)
}
export default {
  participant: GOVERNANCE_OWNER,
  protocol: ACTIVATION_PROTOCOL,
  execute(facts, port) {
    const input = activationInputSchema.parse(facts)
    const plan = activationPlanSchema.parse(port.requireFact(ACTIVATION_PLAN))
    if (digest(plan.request) !== input.requestDigest)
      throw new Error('Governance plan request mismatch')
    const response = plan.kind === 'control' ? metadata(port, plan.request) : applyPlan(port, plan)
    return { kind: 'participated', response: json(response) }
  },
} satisfies ParticipantModule
