import type {
  ServiceInvalidInput,
  ServiceUnavailable,
  ServiceRuntimeStopped,
  ModelArrivalTarget,
  ObserverScope,
  ObserverReceiver,
  ModelObserverRequest,
  AuthorizedCallObserver,
  ObserverDiagnostic,
  OpenCallInput,
  AcknowledgementCleanupPolicy,
  SessionRuntimeBinding,
  RuntimeSessionAccess,
  ModelIdentitySource,
  CurrentHistoryReaders,
  RuntimeRecoveryAccess,
  RuntimeCloseResult,
} from '@omne-harness-lite/model-request-runtime'

import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'

import type { AttemptId } from '@omne-harness-lite/call-accounts'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'

import type { AssemblySnapshot } from '@omne-harness-lite/stream-assembly'

import type { CallKey } from '@omne-harness-lite/messages'
import type { CallAccess, CallPresence } from '@omne-harness-lite/model-request-runtime'
import type { CallFacts } from './reference-types.ts'
import type {
  ModelAdaptationBinding,
  ModelProfileRef,
  ModelProfileSnapshot,
  ModelRequestParameters,
  RouteName,
} from '@omne-harness-lite/model-profile'

import type { PendingModelResponse, SelectedBy } from '@omne-harness-lite/model-response'

import type {
  SettlementContention,
  SettlementDiagnostic,
  SettlementOwner,
  SettlementScheduler,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementCoordinator } from './settlement-types.ts'
import type {
  InvocationPolicy,
  PlannedSemantics,
  TransportAdapter,
} from '@omne-harness-lite/model-request-runtime'
import type { TokenMargin } from '@omne-harness-lite/model-request-runtime'
import type { AnchoredInvocationHandle } from '@omne-harness-lite/model-request-runtime'
import type { DiagnosticCollector } from './diagnostics-types.ts'

export type ObserverDelivery =
  | {
      readonly scope: ObserverScope
      readonly kind: 'snapshot'
      readonly snapshot: AssemblySnapshot
    }
  | {
      readonly scope: ObserverScope
      readonly kind: 'event'
      readonly position: JsonNumber
      readonly event: ArrivalEvent
    }

export type ObserverOfferResult =
  | { readonly accepted: true }
  | { readonly invalidInput: { readonly reason: 'malformed' | 'observer_scope_mismatch' } }
  | ServiceUnavailable
  | { readonly rejected: { readonly reason: 'buffer_full' | 'consumer_failed' } }

export interface ModelObserverQueue {
  readonly offer: (event: ArrivalEvent, snapshot: AssemblySnapshot) => ObserverOfferResult
  readonly start: (snapshot: AssemblySnapshot) => ObserverOfferResult
  readonly close: () => Promise<RuntimeCloseResult>
}

export interface ModelObserverQueueInput {
  readonly scope: ObserverScope
  readonly authorization: AuthorizedCallObserver
  readonly receiver: ObserverReceiver
  readonly maxBufferedEvents: JsonNumber
  readonly maxBufferedBytes: JsonNumber
  readonly diagnostic: (event: ObserverDiagnostic) => void
}

/** The exact acquired version remains owned until real work stops. */
export interface ExactTransportLease<P extends PlannedSemantics, R> {
  readonly binding: ModelAdaptationBinding
  readonly transport: TransportAdapter<P, R>
  readonly signal: AbortSignal
  readonly track: <T>(completion: Promise<T>) => Promise<T>
  readonly release: () => void
}

export interface ExactTransportAcquirer<P extends PlannedSemantics, R> {
  /** Synchronously clear caches through every still-owned provider; only undefined is success. */
  readonly clearReuseScope: (scope: object) => void
  readonly acquire: (
    binding: ModelAdaptationBinding,
    routeName: RouteName,
  ) =>
    | { readonly lease: ExactTransportLease<P, R> }
    | { readonly unavailable: true }
    | { readonly invalidInput: { readonly reason: 'malformed' } }
}

