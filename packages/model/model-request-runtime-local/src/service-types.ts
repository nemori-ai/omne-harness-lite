import type {
  AckPendingReason,
  AckTarget,
  AcknowledgedCallView,
  AcquireCallInput,
  AcquireCallResult,
  CallAcknowledgement,
  CallHistoryDispatch,
  CallLifecycleState,
  CallResultFact,
  DispatchGuardPhase,
  EffectiveModel,
  ModelArrivalTarget,
  ModelDisplayEntry,
  ModelObserverRequest,
  ObserverReceiver,
  ObserverScope,
  OpenCallInput,
  ReconcileInput,
  RuntimeCloseResult,
  ServiceInvalidInput,
  ServiceRuntimeStopped,
  ServiceUnavailable,
  SessionSelectModelResult,
} from '@omne-harness-lite/model-request-runtime'
import type { AssetRegistryService, AvailabilityReport } from '@omne-harness-lite/asset-registry'
import type { ArrivalEvent, ArrivalTarget } from '@omne-harness-lite/arrival-events'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { AttemptId, ModelCallId, RunId } from '@omne-harness-lite/call-accounts'
import type { CapabilityId, JsonNumber } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { AssemblySnapshot } from '@omne-harness-lite/stream-assembly'
import type {
  AfterModelCallFailureSubject,
  ModelRequest,
  RetryPlan,
} from '@omne-harness-lite/loop-extension'
import type {
  CallKey,
  CreationKey,
  Message,
  MessageId,
  SessionRef,
} from '@omne-harness-lite/messages'
import type { CallAccess, CallFacts, CallPresence } from './reference-types.ts'
export type { CallKey } from '@omne-harness-lite/messages'
import type {
  ModelAdaptationBinding,
  ModelProfileRef,
  ModelProfileRejection,
  ModelProfileSnapshot,
  ModelRequestParameters,
  RouteName,
} from '@omne-harness-lite/model-profile'
import type { CredentialLookup, ModelCatalogRead } from '@omne-harness-lite/model-profile-directory'
import type {
  ModelResponse,
  PendingModelResponse,
  ReplyDisposition,
  ResponseId,
  SelectedBy,
} from '@omne-harness-lite/model-response'
import type { ModelToolName } from '@omne-harness-lite/tool-definition'
import type { LogEntry } from '@omne-harness-lite/session-log'
import type { CallHistoryResult } from './call-history.ts'
import type { ModelLogSettlementTarget } from '@omne-harness-lite/model-request-runtime'
import type { SessionModelSelectionInput } from './session-selection-types.ts'
import type { SettlementPrefix } from './settlement-prefix.ts'
import type {
  SettlementContention,
  SettlementCoordinator,
  SettlementDiagnostic,
  SettlementLogBinding,
  SettlementOwner,
  SettlementScheduler,
  RunHistoryReader,
} from './settlement-types.ts'
import type {
  InputLimitRejection,
  InvocationPolicy,
  PlannedSemantics,
  TransportAdapter,
} from '@omne-harness-lite/model-request-runtime'
import type { ReplaySelection, TokenMargin } from '@omne-harness-lite/model-request-runtime'
import type { AnchoredInvocationHandle } from './anchored-invocation-types.ts'
import type { DiagnosticCollector } from './diagnostics-types.ts'
export type ObserverScopeResult =
  | { readonly valid: true }
  | { readonly invalidInput: { readonly reason: 'observer_scope_mismatch' } }
  | ServiceUnavailable
export interface AuthorizedCallObserver {
  readonly check: (target: ModelArrivalTarget) => ObserverScopeResult
  readonly open: (
    target: ModelArrivalTarget,
  ) =>
    { readonly receiver: ObserverReceiver } | Exclude<ObserverScopeResult, { readonly valid: true }>
  readonly close: () => Promise<RuntimeCloseResult>
}
export interface SessionObserverAccess {
  readonly authorize: (input: {
    readonly request: ModelObserverRequest
    readonly session: SessionRef
    readonly tenant: TenantId
    readonly callId: ModelCallId
  }) =>
    | { readonly observer: AuthorizedCallObserver }
    | Exclude<ObserverScopeResult, { readonly valid: true }>
}
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

