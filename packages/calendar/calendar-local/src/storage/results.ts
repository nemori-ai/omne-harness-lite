import { z } from 'zod'
import type {
  CalendarCommitResult,
  CalendarDispositionCommand,
  CalendarAcknowledgementResult,
  CalendarReactionAcknowledgement,
  CalendarOperationQuery,
  CalendarPersistenceFailure,
  CalendarOperationObservation,
} from '@omne-harness/calendar'
import type { ReceiptV2, QueryResultV2, CommitResultV2 } from '@omne-harness/sql-contract'
import { canonical, digest, operationRef } from './encoding.ts'
import { PARTICIPANT, receiptSchema, ackSchema } from './schema.ts'

const responseSchema = z.strictObject({
  action: z.literal('disposition'),
  commandDigest: z.string(),
  receipt: receiptSchema,
})
export const reasonSchema = z.enum([
  'invalid',
  'operationKeyConflict',
  'generationConflict',
  'versionConflict',
  'contentHashConflict',
  'staleSeed',
  'authorityRejected',
  'providerUnavailable',
])
export function rejected(
  reason: CalendarPersistenceFailure['reason'],
  message: string = reason,
): CalendarPersistenceFailure {
  return { kind: 'rejected', reason, message }
}
const rejectedBindingSchema = z.object({
  reason: reasonSchema,
  operationRef: z.string(),
  fingerprint: z.string(),
  commandDigest: z.string(),
})
function matches(
  binding: { operationRef: string; fingerprint: string; commandDigest: string },
  query: CalendarOperationQuery,
  expectedCommandDigest: string | null,
) {
  return (
    binding.operationRef === operationRef(query.address) &&
    binding.fingerprint === query.expectedFingerprint &&
    (expectedCommandDigest === null || binding.commandDigest === expectedCommandDigest)
  )
}
function rollbackResult(
  receipt: ReceiptV2,
  query: CalendarOperationQuery,
  expectedCommandDigest: string | null,
  replayed: boolean,
): CalendarCommitResult {
  const own = receipt.responses.find(entry => entry.participant === PARTICIPANT)
  if (own?.reply.kind === 'conflict') {
    const basis = rejectedBindingSchema.safeParse(own.reply.basis)
    if (basis.success)
      return matches(basis.data, query, expectedCommandDigest)
        ? rejected(basis.data.reason)
        : rejected('operationKeyConflict')
  }
  if (own?.reply.kind === 'participated') {
    const response = responseSchema.safeParse(own.reply.response)
    if (response.success)
      return matches(
        { ...response.data.receipt, commandDigest: response.data.commandDigest },
        query,
        expectedCommandDigest,
      )
        ? rejected('providerUnavailable')
        : rejected('operationKeyConflict')
  }
  // An early stop without the Calendar binding cannot identify a queried fingerprint.
  return replayed
    ? { kind: 'unknown', operationRef: operationRef(query.address) }
    : rejected('providerUnavailable')
}
export function receiptResult(
  receipt: ReceiptV2,
  query: CalendarOperationQuery,
  expectedCommandDigest: string | null,
  replayed: boolean,
): CalendarCommitResult {
  if (receipt.kind === 'rolled_back')
    return rollbackResult(receipt, query, expectedCommandDigest, replayed)
  const own = receipt.responses.find(entry => entry.participant === PARTICIPANT)
  if (own?.reply.kind !== 'participated')
    return { kind: 'unknown', operationRef: operationRef(query.address) }
  const response = responseSchema.safeParse(own.reply.response)
  if (!response.success) return { kind: 'unknown', operationRef: operationRef(query.address) }
  if (
    !matches(
      { ...response.data.receipt, commandDigest: response.data.commandDigest },
      query,
      expectedCommandDigest,
    )
  )
    return rejected('operationKeyConflict')
  return { kind: 'recorded', receipt: response.data.receipt, replayed }
}
export function observation(
  result: QueryResultV2,
  query: CalendarOperationQuery,
): CalendarOperationObservation {
  switch (result.kind) {
    case 'not_committed':
      return { kind: 'notCommitted', operationRef: operationRef(query.address) }
    case 'unknown':
      return { kind: 'unknown', operationRef: operationRef(query.address) }
    case 'committed':
    case 'rolled_back':
      return receiptResult(result, query, null, true)
  }
}

export function commitResult(
  result: CommitResultV2,
  command: CalendarDispositionCommand,
): CalendarCommitResult {
  switch (result.kind) {
    case 'committed':
    case 'rolled_back':
      return receiptResult(result, command, digest(command), false)
    case 'identity_conflict':
      return receiptResult(result.existing, command, digest(command), true)
    case 'unknown':
      return { kind: 'unknown', operationRef: operationRef(command.address) }
    case 'rejected_before_accept':
      return rejected('providerUnavailable', result.reason)
  }
}
export function acknowledgementResult(
  result: CommitResultV2,
  acknowledgement: CalendarReactionAcknowledgement,
): CalendarAcknowledgementResult {
  const receipt = result.kind === 'identity_conflict' ? result.existing : result
  if (receipt.kind === 'committed') {
    const own = receipt.responses.find(entry => entry.participant === PARTICIPANT)
    const response = z
      .strictObject({ action: z.literal('ackReaction'), acknowledgement: ackSchema })
      .safeParse(own?.reply.response)
    if (response.success && canonical(response.data.acknowledgement) === canonical(acknowledgement))
      return { kind: 'acknowledged' }
    return { kind: 'rejected', reason: 'invalid' }
  }
  if (receipt.kind === 'unknown') return { kind: 'unknown' }
  if (receipt.kind === 'rolled_back') return acknowledgementRollback(receipt, acknowledgement)
  return { kind: 'rejected', reason: 'providerUnavailable' }
}
function acknowledgementRollback(
  receipt: ReceiptV2,
  acknowledgement: CalendarReactionAcknowledgement,
): CalendarAcknowledgementResult {
  const stop = receipt.responses.at(-1)
  if (stop?.participant !== PARTICIPANT || stop.reply.kind !== 'conflict')
    return { kind: 'unknown' }
  const basis = z
    .strictObject({
      reason: z.enum(['notFound', 'invalid', 'authorityRejected']),
      acknowledgementDigest: z.string(),
    })
    .safeParse(stop.reply.basis)
  if (!basis.success) return { kind: 'unknown' }
  if (basis.data.acknowledgementDigest !== digest(acknowledgement))
    return { kind: 'rejected', reason: 'invalid' }
  return { kind: 'rejected', reason: basis.data.reason }
}