export interface PreparedCallBinding<P extends PlannedSemantics, R> {
  readonly profile: ModelProfileRef
  readonly snapshot: ModelProfileSnapshot
  readonly parameters: ModelRequestParameters
  readonly selectedBy: SelectedBy
  readonly lease: ExactTransportLease<P, R>
}

export interface RuntimeConstruction<P extends PlannedSemantics, R> {
  readonly callAccess: CallAccess
  readonly callPresence: CallPresence
  readonly callFacts: CallFacts
  /** Explicit bounded process-local preparation reuse; no default scope budget. */
  readonly maxScopes: number
  readonly sessions: RuntimeSessionAccess
  readonly calls: CallContainerStore<P, R>
  readonly transport: ExactTransportAcquirer<P, R>
  readonly settlementContention: SettlementContention
  readonly settlementScheduler: SettlementScheduler
  readonly policy: Omit<InvocationPolicy, 'diagnostic'> & {
    /** Service settlement diagnostics carry their existing durable correlation. */
    readonly diagnostic: (
      event: Parameters<InvocationPolicy['diagnostic']>[0] | SettlementDiagnostic,
    ) => void
  }
  /** Captured anew by each plan; no runtime fallback or inferred zero margin. */
  readonly tokenMargin: TokenMargin
  readonly identities: ModelIdentitySource
  readonly history: CurrentHistoryReaders
  readonly reservationWaitPolicy: ReservationWaitPolicy
  /** RT12 S-98: required; a runtime without it would publish a pseudo-available cleaner. */
  readonly acknowledgementCleanup: AcknowledgementCleanupPolicy
  readonly recovery: RuntimeRecoveryAccess
  readonly diagnostic: (event: SettlementDiagnostic) => void
  /** Engineering diagnostics are bound per operation after verified session ownership. */
  readonly diagnosticCollector?: Pick<DiagnosticCollector, 'emitter'>
}

/** Process-local admission budget, independent of durable settlement contention. */
export interface ReservationWaitPolicy {
  readonly maxWaitersPerCall: import('@omne-harness-lite/content-blocks').JsonNumber
  readonly timeoutMs: import('@omne-harness-lite/content-blocks').JsonNumber
}

/** Process-local admission only; durable status remains in the owned full log prefix. */
export interface CallContainerStore<P extends PlannedSemantics, R> {
  readonly find: (key: CallKey) => CallContainer<P, R> | undefined
  readonly reserve: (
    key: CallKey,
  ) =>
    | { readonly reservation: CallReservation<P, R> }
    | { readonly occupied: true }
    | { readonly closed: true }
  readonly waitReserve: (
    key: CallKey,
    input: {
      readonly policy: ReservationWaitPolicy
      readonly scheduler: SettlementScheduler
      readonly signal: AbortSignal
    },
  ) => Promise<{ readonly reservation: CallReservation<P, R> } | { readonly unavailable: true }>
  readonly insert: (reservation: CallReservation<P, R>, prepared: CallContainer<P, R>) => boolean
  readonly remove: (reservation: CallReservation<P, R>) => boolean
  /** Closes new admission synchronously and attempts to release every owned call. */
  readonly close: () => Promise<RuntimeCloseResult>
}

export type CallOperationState =
  | { readonly phase: 'ready' }
  | { readonly phase: 'complete' | 'interrupted'; readonly pending: PendingModelResponse }
  | {
      readonly phase: 'dispatching'
      readonly target: ModelArrivalTarget
      readonly attempt?: AttemptId
      readonly abort: () => void
      readonly interrupt: (initiator: 'user' | 'run_cancelled') => void
    }
  | { readonly phase: 'reply_pending'; readonly pending: PendingModelResponse }
  | { readonly phase: 'settling' }

export interface CallContainerView<P extends PlannedSemantics, R> {
  /** Real instance generation for host presence and independent receiver attachment. */
  readonly executionGeneration: object
  readonly key: CallKey
  readonly session: SessionRuntimeBinding
  readonly binding: PreparedCallBinding<P, R>
  readonly request: OpenCallInput
  readonly owner: SettlementOwner
  readonly coordinator: SettlementCoordinator
  /** The original dispatch handle owns the opened writer and reply settlement. */
  readonly invocation?: AnchoredInvocationHandle
  readonly observer?: CallObserverBinding
  readonly observerReplacementPending: boolean
  readonly operation: CallOperationState
}

