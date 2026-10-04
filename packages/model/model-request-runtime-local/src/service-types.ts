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
import type {
  AckPendingReason,
  AckTarget,
  AcknowledgedCallView,
  AcquireCallInput,
  AcquireCallResult,
  CallAccess,
  CallAcknowledgement,
  CallFacts,
  CallPresence,
  CallLifecycleState,
  CallResultFact,
} from './reference-types.ts'
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
import type { CallHistoryDispatch, CallHistoryResult } from './call-history.ts'
import type { ModelLogSettlementTarget } from '@omne-harness-lite/model-request-runtime'
import type { DispatchGuardPhase } from './dispatch-guard.ts'
import type {
  SessionModelSelectionInput,
  SessionSelectModelResult,
} from './session-selection-types.ts'
import type { EffectiveModel, ModelDisplayEntry } from './selection-types.ts'
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
import type {InputLimitRejection, InvocationPolicy, PlannedSemantics, TransportAdapter} from '@omne-harness-lite/model-request-runtime'
import type { ReplaySelection, TokenMargin } from '@omne-harness-lite/model-request-runtime'
import type { AnchoredInvocationHandle } from './anchored-invocation-types.ts'
import type { DiagnosticCollector } from './diagnostics-types.ts'

export type ServiceInvalidReason =
  | ModelProfileRejection
  | 'malformed'
  | 'observer_scope_mismatch'
  | 'modality_mismatch'
  | 'unknownTool'
  | 'input_limit_missing'
  | 'input_limit_exceeded'
  | 'input_size_unavailable'
type PlainInvalidReason = Exclude<
  ServiceInvalidReason,
  'input_limit_missing' | 'input_limit_exceeded' | 'input_size_unavailable'
>
type WrapInputLimitRejection<T> = T extends InputLimitRejection
  ? { readonly invalidInput: Omit<T, 'rejected'> }
  : never
export type ServiceInvalidInput =
  | { readonly invalidInput: { readonly reason: PlainInvalidReason } }
  | WrapInputLimitRejection<InputLimitRejection>
export type ServiceUnavailable = { readonly unavailable: true }
export type ServiceCallNotFound = { readonly callNotFound: true }
export type ServiceAlreadyEnded = { readonly alreadyEnded: true }
export type ServiceWrongPhase = { readonly wrongPhase: { readonly phase: DispatchGuardPhase } }
export type ServiceRuntimeStopped = { readonly runtimeStopped: true }
export type ServiceRetryRefused = {
  readonly retryRefused: { readonly why: 'already_spoke' | 'fact_class' | 'provider_not_allowed' }
}
export type ServiceAlreadySpoke = { readonly retryRefused: { readonly why: 'already_spoke' } }
export type ServiceProfileNotFound = { readonly profileNotFound: true }
export type ServiceNotLegalTarget = Extract<
  SessionSelectModelResult,
  { readonly notLegalTarget: object }
>

export type ServiceLegalTargetsResult =
  { readonly legalTargets: readonly RouteName[] } | ServiceInvalidInput | ServiceUnavailable
export type ServiceDisplayListResult =
  | { readonly displayList: readonly ModelDisplayEntry[] }
  | ServiceInvalidInput
  | ServiceUnavailable
  | ServiceProfileNotFound
export type ServiceEffectiveModelResult =
  | { readonly effectiveModel: EffectiveModel }
  | ServiceInvalidInput
  | ServiceProfileNotFound
  | ServiceUnavailable
export type ServiceSelectModelResult =
  | { readonly selected: RouteName }
  | ServiceInvalidInput
  | ServiceUnavailable
  | ServiceProfileNotFound
  | ServiceNotLegalTarget

/** OpenCall's run/report members are a single choice, never independently optional. */
export type OpenCallRun =
  | {
      readonly run: RunId
      readonly attempt: AttemptId
      readonly report: AvailabilityReport
    }
  | { readonly run?: never; readonly attempt?: never; readonly report?: never }

/** The original call's actual lifetime owner, independent of session identity. */
export interface ModelCallHost {
  readonly signal: AbortSignal
  readonly stopping: () => boolean
  readonly register: (
    close: () => Promise<RuntimeCloseResult>,
  ) =>
    | { readonly registration: { readonly unregister: () => void } }
    | ServiceRuntimeStopped
    | ServiceUnavailable
}

export type ModelArrivalTarget = Extract<ArrivalTarget, { readonly kind: 'model_call' }>
export interface ObserverScope {
  readonly session: SessionRef
  readonly tenant: TenantId
  readonly target: ModelArrivalTarget
}
export interface ObserverReceiveTask {
  readonly completion: Promise<void>
  readonly stopped: Promise<void>
}
export interface ObserverReceiver {
  readonly receive: (serialized: string, signal: AbortSignal) => ObserverReceiveTask
  readonly stop: () => void
  readonly stopped: Promise<void>
}
export interface ModelObserverEndpoint {
  readonly open: (scope: ObserverScope) => ObserverReceiver
}
export interface ModelObserverRequest {
  readonly session: SessionRef
  readonly endpoint: ModelObserverEndpoint
  readonly observer_max_buffered_events: JsonNumber
  readonly observer_max_buffered_bytes: JsonNumber
}
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

