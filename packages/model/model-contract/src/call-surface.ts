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
  CallContact,
  ControlState,
  CustodyState,
  Lookup,
  ModelBlock,
  Reply,
  Settlement,
  Termination,
  CallState,
} from './result.ts'
import type { MaterializationReceipt } from './provider-protocol.ts'
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
/** The moments of one dispatch, each read from the Model clock where it happened; null when the clock could not be read there. */
export type DispatchInstants = Readonly<{
  prepared: string | null
  sent: string | null
  responseStarted: string | null
  firstContent: string | null
  ended: string | null
}>
/** Why the transport connected again before the request went out. */
export type ConnectRetryReason = 'connect-failed' | 'connect-timeout'
export type DispatchRecord = Readonly<{
  dispatch: DispatchId
  supplier: Supplier
  intent: ModelOperationId
  send: 'prepared' | 'started' | 'unknown' | 'not-sent'
  firstContent: 'none-proven' | 'observed' | 'uncertain'
  terminal: Termination | null
  account: CallAccount | null
  materialization: Readonly<{ receipt: MaterializationReceipt; source: DurableEvidence }> | null
  messages?: readonly MessageId[]
  /** It carries no reasoning state: it is the resend after a refusal of it, or a later dispatch. */
  withoutReplay?: 'resend' | 'later'
  /** Absent on records written before dispatches kept their moments. */
  instants?: DispatchInstants
  /** The upstream's identity of this request, taken from a response header; used only to look up its cost. */
  request?: string
  connectRetries?: readonly ConnectRetryReason[]
  /** How often the after-the-fact cost lookup missed, and whether it gave up. Absent before a miss. */
  lookup?: Readonly<{ misses: number; exhausted: boolean }>
  /** The highest revision of a late account the consumer confirmed it saved. */
  lateDelivered?: string
}>
export interface ModelCalls<P> {
  admit(input: Admit<P>): Reply<Admission>
  inspect(input: ModelReferenceAccess<P>): Reply<Lookup>
  contact(input: ModelReferenceAccess<P>): Reply<CallContact>
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