export interface CallObserverBinding {
  readonly request: ModelObserverRequest
  readonly authorization: AuthorizedCallObserver
  readonly queue?: ModelObserverQueue
}

export interface CallContainer<P extends PlannedSemantics, R> {
  readonly key: CallKey
  readonly view: () => CallContainerView<P, R>
  /** Only process-local operation state. Publishing does not assert a durable phase. */
  readonly publish: (next: CallOperationState) => void
  /** Retain an actual stop promise independently of a short operation reservation. */
  readonly retainStopped: (stopped: Promise<void>) => void
  /** Ready-published execution may release its exact transport lease before disposition. */
  readonly releaseExecutionLease: () => RuntimeCloseResult
  /** Close admission; release only after actual stop and durable unknown reconciliation. */
  readonly close: () => Promise<RuntimeCloseResult>
  /** True only after close has released its exact lease. */
  readonly canRemove: () => boolean
}

/** Registered before preparation; owns a late resource even if store publication loses a race. */
export interface CallPreparationOwner<P extends PlannedSemantics, R> {
  readonly signal: AbortSignal
  readonly stopping: () => boolean
  readonly retainStopped: (actualStop: Promise<void>) => void
  /** Wrap and retain an early authorization; attach transfers this exact wrapper to the container. */
  readonly retainObserver: (observer: AuthorizedCallObserver) => AuthorizedCallObserver
  readonly attach: (container: CallContainer<P, R>) => void
  readonly discard: () => Promise<RuntimeCloseResult>
  readonly close: () => Promise<RuntimeCloseResult>
}

export type CallPreparationResult<P extends PlannedSemantics, R> =
  | { readonly owner: CallPreparationOwner<P, R> }
  | ServiceInvalidInput
  | ServiceRuntimeStopped
  | ServiceUnavailable

export interface SystemStopControl<P extends PlannedSemantics, R> {
  readonly view: () => CallContainerView<P, R>
  /** Only the same original owner's S-36 closure may settle and clear a stopped operation. */
  readonly publishStopped: () => void
}

export interface CallReservation<P extends PlannedSemantics, R> {
  readonly key: CallKey
  readonly view: () => CallContainerView<P, R> | undefined
  readonly publish: (next: CallOperationState) => void
  /** Bind only the original invocation under this short admission. */
  readonly attachInvocation: (handle: AnchoredInvocationHandle) => void
  /** Wait for the old send to release before constructing the next send. */
  readonly replaceInvocation: (
    create: () => AnchoredInvocationHandle,
  ) => Promise<{ readonly attached: AnchoredInvocationHandle } | { readonly unavailable: true }>
  /** Replace the current resume request, retaining the original call binding and lease. */
  readonly updateRequest: (request: OpenCallInput) => void
  /** Old queue and authorization must actually stop before a new endpoint can own this call. */
  readonly replaceObserverBinding: (
    next?: Omit<CallObserverBinding, 'queue'>,
  ) => Promise<{ readonly replaced: true } | ServiceUnavailable>
  readonly refreshObserverReplacement: () => Promise<{ readonly ready: true } | ServiceUnavailable>
  /** The next dispatch may proceed without observation while an old receiver is still stopping. */
  readonly replaceObserverQueue: (
    create: () => ModelObserverQueue,
  ) => Promise<{ readonly queue: ModelObserverQueue } | ServiceUnavailable>
  readonly release: () => void
}

export interface CreateCallContainerInput<P extends PlannedSemantics, R> {
  readonly key: CallKey
  readonly session: SessionRuntimeBinding
  readonly binding: PreparedCallBinding<P, R>
  readonly request: OpenCallInput
  readonly owner: SettlementOwner
  readonly coordinator: SettlementCoordinator
  readonly observer?: Omit<CallObserverBinding, 'queue'>
  /** The original call's durable S-36 stop, before physical invocation/lease release. */
  readonly systemStop: (control: SystemStopControl<P, R>) => Promise<RuntimeCloseResult>
}
