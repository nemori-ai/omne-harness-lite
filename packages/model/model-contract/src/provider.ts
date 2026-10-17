// Declarations of the public-api chapter "独立执行与提供者操作".
// TransportFact and every name that carries it (IndependentModelFact, MaterializedTransport,
// PreparedTransport, ModelTransport, ModelCommands, SendResult, ModelSendBoundary,
// ModelInstanceHost, ModelProvider) refer to ModelBlock, which is not declared until the shared
// message package has ToolCallPart.
import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ContentReference } from '@omne-harness/content-block'
import type {
  Access,
  Adoption,
  ActorRef,
  CallAccess,
  ConsumerRef,
  DispatchId,
  FixedModelRequest,
  ModelCallId,
  ModelInstanceId,
  ModelOperationId,
  ResultCapacity,
  Revision,
  Supplier,
  ToolDeclaration,
} from './root.ts'
import type {
  CallState,
  DurableEvidence,
  ModelFailure,
  ModelFault,
  Reply,
  Termination,
} from './result.ts'
import type { DispatchRecord } from './call-surface.ts'
import type { RequestBudget } from './profile.ts'
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
export type CompleteRequestBudget = Extract<RequestBudget, { kind: 'complete' }>
export type MaterializationReceipt = Readonly<{
  supplier: Adoption
  budget: CompleteRequestBudget
  representation: Adoption
  payloadDigest: string
}>
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
export type SendDemand<P> = CallAccess<P> &
  Readonly<{
    execution: ExecutionRef
    dispatch: DispatchId
    request: FixedModelRequest
    supplier: Supplier
    consumer: ConsumerRef
    initiator: ActorRef
  }>
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
