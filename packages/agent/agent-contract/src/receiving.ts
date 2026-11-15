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

export type StartFenceEntry = Readonly<{
  kind: 'start-fence'
  operation: T.ToolOperationId
  guard: Readonly<{ owner: string; resource: string; revision: string; evidence: DurableEvidence }>
  fence: DurableEvidence
}>

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

export type ReceivedEntry = Readonly<{
  kind: 'received'
  delivery: ReceivedDelivery
  consumer: ConsumerRef
  consumption: ConsumptionId
  material: DurableEvidence
}>

export type AgentJournalEntry = StartFenceEntry | ReceivedEntry

export type JournalEntryRecord<P> = ExecutionMutation<P> &
  (
    | Readonly<{ authority: Authority; entry: StartFenceEntry }>
    | Readonly<{ authority: null; entry: ReceivedEntry }>
  )

export type JournalEntryItem = Readonly<{ sequence: string; entry: AgentJournalEntry }>

export type JournalEntryPage = Readonly<{
  items: readonly JournalEntryItem[]
  next: string | null
  caughtUp: boolean
}>

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

export type ReceivedCommitInput<P, B extends ContentBlock> = ExecutionMutation<P> &
  Readonly<{ entry: Omit<ReceivedEntry, 'material'>; material: Material<B> }>

export type ReceivedCommitValue = Readonly<{
  receipt: CommandReceipt
  entry: ReceivedEntry
  saved: DurableEvidence
}>

export type ReceivedCommitResult =
  | Readonly<{ kind: 'committed'; value: ReceivedCommitValue }>
  | Readonly<{ kind: 'excluded'; evidence: DurableEvidence }>

export type ReceivedCommitQuery = ReceivedCommitResult | Readonly<{ kind: 'unknown' }>

export interface AgentReceivedCommits<P, B extends ContentBlock> {
  commit(input: ReceivedCommitInput<P, B>): Reply<ReceivedCommitResult>
  query(input: ExecutionMutation<P>): Reply<ReceivedCommitQuery>
}

export interface AgentReceivedRecords<P> {
  query(input: ExecutionMutation<P>): Reply<ReceivedCommitQuery>
}

export type ModelReceptionTarget = Readonly<{
  execution: AgentExecutionId
  instance: AgentInstanceId
  pending: Extract<PendingCall, { kind: 'model' }>
}>

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

export type ToolReceptionTarget = Readonly<{
  execution: AgentExecutionId
  instance: AgentInstanceId
  definition: Adoption
  pending: Extract<PendingCall, { kind: 'tool'; association: 'associated' }>
}>

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

export type AgentReceivedProvider<P, B extends ContentBlock> = Readonly<{
  journal: AgentJournal<P>
  entries: AgentJournalEntries<P>
  materials: AgentMaterials<P, B>
  received: AgentReceivedCommits<P, B> | null
}>

export type AgentAccountHandoff = Readonly<{
  call: M.ModelInvocationRef
  dispatch: M.DispatchId
  account: CallAccount
  resultVersion: M.ResultVersion | null
  committed: DurableEvidence
}>

export type AgentAccountOutcome =
  | Readonly<{ kind: 'received' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface AgentAccountOutlet<P> {
  deliver(
    input: Readonly<{ access: Access<P>; handoff: AgentAccountHandoff }>,
  ): Promise<AgentAccountOutcome>
}
