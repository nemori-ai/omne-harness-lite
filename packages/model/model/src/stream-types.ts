import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { StreamCursor } from '@omne-harness/stream-arrival'
import type {
  CallState,
  DispatchId,
  ModelFailure,
  ModelInvocationRef,
  ModelOperationId,
  ModelStreamObservation,
  ModelStreamReferences,
  ModelStreamSnapshot,
  OutputCursor,
  Snapshot,
} from '@omne-harness/model-contract'
import type { ExecutionRef, Publication } from '@omne-harness/model-contract/provider'

export type ObservationFacts = Readonly<{
  tenant: TenantId
  reference: ModelInvocationRef
  admission: ModelOperationId
  state: CallState
  execution: ExecutionRef | null
  material:
    | Readonly<{ kind: 'before-dispatch' }>
    | Readonly<{ kind: 'retained'; dispatch: DispatchId; snapshot: Snapshot }>
    | Readonly<{ kind: 'released'; dispatch: DispatchId | null; cursor: OutputCursor }>
}>
export type ConfirmedObservationRecord = Readonly<{
  tenant: TenantId
  reference: ModelInvocationRef
  admission: ModelOperationId
  serial: string
  state: CallState
  target: null | Readonly<{
    publication: Publication
    snapshot: ModelStreamSnapshot
    cursor: StreamCursor
  }>
}>
export type ObservationRead<P> = Readonly<{
  access: Access<P>
  reference: ModelInvocationRef
  purpose: 'current' | 'observe'
}>
export type ModelObservationLimits = Readonly<{
  maxSnapshotBytes: number
  maxDeltaBytes: number
  maxQueuedFrames: number
  maxQueuedBytes: number
  maxObserversPerTenant: number
  maxObservers: number
  maxPendingSourceOperations: number
  maxRetainedCalls: number
  maxRetainedBytes: number
  maxTotalBytes: number
  maxQueueResidenceMs: number
  checkIntervalMs: number
}>
export type ModelObservationTiming = Readonly<{
  nowMs(): number
  waitUntil(deadlineMs: number, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>
}>
export type ModelObservationHost<P> = Readonly<{
  references: ModelStreamReferences<P>
  observation: ModelStreamObservation<P>
  attach(publication: Publication): void
  retire(publication: Publication): void
  close(): void
}>
export type ModelObservationSource<P> = Readonly<{
  openHost(): Outcome<ModelObservationHost<P>, ModelFailure>
  close(): void
}>