export type OpenCallInput = OpenCallRun & {
  readonly creationKey: CreationKey
  readonly session: SessionRef
  readonly callId?: ModelCallId
  readonly messages: ModelRequest['messages']
  readonly target: ModelRequest['target']
  readonly targetChangedBy?: CapabilityId
  readonly basis: EffectiveModel
  readonly parameters?: ModelRequestParameters
  readonly tools: readonly ModelToolName[]
  readonly host: ModelCallHost
  readonly observer?: ModelObserverRequest
}
export type OpenCallResult =
  | {
      readonly ref: CallKey
      readonly callId: ModelCallId
      readonly state: CallLifecycleState
      readonly acknowledged?: never
    }
  /** RT12 S-100: same creationKey after a legal ACK recognizes the original by digest. */
  | {
      readonly ref: CallKey
      readonly callId: ModelCallId
      readonly acknowledged: AcknowledgedCallView
      readonly state?: never
    }
  | { readonly creationConflict: true }
  | {
      readonly callId: ModelCallId
      readonly state: 'handed_up'
      readonly undispatched:
        'withdrawn' | 'scope_disallowed' | 'modality_mismatch' | 'credential_unavailable'
    }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceRuntimeStopped
  | ServiceWrongPhase
  | ServiceUnavailable
  | ServiceProfileNotFound

export type DispatchSuccess =
  | {
      readonly replyPending: PendingModelResponse
      readonly state: 'complete' | 'interrupted'
      readonly disposition: 'disposition_pending'
    }
  | {
      readonly settled: ModelResponse & { readonly outcome: 'failed' }
      readonly failureSubject: AfterModelCallFailureSubject
    }
  | {
      readonly settled: ModelResponse & { readonly outcome: 'interrupted'; readonly reply?: never }
      readonly failureSubject?: never
    }
  | {
      readonly callId: ModelCallId
      readonly state: 'handed_up'
      readonly undispatched: 'modality_mismatch' | 'credential_unavailable'
    }
  | {
      readonly callId: ModelCallId
      readonly state: 'handed_up'
      readonly released: { readonly cause: 'credential_unavailable' }
    }
export type DispatchInput = CallKey & { readonly attempt?: AttemptId }
export type DispatchResult =
  | DispatchSuccess
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceAlreadySpoke
  | ServiceWrongPhase
  | ServiceRuntimeStopped
  | ServiceUnavailable
export type DispatchAgainInput = DispatchInput & { readonly plan: RetryPlan }
export type DispatchAgainResult =
  | DispatchSuccess
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceRetryRefused
  | ServiceWrongPhase
  | ServiceRuntimeStopped
  | ServiceUnavailable
export type InterruptInput = CallKey & { readonly initiator: 'user' | 'run_cancelled' }
export type InterruptResult =
  | { readonly stage: 'before_dispatch' | 'in_flight' | 'speaking' }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceUnavailable
export type ReleaseCallResult =
  | { readonly callId: ModelCallId; readonly state: 'handed_up' }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceWrongPhase
  | ServiceUnavailable
export type ReconcileInput = { readonly session: SessionRef; readonly attempt?: AttemptId }
/** RT12 S-100: an acknowledged call is reported by its S-97 branch, never as notFound. */
export type ReconciledCall =
  | {
      readonly callId: ModelCallId
      readonly state: CallLifecycleState
      readonly acknowledged?: never
    }
  | {
      readonly callId: ModelCallId
      readonly acknowledged: AcknowledgedCallView
      readonly state?: never
    }
export type ReconcileResult =
  { readonly calls: readonly ReconciledCall[] } | ServiceInvalidInput | ServiceUnavailable
/**
 * RT12 S-34⑤/S-86: one dispatch as readAttempts returns it. A confirmed ready without a final
 * carries its complete original result with disposition_pending; a final stays in `response`.
 */
export type ReadAttemptDispatch = CallHistoryDispatch & {
  readonly result?: Extract<CallResultFact, { readonly disposition: 'disposition_pending' }>
}

