// Declarations of the public-api chapter "独立执行与提供者操作".
import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ContentReference } from '@omne-harness/content-block'
import type {
  Access,
  Adoption,
  ActorRef,
  Admit,
  CallAccess,
  ConsumerRef,
  DispatchId,
  FixedModelRequest,
  ModelCallId,
  ModelInstanceId,
  ModelOperationId,
  Mutation,
  ReadId,
  ResultCapacity,
  ResultVersion,
  Revision,
  Supplier,
  ToolDeclaration,
} from './root.ts'
import type {
  AckInput,
  AckReceipt,
  Admission,
  CallState,
  ControlState,
  CustodyState,
  DurableEvidence,
  ModelFailure,
  ModelBlock,
  ModelFault,
  Lookup,
  Reply,
  Settlement,
  Termination,
} from './result.ts'
import type {
  DispatchRecord,
  GrowingContentKind,
  ModelDirectory,
  ModelHandle,
  ModelRuntime,
  ReadState,
  ReadStart,
  Snapshot,
} from './call-surface.ts'
import type { CallAccount } from '@omne-harness/call-account'

export type TransportFailure = Extract<
  ModelFailure,
  { kind: 'denied' | 'invalid' | 'unsupported' | 'unavailable' }
>
export interface ModelToolPayloadAdapter<TPayload> {
  convertToModelPayload(declaration: ToolDeclaration): Outcome<TPayload, TransportFailure>
}
export interface ModelMediaLease {
  readonly bytes: AsyncIterable<Uint8Array>
  close(): Promise<void>
}
export interface ModelMediaReader<P> {
  open(
    input: Access<P> &
      Readonly<{
        invocation:
          | Readonly<{ kind: 'managed'; call: ModelCallId; dispatch: DispatchId }>
          | Readonly<{ kind: 'independent' }>
        request: FixedModelRequest
        source: DurableEvidence
        reference: ContentReference
        recipient: string
      }>,
    signal: AbortSignal,
  ): Promise<Outcome<ModelMediaLease, TransportFailure>>
}
export type TransportTermination =
  | Exclude<Termination, { kind: 'interrupted' }>
  | Readonly<{ kind: 'interrupted'; stop: 'confirmed' }>
export type TransportFact =
  | Readonly<{
      kind: 'block-open'
      index: string
      mode: 'append' | 'replace'
      content: GrowingContentKind
    }>
  | Readonly<{ kind: 'block-delta'; index: string; delta: string }>
  | Readonly<{ kind: 'block-replace'; index: string; value: string }>
  | Readonly<{ kind: 'block-seal'; index: string; block: ModelBlock }>
  | Readonly<{ kind: 'trim'; index: string; removed: string; reason: string }>
  | Readonly<{ kind: 'account'; event: string; value: CallAccount }>
  | Readonly<{ kind: 'ended'; termination: TransportTermination }>
export type IndependentModelFact =
  | TransportFact
  | Readonly<{ kind: 'not-started'; reason: 'cancelled' }>
  | Readonly<{ kind: 'not-started'; reason: 'rejected'; failure: TransportFailure }>
export type MaterializationReceipt = Readonly<{
  supplier: Adoption
  representation: Adoption
  payloadDigest: string
}>
export interface MaterializedTransport {
  readonly receipt: MaterializationReceipt
  start(signal: AbortSignal): AsyncIterable<TransportFact>
  close(): Promise<void>
}
export interface PreparedTransport {
  materialize(signal: AbortSignal): Promise<Outcome<MaterializedTransport, TransportFailure>>
  close(): Promise<void>
}
export interface ModelTransport {
  prepare(
    request: FixedModelRequest,
    supplier: Supplier,
  ): Promise<Outcome<PreparedTransport, TransportFailure>>
}
export type ExecutionRef = Readonly<{
  tenant: TenantId
  call: ModelCallId
  instance: ModelInstanceId
  generation: string
}>
export type WriteContext = ExecutionRef &
  Readonly<{
    operation: ModelOperationId
    expected: Revision
  }>
export type CommitQuery<T> =
  | Readonly<{ kind: 'committed'; value: T }>
  | Readonly<{ kind: 'rolled-back' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'not-committed' }>
export type DispatchPlan = Readonly<{
  dispatch: DispatchId
  supplier: Supplier
  policyDecision: DurableEvidence | null
}>
export type RetryDecision =
  | Readonly<{ kind: 'stop'; fault: ModelFault }>
  | Readonly<{ kind: 'retry'; supplier: Supplier; notBefore: string; basis: Adoption }>
export type RetryPosition = Readonly<{
  operation: ModelOperationId
  dispatch: DispatchId
  policy: Adoption
  consumer: ConsumerRef
}>
export type RetryResolution =
  | Readonly<{ kind: 'pending'; position: RetryPosition }>
  | Readonly<{
      kind: 'decided'
      position: RetryPosition
      decision: RetryDecision
      source: DurableEvidence
    }>
export type RecoveryRecord = Readonly<{
  state: CallState
  request: FixedModelRequest
  capacity: ResultCapacity
  initiator: ActorRef
  admission: ModelOperationId
  execution: ExecutionRef | null
  retry: RetryDecision | null
  retryPosition: RetryPosition | null
  unresolved: readonly ModelOperationId[]
  tasks: readonly ('execute' | 'control' | 'handoff' | 'cleanup' | 'account')[]
}>
export type LateDispatchFact =
  | Readonly<{ kind: 'account'; event: string; value: CallAccount }>
  | Readonly<{ kind: 'terminal'; event: string; actual: Termination }>
