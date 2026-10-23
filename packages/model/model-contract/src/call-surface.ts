// Declarations of the public-api chapter "普通调用面与实例观察".
import type {
  Access,
  ModelReferenceAccess,
  CallAccess,
  Mutation,
  Admit,
  DispatchId,
  ModelCallId,
  ModelInstanceId,
  ModelOperationId,
  OutputCursor,
  ReadId,
  ResultVersion,
  Supplier,
} from './root.ts'
import type {
  AckInput,
  AckReceipt,
  Admission,
  ControlState,
  CustodyState,
  Lookup,
  ModelBlock,
  Reply,
  Settlement,
  Termination,
  CallState,
} from './result.ts'
import type { MaterializationReceipt } from './provider.ts'
import type { DurableEvidence } from './result.ts'
import type { CallAccount } from '@omne-harness/call-account'
import type { MessageId } from '@omne-harness/message'

export type GrowingContentKind = 'text' | 'thinking' | 'tool-arguments' | 'voice'
export type VisibleBlock =
  | Readonly<{ kind: 'sealed'; index: string; block: ModelBlock }>
  | Readonly<{
      kind: 'growing'
      index: string
      mode: 'append' | 'replace'
      content: GrowingContentKind
      value: string
    }>
export type Snapshot = Readonly<{
  call: ModelCallId
  cursor: OutputCursor
  blocks: readonly VisibleBlock[]
  state: CallState
}>
export type Observation =
  | Readonly<{ kind: 'snapshot'; value: Snapshot }>
  | Readonly<{ kind: 'changed'; value: Snapshot }>
  | Readonly<{
      kind: 'ended'
      reason: 'observer-closed' | 'stale-instance' | 'denied' | 'unavailable'
    }>
export interface ModelHandle<P> {
  readonly instance: ModelInstanceId
  observe(input: Access<P> & Readonly<{ signal: AbortSignal }>): AsyncIterable<Observation>
}
export type LiveRoute<P> =
  | Readonly<{ kind: 'live'; handle: ModelHandle<P> }>
  | Readonly<{ kind: 'no-live-route' }>
export type ResultTrim = Readonly<{ removed: string; reason: string }>
export type ResultPart = Readonly<{ trims: readonly ResultTrim[] }> &
  (
    | Readonly<{ kind: 'sealed'; block: ModelBlock }>
    | Readonly<{ kind: 'partial'; content: GrowingContentKind; value: string }>
  )
export type ResultPage = Readonly<{
  parts: readonly ResultPart[]
  next: string | null
  settlement: Settlement
}>
export type ReadState =
  | Readonly<{ kind: 'reading'; page: ResultPage }>
  | Readonly<{
      kind: 'ended'
      reason: 'complete' | 'closed' | 'denied' | 'stalled' | 'owner-lost'
    }>
export type ReadStart =
  | Readonly<{ kind: 'started'; read: ReadId; value: ReadState }>
  | Readonly<{ kind: 'acknowledged'; custody: Extract<CustodyState, { kind: 'acknowledged' }> }>
export type DispatchRecord = Readonly<{
  dispatch: DispatchId
  supplier: Supplier
  intent: ModelOperationId
  send: 'prepared' | 'started' | 'unknown' | 'not-sent'
  firstContent: 'none-proven' | 'observed' | 'uncertain'
  terminal: Termination | null
  account: CallAccount | null
  materialization: Readonly<{ receipt: MaterializationReceipt; source: DurableEvidence }> | null
  /**
   * The message identities of the fixed request this dispatch sent, in request order. The
   * provider copies them when it prepares the dispatch and keeps them as long as the account and
   * the receipt, also after it releases the request material. Absent on a record written before
   * this field existed.
   */
  messages?: readonly MessageId[]
}>
export interface ModelCalls<P> {
  admit(input: Admit<P>): Reply<Admission>
  inspect(input: ModelReferenceAccess<P>): Reply<Lookup>
  dispatches(input: CallAccess<P>): Reply<readonly DispatchRecord[]>
  cancel(input: Mutation<P>): Reply<ControlState>
}
export interface ModelConsumption<P> {
  beginRead(
    input: ModelReferenceAccess<P> &
      Readonly<{ operation: ModelOperationId; result: ResultVersion }>,
  ): Reply<ReadStart>
  readNext(input: CallAccess<P> & Readonly<{ read: ReadId; after: string }>): Reply<ReadState>
  closeRead(input: CallAccess<P> & Readonly<{ read: ReadId }>): Reply<ReadState>
  acknowledge(input: AckInput<P>): Reply<AckReceipt>
}
export interface ModelDirectory<P> {
  connect(input: ModelReferenceAccess<P>): Reply<LiveRoute<P>>
}
export interface ModelRuntime<P> {
  readonly calls: ModelCalls<P>
  readonly consumption: ModelConsumption<P>
  readonly instances: ModelDirectory<P>
}