export type ReadAttemptsResult =
  | {
      readonly state: 'open'
      readonly dispatches: readonly []
      readonly failureSubject?: never
      readonly acknowledged?: never
    }
  | {
      readonly state: 'awaiting_decision'
      readonly dispatches: readonly ReadAttemptDispatch[]
      readonly failureSubject: AfterModelCallFailureSubject
      readonly acknowledged?: never
    }
  | {
      readonly state: Exclude<DispatchGuardPhase, 'open' | 'awaiting_decision'>
      readonly dispatches: readonly ReadAttemptDispatch[]
      readonly failureSubject?: never
      readonly acknowledged?: never
    }
  /** RT12 S-100: the S-97 small attempt sequence; full dispatch records are not restored. */
  | {
      readonly acknowledged: AcknowledgedCallView
      readonly state?: never
      readonly dispatches?: never
      readonly failureSubject?: never
    }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceUnavailable

/** The actual runner execution, not the attempt of the original model dispatch. */
export interface ModelFailureExecution {
  readonly run: RunId
  readonly attempt: AttemptId
}

/** Transient, non-serializable proof from the same authorized failure read. */
export interface ModelFailureSource {
  readonly subject: AfterModelCallFailureSubject
  readonly verify: (
    subject: AfterModelCallFailureSubject,
    execution: ModelFailureExecution,
  ) =>
    | { readonly authoritativeSubject: AfterModelCallFailureSubject }
    | { readonly invalidInput: true }
    | { readonly unavailable: true }
  readonly release: () => void
}
export type FailureConsumption<R> = {
  readonly result: R
  readonly consumption:
    | { readonly kind: 'failure'; readonly source: ModelFailureSource }
    | { readonly kind: 'notApplicable' }
}
export interface FailureConsumableOperation<I, R> {
  (input: I): Promise<R>
  (input: I, options: { readonly consumeFailure: true }): Promise<FailureConsumption<R>>
}
export type SettleReplyInput = CallKey & {
  readonly disposition: Exclude<ReplyDisposition, 'persisted'>
  /**
   * RT12 S-99: the caller-held original. Before ACK it must equal the runtime's authoritative
   * value; after ACK without a final it is required and is checked, never trusted.
   */
  readonly retainedResult?: PendingModelResponse
}
export type SettleReplyResult =
  | { readonly callId: ModelCallId; readonly state: 'complete' | 'interrupted' }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceWrongPhase
  | ServiceUnavailable
export type CanDispatchAgainInput = CallKey & { readonly plan: RetryPlan }
export type CanDispatchAgainResult =
  | { readonly allowed: true }
  | { readonly refused: ServiceRetryRefused['retryRefused'] }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceWrongPhase
  | ServiceUnavailable

/** RT12 S-96①: explicit target; caller accounts, lists or digests are never authority. */
export interface AcknowledgeCallInput {
  readonly ref: CallKey
  readonly expectedResult: AckTarget
}
/** RT12 S-96⑥: a failed cleanup after confirmation is `acknowledged` with pending, not a failure. */
export type AcknowledgeCallResult =
  | { readonly acknowledged: CallAcknowledgement }
  | ServiceInvalidInput
  | ServiceUnavailable
  | ServiceCallNotFound
  | ServiceWrongPhase
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
/** RT12 S-96: the fifteenth operation of ModelRuntimeService. */
export type AcknowledgeCallOperation = (
  input: AcknowledgeCallInput,
) => Promise<AcknowledgeCallResult>

/** One service, with each operation's own closed result rather than a catch-all failure. */
export interface ModelRuntimeService {
  readonly acquireCall: (input: AcquireCallInput) => Promise<AcquireCallResult>
  readonly legalTargets: (input: {
    readonly session: SessionRef
  }) => Promise<ServiceLegalTargetsResult>
  readonly displayList: (input: {
    readonly session: SessionRef
  }) => Promise<ServiceDisplayListResult>
  readonly effectiveModel: (input: {
    readonly session: SessionRef
  }) => Promise<ServiceEffectiveModelResult>
  readonly selectModel: (input: {
    readonly session: SessionRef
    readonly routeName: RouteName
  }) => Promise<ServiceSelectModelResult>
  readonly openCall: (input: OpenCallInput) => Promise<OpenCallResult>
  readonly dispatch: FailureConsumableOperation<DispatchInput, DispatchResult>
  readonly dispatchAgain: FailureConsumableOperation<DispatchAgainInput, DispatchAgainResult>
  readonly interrupt: (input: InterruptInput) => Promise<InterruptResult>
  readonly releaseCall: (input: CallKey) => Promise<ReleaseCallResult>
  readonly reconcile: (input: ReconcileInput) => Promise<ReconcileResult>
  readonly readAttempts: FailureConsumableOperation<CallKey, ReadAttemptsResult>
  readonly settleReply: (input: SettleReplyInput) => Promise<SettleReplyResult>
  readonly canDispatchAgain: (input: CanDispatchAgainInput) => Promise<CanDispatchAgainResult>
  /** RT12 S-96: the fifteenth operation. */
  readonly acknowledgeCall: AcknowledgeCallOperation
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
export type RuntimeCloseResult = { readonly released: true } | { readonly unavailable: true }

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
