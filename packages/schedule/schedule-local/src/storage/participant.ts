import { decideScheduleManagement } from '@omne-harness/schedule'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  ScheduleOperationViewSchema,
  type ScheduleDomainError,
} from '@omne-harness/schedule-contract'
import { canonical, commandMatches, domainError, equal, json } from './encoding.ts'
import { scheduleManagementGuardRequirement } from './guards.ts'
import { readRecord, saveDecision } from './records.ts'
import {
  GUARD_FACT,
  PARTICIPANT,
  PROTOCOL,
  RESULT_FACT,
  guardRequirementSchema,
  guardFactSchema,
} from './schema.ts'
import type { ScheduleManagementGuardRequirement } from './guards.ts'

function rejection(requirement: ScheduleManagementGuardRequirement, error: ScheduleDomainError) {
  return { kind: 'conflict', basis: json({ binding: requirement.binding, error }) } as const
}
function execute(requirement: ScheduleManagementGuardRequirement, port: ParticipantPort) {
  const { binding } = requirement
  const { command, scope } = binding
  const fail = (code: ScheduleDomainError['code'], message: string) =>
    rejection(requirement, domainError(code, command.input.requestId, message))
  if (!commandMatches(scope, command))
    return fail('forbidden', 'Management identity or storage scope mismatch')
  const preliminary = decideScheduleManagement(command.input)
  if (preliminary.kind === 'rejected') return rejection(requirement, preliminary.error)
  if (!equal(requirement, scheduleManagementGuardRequirement(scope, command)))
    return fail('forbidden', 'Guard requirement does not match the management command')
  const fact = guardFactSchema.safeParse(port.requireFact(GUARD_FACT))
  if (
    !fact.success ||
    !equal(fact.data.binding, binding) ||
    !equal(fact.data.quotaEffect, requirement.quotaEffect) ||
    !equal(fact.data.resultingHolding, requirement.resultingHolding)
  )
    return fail('forbidden', 'Guard fact does not bind this operation and its complete evidence')
  const request = command.input.request
  const target = request.kind === 'execute' ? request.input.scheduleId : command.input.allocatedId
  const current = target === null ? null : readRecord(port, binding.operation.scope.owner, target)
  const decision = decideScheduleManagement({
    ...command.input,
    current,
    now: fact.data.decisionAt,
  })
  if (decision.kind === 'rejected') return rejection(requirement, decision.error)
  if (
    !equal(decision.quota, fact.data.quotaEffect) ||
    !equal(command.input.quotaObservation.resultingHolding, fact.data.resultingHolding)
  )
    return fail('stale_basis', 'Quota evidence no longer matches the locked decision')
  if (
    decision.mutation.kind === 'replace' &&
    readRecord(port, binding.operation.scope.owner, decision.mutation.successor.view.scheduleId) !==
      null
  )
    return fail('revision_conflict', 'Successor identity already exists')
  saveDecision(port, decision)
  const view = ScheduleOperationViewSchema.parse({
    kind: decision.mutation.kind === 'noChange' ? 'noChange' : 'committed',
    operationRef: binding.operation.operationRef,
    observedAt: fact.data.decisionAt,
    result: decision.result,
    error: null,
    notCommittedProofs: null,
  })
  port.execute(
    'INSERT INTO sc_operations (operation_ref, recovery_scope, binding, result) VALUES (?, ?, ?, ?)',
    [view.operationRef, canonical(binding.operation.scope), canonical(binding), canonical(view)],
  )
  const response = json({ binding, view })
  port.provideFact(RESULT_FACT, response)
  return { kind: 'participated', response } as const
}
export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const parsed = guardRequirementSchema.safeParse(facts['requirement'])
    if (!parsed.success) return { kind: 'failed', diagnostic: 'invalid_management_requirement' }
    return execute(parsed.data, port)
  },
} satisfies ParticipantModule
