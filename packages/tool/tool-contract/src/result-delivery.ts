// The result push and its saved receipt (SPEC「结果推送与保存」, J02). Tool pushes one result
// version, or one later account revision, to the consumer position frozen at admission. The
// receiver is the consumer owner: this module names only the port it implements, never who it is.
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

/**
 * The recall key of a push. A result is keyed by (tenant, producer kind, call, result version): the
 * invocation reference carries the tenant and the call, and `producer` is the producer kind. An
 * account is keyed by (call, account event, revision), with the tenant again from the reference.
 */
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

/**
 * The frozen payload of one push. A result carries the full result of its version and the call
 * account that the runtime completed when it froze the payload, or null when no account was
 * reported yet. A later account revision is a push of its own and never changes a frozen result.
 */
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

/**
 * The saved receipt: the key of the push and the evidence of the receiver, whose owner is the frozen
 * `consumer.owner`. It tells the conjoint custody facts of the SPEC and grants no cleanup.
 */
export type ToolSavedReceipt = Readonly<{ key: ToolDeliveryKey; evidence: DurableEvidence }>

/**
 * Why a push did not return saved. `backpressured` names the resource this attempt could not
 * reserve; `unavailable` names the dependency, and `responsibility` when the material is saved but
 * the responsibility is definitely not committed. `outcome-unknown` keeps an unknown write unknown.
 */
export type ToolDeliveryFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'backpressured'; resource: 'records' | 'bytes' | 'attachments' | 'in-flight' }>
  | Readonly<{ kind: 'unavailable'; dependency: string }>
  | Readonly<{ kind: 'cancelled-before-accept' }>
  | Readonly<{ kind: 'outcome-unknown' }>

/** The receiving port that a consumer owner implements. `signal` stops this wait only. */
export interface ToolResultReceiver<P, B extends ContentBlock> {
  push(
    input: Readonly<{
      access: Access<P>
      delivery: ToolDelivery<B>
      signal: AbortSignal
    }>,
  ): Promise<Outcome<ToolSavedReceipt, ToolDeliveryFailure>>
}

/** The first relation failure of `judgeToolDelivery`, in the order of the SPEC table. */
export type ToolDeliveryRejection =
  | Readonly<{ field: 'tenant'; reason: 'identity' }>
  | Readonly<{ field: 'key.reference'; reason: 'reference-malformed' | 'foreign-tenant' }>
  | Readonly<{ field: 'key.revision'; reason: 'revision-mismatch' }>
  | Readonly<{ field: 'account.subject'; reason: 'call-mismatch' }>

/**
 * The pure relation check of a typed delivery against a real tenant. It returns the input itself
 * on success. It reads no store, checks no current qualification or original consumer, and mints
 * no evidence.
 */
export function judgeToolDelivery<B extends ContentBlock>(
  input: Readonly<{ tenant: TenantId; delivery: ToolDelivery<B> }>,
): Outcome<ToolDelivery<B>, ToolDeliveryRejection> {
  const { delivery } = input
  if (!tenantCodec.encode(input.tenant).ok) return fail({ field: 'tenant', reason: 'identity' })
  const reference = resolveToolInvocationRef(delivery.key.reference, input.tenant)
  if ('failure' in reference)
    return fail({
      field: 'key.reference',
      reason: reference.failure.kind === 'malformed' ? 'reference-malformed' : 'foreign-tenant',
    })
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
