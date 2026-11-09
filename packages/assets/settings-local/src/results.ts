import type {
  SettingsCommitResult,
  SettingsFailure,
  SettingsOperationResult,
  SettingsTarget,
} from '@omne-harness/settings'
import type { CommitResultV2, QueryResultV2, DomainRef } from '@omne-harness/sql-contract'
import { TERMINAL_PARTICIPANT } from './terminal-schema.ts'
import { equal, identity } from './encoding.ts'
import {
  operationRecordSchema,
  PARTICIPANT,
  PROTOCOL,
  rejectionSchema,
  type OperationBinding,
} from './schema.ts'

export function rejected(reason: SettingsFailure['reason']): SettingsFailure {
  return { kind: 'rejected', reason }
}
export type OperationLookup = Readonly<{
  domain: DomainRef
  principalRef: string
  target: SettingsTarget
  operationId: string
  commandDigest?: string
}>
function matches(binding: OperationBinding, lookup: OperationLookup): boolean {
  return (
    equal(binding.domain, lookup.domain) &&
    binding.principalRef === lookup.principalRef &&
    equal(binding.target, lookup.target) &&
    binding.operationId === lookup.operationId
  )
}
export function receiptResult(
  result: CommitResultV2 | QueryResultV2,
  lookup: OperationLookup,
  guardParticipant: string,
): SettingsOperationResult {
  const unknown: SettingsCommitResult = { kind: 'unknown', operationId: lookup.operationId }
  if (
    !equal(
      result.identity,
      identity(lookup.domain, lookup.principalRef, lookup.target, lookup.operationId),
    )
  )
    return unknown
  switch (result.kind) {
    case 'unknown':
    case 'not_recallable':
      return unknown
    case 'not_committed':
      return { kind: 'not_found' }
    case 'rejected_before_accept':
      return rejected(
        result.reason === 'closing'
          ? 'closing'
          : result.reason === 'participant_dependency_missing' ||
              result.reason === 'combination_unregistered'
            ? 'unsupported'
            : 'unavailable',
      )
    case 'identity_conflict':
      return receiptResult(result.existing, lookup, guardParticipant)
    case 'committed':
      return committedReceipt(result, lookup)
    case 'rolled_back':
      return rolledBackReceipt(result, lookup, guardParticipant)
  }
}
function committedReceipt(
  result: Extract<CommitResultV2, { kind: 'committed' }>,
  lookup: OperationLookup,
): SettingsOperationResult {
  const unknown = { kind: 'unknown' as const, operationId: lookup.operationId }
  const entry = result.responses.find(
    response => response.participant === PARTICIPANT && response.protocol === PROTOCOL,
  )
  const parsed = operationRecordSchema.safeParse(entry?.reply.response)
  if (!parsed.success || !matches(parsed.data.binding, lookup)) return unknown
  if (
    lookup.commandDigest !== undefined &&
    parsed.data.binding.commandDigest !== lookup.commandDigest
  )
    return rejected('operation_conflict')
  if (parsed.data.result.operationId !== lookup.operationId) return unknown
  return parsed.data.result
}
function rolledBackReceipt(
  result: Extract<CommitResultV2, { kind: 'rolled_back' }>,
  lookup: OperationLookup,
  guardParticipant: string,
): SettingsOperationResult {
  const unknown = { kind: 'unknown' as const, operationId: lookup.operationId }
  const last = result.responses.at(-1)
  if (!last || ![PARTICIPANT, guardParticipant, TERMINAL_PARTICIPANT].includes(last.participant))
    return rejected('unavailable')
  const reply = last.reply
  if (reply.kind === 'failed' && reply.category === 'fact_violation') return rejected('unsupported')
  if (reply.kind !== 'conflict' && reply.kind !== 'unsupported') return rejected('unavailable')
  const parsed = rejectionSchema.safeParse(reply.basis)
  if (!parsed.success || !matches(parsed.data.binding, lookup)) return unknown
  if (
    lookup.commandDigest !== undefined &&
    parsed.data.binding.commandDigest !== lookup.commandDigest
  )
    return rejected('operation_conflict')
  return parsed.data.failure
}