export interface ObserverDiagnostic {
  readonly session: SessionRef
  readonly tenant: TenantId
  readonly callId: ModelCallId
  readonly dispatch: JsonNumber
  readonly stage: 'offer' | 'delivery' | 'close'
  readonly reason:
    'malformed' | 'observer_scope_mismatch' | 'unavailable' | 'buffer_full' | 'consumer_failed'
  readonly position?: JsonNumber
  readonly bufferedEvents: JsonNumber
  readonly bufferedBytes: JsonNumber
}
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
/**
 * RT12 S-98: the explicit schedule of automatic retries of durable ACK cleanup. There is no
 * default; `stop` only ends the current round and never drops the durable responsibility.
 */
export interface AcknowledgementCleanupPolicy {
  readonly next: (input: {
    readonly attempts: JsonNumber
    readonly pendingReasons: readonly AckPendingReason[]
  }) => { readonly waitMs: JsonNumber } | { readonly stop: true }
}

export interface SessionRuntimeBinding {
  readonly log: SettlementLogBinding
  readonly selection: SessionModelSelectionInput
  readonly tools: Pick<AssetRegistryService, 'lookup'>
  readonly catalog: ModelCatalogRead
  readonly credentials: CredentialLookup
  /** Immutable version identifiers for non-value report/context/assembly inputs. */
  readonly sourceVersions: Readonly<Record<string, string>>
  readonly currentEvaluationInputs: CurrentEvaluationInputs
  readonly observers?: SessionObserverAccess
}
export interface RuntimeSessionAccess {
  /** Every bind checks the request identity against all returned session/tenant/generation owners. */
  readonly bind: (
    session: SessionRef,
  ) => Promise<
    | { readonly binding: SessionRuntimeBinding }
    | { readonly failure: 'invalidInput' | 'unavailable' }
  >
}
export interface ModelIdentitySource {
  readonly call: () => ModelCallId
  readonly response: () => ResponseId
  /** Distinct actual MessageId for a handed-off assistant reply. */
  readonly message: () => MessageId
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

export interface CurrentHistoryReaders {
  readonly call: (prefix: SettlementPrefix, callId: ModelCallId) => CallHistoryResult
  readonly failure: (
    prefix: SettlementPrefix,
    callId: ModelCallId,
  ) => { readonly subject: AfterModelCallFailureSubject } | { readonly unavailable: true }
  /** The host interprets actual selected sources; the runtime rechecks every locator in prefix. */
  readonly calibration: (
    prefix: SettlementPrefix,
    messages: readonly Message[],
    target: {
      readonly callId: ModelCallId
      readonly dispatch: JsonNumber
    } & (
      | { readonly run: RunId; readonly attempt: AttemptId }
      | { readonly run?: never; readonly attempt?: never }
    ),
  ) => CalibrationHistoryResult
  /** Actual G28 terminal recognition remains a host-supplied source. */
  readonly run: RunHistoryReader
}

export interface CalibrationSelectedSource {
  readonly messageIndex: number
  /** Null is legal only for a message with no durable source, never for an assistant ancestor. */
  readonly entry: LogEntry | null
}
export interface CalibrationHistoryCandidate {
  readonly dispatchedEntry: LogEntry
  readonly responseEntry: LogEntry
  readonly response: ModelResponse
  readonly replaySelection: readonly ReplaySelection[]
}
export type LocatedCalibrationCandidate = CalibrationHistoryCandidate &
  (
    | {
        readonly origin: 'selected_reply'
        readonly messageEntry: LogEntry
        readonly messageIndex: number
      }
    | {
        readonly origin: 'same_call_retry'
        readonly messageEntry?: never
        readonly messageIndex?: never
      }
  )
export type CalibrationHistoryResult =
  | {
      readonly selectedSources: readonly CalibrationSelectedSource[]
      /** Actual selected causal ancestors, newest first; not physical-response ordering. */
      readonly candidates: readonly LocatedCalibrationCandidate[]
    }
  | { readonly sourceUnavailable: true }
  | { readonly noObservation: true }

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
/** The host actually stops old effect-capable writers before returning a scope. */
export interface RuntimeRecoveryScope {
  readonly binding: { readonly log: SettlementLogBinding }
  readonly owner: SettlementOwner
  /** The host checks original session, tenant, call, dispatch and ResponseId ownership. */
  readonly originalInvocation: (
    key: CallKey,
    target: ModelLogSettlementTarget,
  ) =>
    | { readonly original: AnchoredInvocationHandle }
    | { readonly absent: true }
    | { readonly unavailable: true }
  /** Leaves the new host's recovery admission after its own work actually stops. */
  readonly close: () => Promise<void>
}
export interface RuntimeRecoveryAccess {
  readonly enter: (
    input: ReconcileInput,
  ) => Promise<{ readonly scope: RuntimeRecoveryScope } | { readonly unavailable: true }>
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
