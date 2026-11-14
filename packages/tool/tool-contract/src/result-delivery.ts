import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Access,
  ConsumerRef,
  DurableEvidence,
  ToolCallId,
  ToolDeliveryId,
  ToolResultVersion,
} from './identity.ts'
import { resolveToolInvocationRef, type ToolInvocationRef } from './reference.ts'
import type { Effect, ToolResult, ToolTerminal } from './results.ts'

export type ToolDeliveryKey =
  | Readonly<{
      kind: 'result'
      producer: 'tool'
      reference: ToolInvocationRef
      result: ToolResultVersion
    }>
  | Readonly<{
      kind: 'account'
      producer: 'tool'
      reference: ToolInvocationRef
      event: string
      revision: CallAccount['revision']
    }>

export type ToolDelivery<B extends ContentBlock> =
  | Readonly<{
      kind: 'result'
      key: Extract<ToolDeliveryKey, { kind: 'result' }>
      consumer: ConsumerRef
      delivery: ToolDeliveryId
      relation: 'original' | 'late'
      terminal: ToolTerminal
      actualTerminal: ToolTerminal | null
      effect: Effect
      source: DurableEvidence
      value: ToolResult<B>
      account: CallAccount | null
    }>
  | Readonly<{
      kind: 'account'
      key: Extract<ToolDeliveryKey, { kind: 'account' }>
      consumer: ConsumerRef
      account: CallAccount
    }>

export type ToolSavedReceipt = Readonly<{ key: ToolDeliveryKey; evidence: DurableEvidence }>

export type ToolDeliveryFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'backpressured'; resource: 'records' | 'bytes' | 'attachments' | 'in-flight' }>
  | Readonly<{ kind: 'unavailable'; dependency: string }>
  | Readonly<{ kind: 'cancelled-before-accept' }>
  | Readonly<{ kind: 'outcome-unknown' }>

export interface ToolResultReceiver<P, B extends ContentBlock> {
  push(
    input: Readonly<{
      access: Access<P>
      delivery: ToolDelivery<B>
      signal: AbortSignal
    }>,
  ): Promise<Outcome<ToolSavedReceipt, ToolDeliveryFailure>>
}

export type ToolDeliveryRejection =
  | Readonly<{ field: 'tenant'; reason: 'identity' }>
  | Readonly<{ field: 'key.reference'; reason: 'reference-malformed' }>
  | Readonly<{ field: 'key.revision'; reason: 'revision-mismatch' }>
  | Readonly<{ field: 'account.subject'; reason: 'call-mismatch' }>

export function judgeToolDelivery<B extends ContentBlock>(
  input: Readonly<{ tenant: TenantId; delivery: ToolDelivery<B> }>,
): Outcome<ToolDelivery<B>, ToolDeliveryRejection> {
  const { delivery } = input
  if (!tenantCodec.encode(input.tenant).ok) return fail({ field: 'tenant', reason: 'identity' })
  const reference = resolveToolInvocationRef(delivery.key.reference, input.tenant)
  if ('failure' in reference)
    return reference.failure.kind === 'malformed'
      ? fail({ field: 'key.reference', reason: 'reference-malformed' })
      : fail({ field: 'tenant', reason: 'identity' })
  if (delivery.kind === 'account' && delivery.key.revision !== delivery.account.revision)
    return fail({ field: 'key.revision', reason: 'revision-mismatch' })
  const account = delivery.account
  if (account !== null && !accountOfCall(account, reference.ok.call))
    return fail({ field: 'account.subject', reason: 'call-mismatch' })
  return succeed(delivery)
}

function accountOfCall(account: CallAccount, call: ToolCallId): boolean {
  return account.subject.kind === 'tool_execution' && account.subject.id === call
}
