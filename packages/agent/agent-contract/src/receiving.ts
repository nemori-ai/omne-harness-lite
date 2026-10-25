// Producer receiving surface of the Agent contract (SPEC "生产者接收面"): the three receiving entries
// of the Journal, the port that records them, and the account outlet toward Request Context. Types
// only; no function runs here. The receipt types of Model and Tool and `StreamRef` keep their one
// definition in their owners; this file only refers to them.
import type { CallAccount } from '@omne-harness/call-account'
import type * as M from '@omne-harness/model-contract'
import type { StreamProducer, StreamRef } from '@omne-harness/stream-arrival'
import type * as T from '@omne-harness/tool-contract'
import type { Reply } from './evaluation.ts'
import type { CommandReceipt, ExecutionMutation } from './execution.ts'
import type { Access, Authority, ConsumerRef, ConsumptionId, DurableEvidence } from './identity.ts'

/**
 * The Tool start fence took effect in the Tool ordering domain (J03). `guard` is the resource that
 * Agent owns, and `fence` is the evidence that `invalidate` returned for `operation`.
 */
export type StartFenceEntry = Readonly<{
  kind: 'start-fence'
  operation: T.ToolOperationId
  guard: Readonly<{ owner: string; resource: string; revision: string; evidence: DurableEvidence }>
  fence: DurableEvidence
}>

/**
 * The delivery that the result receiver saved, with the producer's own delivery key as the key
 * that recognizes it again (J02). The branch follows the kind of the key. A Model result carries
 * the account snapshot of every dispatch at freeze time. A Tool result carries its account or
 * null. An account delivery of either producer carries the `CallAccount` of its revision. A
 * missing report stays null and is never zero.
 */
export type ReceivedDelivery =
  | Readonly<{
      producer: 'model'
      key: Extract<M.ModelDeliveryKey, { kind: 'result' }>
      accounts: readonly M.ModelAccountSnapshot[]
    }>
  | Readonly<{
      producer: 'model'
      key: Extract<M.ModelDeliveryKey, { kind: 'account' }>
      account: CallAccount
    }>
  | Readonly<{
      producer: 'tool'
      key: Extract<T.ToolDeliveryKey, { kind: 'result' }>
      account: CallAccount | null
    }>
  | Readonly<{
      producer: 'tool'
      key: Extract<T.ToolDeliveryKey, { kind: 'account' }>
      account: CallAccount
    }>

/**
 * A pushed result version or account revision that the result receiver saved (J02). `consumer`
 * is the frozen destination, `consumption` the original consumption it maps to, and `material`
 * the preserved payload or its recoverable reference.
 */
export type ReceivedEntry = Readonly<{
  kind: 'received'
  delivery: ReceivedDelivery
  consumer: ConsumerRef
  consumption: ConsumptionId
  material: DurableEvidence
}>

/** A producer stream reference that Agent obtained (J04). Holding it grants no observation. */
export type StreamReferenceEntry = Readonly<{
  kind: 'stream-reference'
  producer: StreamProducer
  reference: StreamRef
  consumption: ConsumptionId
}>

/**
 * The receiving entries of the Journal (J01). The union is open: a reader keeps an entry of an
 * unknown kind and does not interpret it, so a later kind is an additive change.
 */
export type AgentJournalEntry = StartFenceEntry | ReceivedEntry | StreamReferenceEntry

/**
 * The input of one record. An entry of the advancing side carries the current Authority; the
 * result receiver writes `received` without an attachment.
 */
export type JournalEntryRecord<P> = ExecutionMutation<P> &
  (
    | Readonly<{ authority: Authority; entry: StartFenceEntry | StreamReferenceEntry }>
    | Readonly<{ authority: null; entry: ReceivedEntry }>
  )

/**
 * The port that records receiving entries. The provider of `AgentJournal` serves it in the same
 * authoritative ordering; see SPEC "日志条目".
 */
export interface AgentJournalEntries<P> {
  record(input: JournalEntryRecord<P>): Reply<CommandReceipt>
}

/**
 * The handoff that tells Request Context that the account of one fixed request arrived (J28).
 * `call` carries the tenant. `resultVersion` is null unless the original account has that
 * relation. `committed` is the evidence of the committed `received` entry.
 */
export type AgentAccountHandoff = Readonly<{
  call: M.ModelInvocationRef
  dispatch: M.DispatchId
  account: CallAccount
  resultVersion: M.ResultVersion | null
  committed: DurableEvidence
}>

/**
 * The answer of the account outlet. `received` also covers a repeated handoff and a lower revision
 * that a higher one replaced. `unknown` and `unavailable` keep the duty, and the receiver retries
 * the same handoff. `received` is no basis to clean a Journal entry.
 */
export type AgentAccountOutcome =
  | Readonly<{ kind: 'received' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * The outbound port of Agent that hands a received Model account to the adapter of Request
 * Context (J28). Agent owns the port; the adapter checks that `access.tenant` is the tenant of
 * `handoff.call`.
 */
export interface AgentAccountOutlet<P> {
  deliver(
    input: Readonly<{ access: Access<P>; handoff: AgentAccountHandoff }>,
  ): Promise<AgentAccountOutcome>
}
