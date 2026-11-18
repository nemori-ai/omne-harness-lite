import type {
  CommitResultV2,
  DomainRef,
  QueryResultV2,
  ReceiptV2,
} from '@omne-harness/sql-contract'
import type { AssetsOperationResult } from './types.ts'
import { equal, identity } from './encoding.ts'
import { PARTICIPANT, PROTOCOL, receiptSchema, type Mutation } from './schema.ts'
export type SameOperation = (recorded: Mutation) => boolean
export function receiptResult(
  result: CommitResultV2 | QueryResultV2,
  domain: DomainRef,
  operationId: string,
  same?: SameOperation,
): AssetsOperationResult {
  const unknown = { kind: 'unknown' as const, operationId }
  if (!equal(result.identity, identity(domain, operationId))) return unknown
  switch (result.kind) {
    case 'unknown':
    case 'not_recallable':
      return unknown
    case 'not_committed':
      return { kind: 'not_found' }
    case 'identity_conflict':
      return receiptResult(result.existing, domain, operationId, same)
    case 'rejected_before_accept':
      return {
        kind: 'rejected',
        reason:
          result.reason === 'closing'
            ? 'closing'
            : result.reason === 'combination_unregistered'
              ? 'unsupported'
              : 'unavailable',
      }
    case 'committed':
    case 'rolled_back':
      return terminalReceipt(result, domain, operationId, same)
  }
}
function terminalReceipt(
  result: ReceiptV2,
  domain: DomainRef,
  operationId: string,
  same?: SameOperation,
): AssetsOperationResult {
  const unknown = { kind: 'unknown' as const, operationId }
  const receipt = decodeReceipt(result, domain, operationId)
  if (!receipt) return unknown
  if (same && !same(receipt.binding.command))
    return { kind: 'rejected', reason: 'operation_conflict' }
  if (receipt.result.kind === 'committed' && receipt.result.operationId !== operationId)
    return unknown
  if (result.kind === 'committed' && receipt.result.kind !== 'committed') return unknown
  if (result.kind === 'rolled_back' && receipt.result.kind !== 'rejected') return unknown
  return receipt.result
}
function decodeReceipt(result: ReceiptV2, domain: DomainRef, operationId: string) {
  const entry = result.responses.find(
    response => response.participant === PARTICIPANT && response.protocol === PROTOCOL,
  )
  const reply = entry?.reply
  const raw =
    reply?.kind === 'participated'
      ? reply.response
      : reply?.kind === 'conflict'
        ? reply.basis
        : undefined
  const parsed = receiptSchema.safeParse(raw)
  if (
    !parsed.success ||
    !equal(parsed.data.binding.domain, domain) ||
    parsed.data.binding.command.operationId !== operationId
  )
    return null
  return parsed.data
}
