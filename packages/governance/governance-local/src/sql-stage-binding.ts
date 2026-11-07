import type { CommitRequestV2, SqlIdentity } from '@omne-harness/sql-contract'
import type { GovernanceOperationRef } from '@omne-harness/governance-contract'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import {
  METADATA_PLANNER,
  MUTATION_PLANNER,
  ADOPTION_PLANNER,
  businessRequestSchema,
  controlRequestSchema,
  type ControlRequest,
} from './activation-schema.ts'
import { GOVERNANCE_OWNER } from './migration.ts'
import { digest, equal, canonical, operationIdentity } from './encoding.ts'
import type { OperationRecord, OperationBinding } from './operation-schema.ts'
import { readGovernanceStanding } from './standing-custody.ts'
import { standingRecoverySchema } from './standing-schema.ts'
import type { SqlStage } from './sql-stage-schema.ts'

export function stageIdentity(
  domain: string,
  ref: GovernanceOperationRef,
  stage: SqlStage,
): SqlIdentity {
  const identity = operationIdentity(domain, ref)
  return stage === 'apply' ? identity : { ...identity, operation: 'governance.meta.' + stage }
}
function matchesStanding(
  port: ReadPort,
  binding: OperationBinding,
  reservation: Extract<ControlRequest, { kind: 'standing-held' }>['reservation'],
) {
  const custody = readGovernanceStanding(port, binding)
  return (
    'request' in custody &&
    custody.reservationId === reservation.id &&
    equal(custody.request, {
      binding: reservation.binding,
      required: reservation.required,
    })
  )
}
function matchesRecovery(
  port: ReadPort,
  binding: OperationBinding,
  request: Extract<ControlRequest, { kind: 'standing-seal' }>,
) {
  const recovery = standingRecoverySchema.parse(JSON.parse(request.reservation.binding.targetRef))
  return (
    canonical(recovery) === request.reservation.binding.targetRef &&
    equal(recovery.operation, binding) &&
    recovery.transactionDomain === request.route.transactionDomain &&
    request.reservation.binding.destination === request.route.destination &&
    matchesStanding(port, binding, request.reservation)
  )
}
function controlBinding(port: ReadPort, binding: OperationBinding, request: ControlRequest) {
  switch (request.kind) {
    case 'standing-prepare':
      return equal(request.input.operation, binding)
    case 'submit':
    case 'seal':
      return equal(request.binding, binding)
    case 'standing-held':
    case 'standing-settled':
      return equal(request.binding, binding) && matchesStanding(port, binding, request.reservation)
    case 'standing-seal':
      return matchesRecovery(port, binding, request)
    default:
      return false
  }
}
const businessPlanners = {
  contribute: MUTATION_PLANNER,
  withdraw: MUTATION_PLANNER,
  adopt: ADOPTION_PLANNER,
}
function validateBusiness(
  binding: OperationBinding,
  record: OperationRecord,
  envelope: CommitRequestV2,
) {
  const planner = businessPlanners[record.request.owner]
  const facts = envelope.commands.find(command => command.participant === planner)?.facts
  const business = businessRequestSchema.parse(facts?.request)
  if (
    !equal(business.binding, binding) ||
    !equal(business.execution, record.execution) ||
    business.execution.combinationVersion !== envelope.combinationVersion ||
    business.execution.manifestDigest !== envelope.manifestDigest
  )
    throw new Error('Governance apply envelope mismatch')
  const foreignPlanner = envelope.commands.some(
    command =>
      [METADATA_PLANNER, MUTATION_PLANNER, ADOPTION_PLANNER].includes(command.participant) &&
      command.participant !== planner,
  )
  if (foreignPlanner) throw new Error('Governance apply has a foreign planner')
  return { planner, request: business }
}
function validateControl(
  port: ReadPort,
  binding: OperationBinding,
  record: OperationRecord,
  stage: SqlStage,
  envelope: CommitRequestV2,
) {
  const facts = envelope.commands.find(command => command.participant === METADATA_PLANNER)?.facts
  const request = controlRequestSchema.parse(facts?.request)
  if (
    envelope.commands.length !== 2 ||
    request.kind !== stage ||
    !controlBinding(port, binding, request)
  )
    throw new Error('Governance metadata envelope mismatch')
  if (
    request.kind === 'submit' &&
    record.execution !== null &&
    !equal(request.execution, record.execution)
  )
    throw new Error('Governance submit envelope mismatch')
  return { planner: METADATA_PLANNER, request }
}
export function validateStageEnvelope(
  port: ReadPort,
  binding: OperationBinding,
  record: OperationRecord,
  stage: SqlStage,
  envelope: CommitRequestV2,
) {
  if (
    !equal(
      envelope.identity,
      stageIdentity(record.sqlIdentity.transactionDomain, binding.ref, stage),
    )
  )
    throw new Error('Governance stage identity mismatch')
  const commands = new Map(envelope.commands.map(command => [command.participant, command.facts]))
  if (commands.size !== envelope.commands.length)
    throw new Error('Duplicate governance stage participant')
  const plan =
    stage === 'apply'
      ? validateBusiness(binding, record, envelope)
      : validateControl(port, binding, record, stage, envelope)
  if (
    !equal(commands.get(plan.planner), { request: plan.request }) ||
    !equal(commands.get(GOVERNANCE_OWNER), { requestDigest: digest(plan.request) })
  )
    throw new Error('Governance stage command mismatch')
}
