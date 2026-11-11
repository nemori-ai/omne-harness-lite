import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type { PendingCall, Reply } from './evaluation.ts'
import type { CommandReceipt, ExecutionMutation } from './execution.ts'
import type {
  Access,
  Adoption,
  AgentExecutionId,
  AgentInstanceId,
  Authority,
  ConsumerRef,
  ConsumptionId,
  DurableEvidence,
} from './identity.ts'
import type { AgentJournal } from './journal.ts'
import type { AgentMaterials, Material } from './passages.ts'

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

/**
 * The receiving entries of the Journal (J01). The union is open: a reader keeps an entry of an
 * unknown kind and does not interpret it, so a later kind is an additive change.
 */
export type AgentJournalEntry = StartFenceEntry | ReceivedEntry

/**
 * The input of one record. An entry of the advancing side carries the current Authority; the
 * result receiver writes `received` without an attachment.
 */
export type JournalEntryRecord<P> = ExecutionMutation<P> &
  (
    | Readonly<{ authority: Authority; entry: StartFenceEntry }>
    | Readonly<{ authority: null; entry: ReceivedEntry }>
  )

/** One committed receiving entry and its dense position `sequence` in commit order, from `1`. */
export type JournalEntryItem = Readonly<{ sequence: string; entry: AgentJournalEntry }>

/**
 * One page of `AgentJournalEntries.read`. `next` is the sequence of the last item, or the `after` of
 * the request when the page is empty; it is the `after` of the next page. `caughtUp` says that no
 * entry was committed after this page when it was read.
 */
export type JournalEntryPage = Readonly<{
  items: readonly JournalEntryItem[]
  next: string | null
  caughtUp: boolean
}>

/**
 * The port that records and reads receiving entries. The provider of `AgentJournal` serves it in the
 * same authoritative ordering; see SPEC "日志条目". `read` gives the committed entries after `after`
 * in commit order, at most `limit` of them. `receivedOf` gives every `received` entry of one
 * consumption in commit order: result versions and account revisions alike. Both check the current
 * read qualification of the execution; an execution of another tenant answers as one that does not
 * exist, `denied`.
 */
export interface AgentJournalEntries<P> {
  record(input: JournalEntryRecord<P>): Reply<CommandReceipt>
  read(
    input: Access<P> &
      Readonly<{ execution: AgentExecutionId; after: string | null; limit: number }>,
  ): Reply<JournalEntryPage>
  receivedOf(
    input: Access<P> & Readonly<{ execution: AgentExecutionId; consumption: ConsumptionId }>,
  ): Reply<readonly ReceivedEntry[]>
}

/** One received delivery and its complete material, before the provider creates evidence. */
export type ReceivedCommitInput<P, B extends ContentBlock> = ExecutionMutation<P> &
  Readonly<{ entry: Omit<ReceivedEntry, 'material'>; material: Material<B> }>

/** The original command, material reference and producer saved evidence have distinct roles. */
export type ReceivedCommitValue = Readonly<{
  receipt: CommandReceipt
  entry: ReceivedEntry
  saved: DurableEvidence
}>

export type ReceivedCommitResult =
  | Readonly<{ kind: 'committed'; value: ReceivedCommitValue }>
  | Readonly<{ kind: 'excluded'; evidence: DurableEvidence }>

export type ReceivedCommitQuery = ReceivedCommitResult | Readonly<{ kind: 'unknown' }>

/** Joint custody in one authoritative sequence; see SPEC "接收共同提交". */
export interface AgentReceivedCommits<P, B extends ContentBlock> {
  commit(input: ReceivedCommitInput<P, B>): Reply<ReceivedCommitResult>
  query(input: ExecutionMutation<P>): Reply<ReceivedCommitQuery>
}

/**
 * The read face of the same received records, for the evidence adapter of the Agent consumer owner
 * (J08 item 6): it confirms a producer's ACK from the durable record the receiver committed. It
 * answers what `AgentReceivedCommits.query` answers for the same input and writes nothing. It is a
 * trusted face: the assembly gives it only to the holder of that evidence adapter.
 */
