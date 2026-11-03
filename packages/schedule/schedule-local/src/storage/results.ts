import {
  createScheduleManagementOperationRef,
  type OperationIdentity,
} from '@omne-harness/schedule'
import {
  ScheduleInstantSchema,
  ScheduleNotCommittedProofsSchema,
  type ScheduleOperationView,
} from '@omne-harness/schedule-contract'
import type { QueryResultV2, ReceiptV2, StorageScope } from '@omne-harness/sql-contract'
import { commandDigest, commandMatches, domainError, equal, sqlIdentity } from './encoding.ts'
import { scheduleManagementGuardRequirement } from './guards.ts'
import {
  GUARD_FACT,
  PARTICIPANT,
  PROTOCOL,
  guardFactSchema,
  rejectionSchema,
  responseSchema,
} from './schema.ts'
import type { ScheduleManagementGuardBinding } from './guards.ts'
export type RecoveryTarget = Pick<OperationIdentity, 'scope' | 'address'> & {
  fingerprint: OperationIdentity['fingerprint'] | null
}
export type ReceiptOptions = Readonly<{
  scope: StorageScope
  combinationVersion: string
  manifestDigest: string
  guardParticipant: string
}>
export function unknownView(
  operationRef: ScheduleOperationView['operationRef'],
): Extract<ScheduleOperationView, { kind: 'pending' | 'unknown' }> {
  return {
    kind: 'unknown',
    operationRef,
    observedAt: ScheduleInstantSchema.parse(
      /* wall-clock: observation-time -- Marks this recovery observation; commit time comes from the guard. */ new Date().toISOString(),
    ),
    result: null,
    error: null,
    notCommittedProofs: null,
  }
}
function validBinding(
  binding: ScheduleManagementGuardBinding,
  options: ReceiptOptions,
  target: RecoveryTarget,
) {
  return (
    equal(binding.scope, options.scope) &&
    equal(binding.operation.scope, target.scope) &&
    equal(binding.operation.address, target.address) &&
    binding.commandDigest === commandDigest(binding.command) &&
    equal(binding.operation, binding.command.input.operation) &&
    commandMatches(options.scope, binding.command)
  )
}
function mismatch(
  binding: ScheduleManagementGuardBinding,
  target: RecoveryTarget,
): ScheduleOperationView | null {
  if (target.fingerprint === null || binding.operation.fingerprint === target.fingerprint)
    return null
  return {
    kind: 'rejected',
    operationRef: createScheduleManagementOperationRef(target.scope, target.address),
    observedAt: binding.command.input.now,
    result: null,
    notCommittedProofs: null,
    error: domainError(
      'operation_key_conflict',
      binding.command.input.requestId,
      'Operation address already binds a different business intent',
    ),
  }
}
function receiptView(
  receipt: ReceiptV2,
  options: ReceiptOptions,
  target: RecoveryTarget,
): ScheduleOperationView {
  const unknown = unknownView(createScheduleManagementOperationRef(target.scope, target.address))
  if (
    !equal(receipt.identity, sqlIdentity(options.scope, target)) ||
    receipt.combinationVersion !== options.combinationVersion ||
    receipt.manifestDigest !== options.manifestDigest ||
    !/^[a-f0-9]{64}$/.test(receipt.inputDigest)
  )
    return unknown
  const guard = receipt.responses[0]
  const own = receipt.responses[1]
  if (guard?.participant !== options.guardParticipant || guard.protocol !== GUARD_FACT.protocol)
    return unknown
  if (receipt.kind === 'rolled_back') {
    const stopping = receipt.responses.at(-1)
    if (
      stopping?.reply.kind !== 'conflict' ||
      !(
        (receipt.responses.length === 1 && stopping === guard) ||
        (receipt.responses.length === 2 &&
          own?.participant === PARTICIPANT &&
          own.protocol === PROTOCOL)
      )
    )
      return unknown
    const parsed = rejectionSchema.safeParse(stopping.reply.basis)
    if (
      !parsed.success ||
      !validBinding(parsed.data.binding, options, target) ||
      parsed.data.error.requestId !== parsed.data.binding.command.input.requestId
    )
      return unknown
    if (receipt.responses.length === 2 && !validGuard(guard.reply, parsed.data.binding))
      return unknown
    return (
      mismatch(parsed.data.binding, target) ?? {
        kind: 'rejected',
        operationRef: parsed.data.binding.operation.operationRef,
        observedAt: parsed.data.binding.command.input.now,
        result: null,
        error: parsed.data.error,
        notCommittedProofs: null,
      }
    )
  }
  if (
    receipt.responses.length !== 2 ||
    own?.participant !== PARTICIPANT ||
    own.protocol !== PROTOCOL ||
    own.reply.kind !== 'participated'
  )
    return unknown
  const parsed = responseSchema.safeParse(own.reply.response)
  if (
    !parsed.success ||
    !validBinding(parsed.data.binding, options, target) ||
    !validGuard(guard.reply, parsed.data.binding)
  )
    return unknown
  const { view, binding } = parsed.data
  const fact = guardFactSchema.parse(
    guard.reply.kind === 'participated' ? guard.reply.response : null,
  )
  if (
    (view.kind !== 'committed' && view.kind !== 'noChange') ||
    view.operationRef !== binding.operation.operationRef ||
    !equal(view.result.owner, target.scope.owner) ||
    view.observedAt !== fact.decisionAt
  )
    return unknown
  return mismatch(binding, target) ?? view
}
function validGuard(
  reply: ReceiptV2['responses'][number]['reply'],
  binding: ScheduleManagementGuardBinding,
) {
  if (reply.kind !== 'participated') return false
  const fact = guardFactSchema.safeParse(reply.response)
  if (!fact.success) return false
  const requirement = scheduleManagementGuardRequirement(binding.scope, binding.command)
  return (
    equal(fact.data.binding, binding) &&
    equal(fact.data.quotaEffect, requirement.quotaEffect) &&
    equal(fact.data.resultingHolding, requirement.resultingHolding)
  )
}
export function queryView(
  result: QueryResultV2,
  options: ReceiptOptions,
  target: RecoveryTarget,
): ScheduleOperationView {
  const unknown = unknownView(createScheduleManagementOperationRef(target.scope, target.address))
  try {
    if (!equal(result.identity, sqlIdentity(options.scope, target))) return unknown
    if (result.kind === 'committed' || result.kind === 'rolled_back')
      return receiptView(result, options, target)
    if (result.kind !== 'not_committed') return unknown
    const proofs = ScheduleNotCommittedProofsSchema.safeParse(result.proofs)
    return proofs.success
      ? { ...unknown, kind: 'notCommitted', notCommittedProofs: proofs.data }
      : unknown
  } catch {
    return unknown
  }
}