export interface ModelCommands<P> {
  admit(input: Admit<P>): Reply<Admission>
  recall(input: CallAccess<P> & Readonly<{ admission: ModelOperationId }>): Reply<Lookup>
  scanPending(
    input: Access<P> & Readonly<{ after: string | null; limit: number }>,
  ): Reply<Readonly<{ calls: readonly ModelCallId[]; next: string | null }>>
  loadRecovery(input: CallAccess<P>): Reply<RecoveryRecord>
  claim(
    input: CallAccess<P> &
      Readonly<{
        instance: ModelInstanceId
        operation: ModelOperationId
        continuity: DurableEvidence
      }>,
  ): Reply<ExecutionRef>
  prepareDispatch(input: WriteContext & DispatchPlan): Reply<Revision>
  recordMaterialization(
    input: WriteContext & Readonly<{ dispatch: DispatchId; receipt: MaterializationReceipt }>,
  ): Reply<Readonly<{ revision: Revision; source: DurableEvidence }>>
  recordSend(
    input: WriteContext &
      Readonly<{ dispatch: DispatchId; state: 'started' | 'unknown' | 'not-sent' }>,
  ): Reply<Revision>
  openReceiveWindow(
    input: WriteContext & Readonly<{ dispatch: DispatchId; window: string }>,
  ): Reply<Revision>
  preserve(
    input: WriteContext &
      Readonly<{ dispatch: DispatchId; window: string; facts: readonly TransportFact[] }>,
  ): Reply<Snapshot>
  recordLateFact(
    input: Access<P> &
      Readonly<{
        call: ModelCallId
        dispatch: DispatchId
        operation: ModelOperationId
        source: DurableEvidence
        fact: LateDispatchFact
      }>,
  ): Reply<Readonly<{ revision: Revision; recovered: boolean }>>
  prepareRetry(input: WriteContext & Readonly<{ dispatch: DispatchId }>): Reply<RetryPosition>
  decideRetry(
    input: WriteContext &
      Readonly<{ position: RetryPosition; decision: RetryDecision; source: DurableEvidence }>,
  ): Reply<Revision>
  settle(input: WriteContext & Readonly<{ termination: Termination }>): Reply<Settlement>
  control(input: Mutation<P>): Reply<ControlState>
  acquireRead(input: Mutation<P> & Readonly<{ result: ResultVersion }>): Reply<ReadStart>
  nextRead(input: CallAccess<P> & Readonly<{ read: ReadId; after: string }>): Reply<ReadState>
  endRead(input: CallAccess<P> & Readonly<{ read: ReadId }>): Reply<ReadState>
  handoff(input: AckInput<P>): Reply<AckReceipt>
  advanceCleanup(
    input: ExecutionRef & Readonly<{ operation: ModelOperationId }>,
  ): Reply<CustodyState>
  query(
    input: CallAccess<P> & Readonly<{ operation: ModelOperationId }>,
  ): Reply<CommitQuery<Readonly<{ revision: Revision }>>>
  dispatches(input: CallAccess<P>): Reply<readonly DispatchRecord[]>
}
export type SendDemand<P> = CallAccess<P> &
  Readonly<{
    execution: ExecutionRef
    dispatch: DispatchId
    request: FixedModelRequest
    supplier: Supplier
    consumer: ConsumerRef
    initiator: ActorRef
  }>
export type SendResult =
  | Readonly<{ kind: 'started'; facts: AsyncIterable<TransportFact> }>
  | Readonly<{ kind: 'not-started'; failure: ModelFailure }>
  | Readonly<{ kind: 'unknown'; dispatch: DispatchId; diagnostic: string }>
export interface ModelSendBoundary<P> {
  send(input: SendDemand<P>, signal: AbortSignal): Promise<SendResult>
}
export interface ModelRetryPolicy<P> {
  decide(
    input: CallAccess<P> &
      Readonly<{
        position: RetryPosition
        initiator: ActorRef
        request: FixedModelRequest
        dispatches: readonly DispatchRecord[]
        failure: ModelFault
      }>,
  ): Reply<RetryResolution>
  inspect(input: CallAccess<P> & Readonly<{ position: RetryPosition }>): Reply<RetryResolution>
}
export type Publication = Readonly<{
  execution: ExecutionRef
  registration: string
}>
export interface ModelClock {
  now(): string
  waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>
}
export interface ModelInstanceHost<P> {
  schedule(
    input: Readonly<{ tenant: TenantId; call: ModelCallId }>,
  ): Reply<Readonly<{ queued: true }>>
  publish(input: ExecutionRef, handle: ModelHandle<P>): Reply<Publication>
  withdraw(input: Publication): Reply<Readonly<{ removed: boolean }>>
  directory: ModelDirectory<P>
}
export interface ModelProvider<P> {
  readonly runtime: ModelRuntime<P>
  recover(input: Access<P>): Reply<Readonly<{ scheduled: string }>>
  quiesce(): Reply<Readonly<{ pending: string; running: string }>>
}