export interface AgentReceivedRecords<P> {
  query(input: ExecutionMutation<P>): Reply<ReceivedCommitQuery>
}

/**
 * The original consumption binding of one Model call (J02 item 1): the execution and the instance
 * that committed the PendingCall, and that PendingCall. The provider keeps it after the checkpoint
 * dropped the call, the attachment ended or the instance went away.
 */
export type ModelReceptionTarget = Readonly<{
  execution: AgentExecutionId
  instance: AgentInstanceId
  pending: Extract<PendingCall, { kind: 'model' }>
}>

/**
 * The stable target query of the result receiver (J02 item 1), served by the provider that keeps
 * the original consumption bindings. It answers from the bindings that committed PendingCalls
 * established, never from the current attachment or from consumer text. `forExecution` gives every
 * original Model binding of the execution. `resolve` gives the binding of one call reference and
 * frozen consumer. Absent, of another tenant or not allowed: `denied`. A source that cannot be
 * read: `unavailable`.
 *
 * `execution` is a route, not an identity: the receiver reads it from the consumer position that
 * its own owner registered, and a provider that keeps its bindings per execution reads only the
 * records of that execution. A binding of another execution answers as an absent one, and a
 * provider that needs the route answers `denied` without it. The target always comes from the
 * committed binding.
 */
export interface ModelReceptionTargets<P> {
  forExecution(
    input: Readonly<{ access: Access<P>; execution: AgentExecutionId }>,
  ): Reply<readonly ModelReceptionTarget[]>
  resolve(
    input: Readonly<{
      access: Access<P>
      consumer: ConsumerRef
      reference: M.ModelInvocationRef
      execution?: AgentExecutionId
    }>,
  ): Reply<ModelReceptionTarget>
}

/**
 * The original consumption binding of one associated Tool call (J02 item 1): the execution and the
 * instance and Agent definition that committed the PendingCall, and that PendingCall. The provider keeps it after the
 * checkpoint dropped the call, the attachment ended or the instance went away.
 */
export type ToolReceptionTarget = Readonly<{
  execution: AgentExecutionId
  instance: AgentInstanceId
  definition: Adoption
  pending: Extract<PendingCall, { kind: 'tool'; association: 'associated' }>
}>

/**
 * The stable target query of the Tool result receiver (J02 item 1), served by the provider that
 * keeps the original consumption bindings. It answers from the bindings that committed associated
 * Tool PendingCalls established, never from the current attachment or from consumer text. The
 * provider checks current access before it reveals a binding or its absence. `resolve` gives the
 * binding of one call reference and frozen consumer, or null when no original consumption exists
 * (the Tool protocol answers `not-accepted` for it). `forExecution` gives every original Tool
 * binding of the execution. Not allowed or of another tenant: `denied`. A source that cannot be
 * read: `unavailable`.
 *
 * `execution` is a route, as for `ModelReceptionTargets`: the receiver reads it from the consumer
 * position that its own owner registered. A binding of another execution answers `denied`, and a
 * provider that needs the route answers `denied` without it.
 */
export interface ToolReceptionTargets<P> {
  resolve(
    input: Readonly<{
      access: Access<P>
      consumer: ConsumerRef
      reference: T.ToolInvocationRef
      execution?: AgentExecutionId
    }>,
  ): Reply<ToolReceptionTarget | null>
  forExecution(
    input: Readonly<{ access: Access<P>; execution: AgentExecutionId }>,
  ): Reply<readonly ToolReceptionTarget[]>
}

/** Views of one provider. A fixed non-null received port declares joint custody support. */
export type AgentReceivedProvider<P, B extends ContentBlock> = Readonly<{
  journal: AgentJournal<P>
  entries: AgentJournalEntries<P>
  materials: AgentMaterials<P, B>
  received: AgentReceivedCommits<P, B> | null
}>

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
