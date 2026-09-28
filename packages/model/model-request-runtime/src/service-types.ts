import type { AssetRegistryService, AvailabilityReport } from '@omne-harness-lite/asset-registry'
import type { ArrivalEvent, ArrivalTarget } from '@omne-harness-lite/arrival-events'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/evaluation-input-store'
import type { AttemptId, ModelCallId, RunId } from '@omne-harness-lite/call-accounts'
import type { CapabilityId, JsonNumber } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { AssemblySnapshot } from '@omne-harness-lite/stream-assembly'
import type {
  AfterModelCallFailureSubject,
  ModelRequest,
  RetryPlan,
} from '@omne-harness-lite/loop-extension'
import type { MessageId, SessionRef } from '@omne-harness-lite/messages'
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
import type { CallHistoryDispatch, CallHistoryResult } from './call-history.ts'
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
} from './settlement-types.ts'
import type {
  InputLimitRejection,
  InvocationPolicy,
  PlannedSemantics,
  TokenMargin,
  TransportAdapter,
} from './types.ts'
import type { AnchoredInvocationHandle } from './anchored-invocation-types.ts'

/** The pair is always the identity; a callId alone is not an access key. */
export interface CallKey {
  readonly session: SessionRef
  readonly callId: ModelCallId
}

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
  | { readonly callId: ModelCallId; readonly state: 'open' | 'resumable' }
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
  | { readonly replyPending: PendingModelResponse }
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
export type ReconcileResult =
  | {
      readonly calls: readonly {
        readonly callId: ModelCallId
        readonly state: 'resumable' | 'awaiting_decision' | 'interrupted' | 'complete' | 'handed_up'
      }[]
    }
  | ServiceInvalidInput
  | ServiceUnavailable
export type ReadAttemptsResult =
  | {
      readonly state: 'open'
      readonly dispatches: readonly []
      readonly failureSubject?: never
    }
  | {
      readonly state: 'awaiting_decision'
      readonly dispatches: readonly CallHistoryDispatch[]
      readonly failureSubject: AfterModelCallFailureSubject
    }
  | {
      readonly state: Exclude<DispatchGuardPhase, 'open' | 'awaiting_decision'>
      readonly dispatches: readonly CallHistoryDispatch[]
      readonly failureSubject?: never
    }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceUnavailable
export type SettleReplyInput = CallKey & {
  readonly disposition: Exclude<ReplyDisposition, 'persisted'>
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

/** One service, with each operation's own closed result rather than a catch-all failure. */
export interface ModelRuntimeService {
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
  readonly dispatch: (input: DispatchInput) => Promise<DispatchResult>
  readonly dispatchAgain: (input: DispatchAgainInput) => Promise<DispatchAgainResult>
  readonly interrupt: (input: InterruptInput) => Promise<InterruptResult>
  readonly releaseCall: (input: CallKey) => Promise<ReleaseCallResult>
  readonly reconcile: (input: ReconcileInput) => Promise<ReconcileResult>
  readonly readAttempts: (input: CallKey) => Promise<ReadAttemptsResult>
  readonly settleReply: (input: SettleReplyInput) => Promise<SettleReplyResult>
  readonly canDispatchAgain: (input: CanDispatchAgainInput) => Promise<CanDispatchAgainResult>
}

export interface SessionRuntimeBinding {
  readonly log: SettlementLogBinding
  readonly selection: SessionModelSelectionInput
  readonly tools: Pick<AssetRegistryService, 'lookup'>
  readonly catalog: ModelCatalogRead
  readonly credentials: CredentialLookup
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
  readonly acquire: (
    binding: ModelAdaptationBinding,
    routeName: RouteName,
  ) => { readonly lease: ExactTransportLease<P, R> } | { readonly unavailable: true }
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
  /** G-4: the real Run interpreter has no adopted implementation; withRun remains unavailable. */
  readonly run: (
    prefix: SettlementPrefix,
    originalRun: RunId,
    originalAttempt: AttemptId,
  ) => { readonly unavailable: true }
}

export interface RuntimeConstruction<P extends PlannedSemantics, R> {
  readonly sessions: RuntimeSessionAccess
  readonly calls: CallContainerStore<P, R>
  readonly transport: ExactTransportAcquirer<P, R>
  readonly settlementContention: SettlementContention
  readonly settlementScheduler: SettlementScheduler
  readonly policy: InvocationPolicy
  /** Captured anew by each plan; no runtime fallback or inferred zero margin. */
  readonly tokenMargin: TokenMargin
  readonly identities: ModelIdentitySource
  readonly history: CurrentHistoryReaders
  readonly reservationWaitPolicy: ReservationWaitPolicy
  readonly recovery: RuntimeRecoveryAccess
  readonly diagnostic: (event: SettlementDiagnostic) => void
}
/** The host actually stops old effect-capable writers before returning a scope. */
export interface RuntimeRecoveryScope {
  readonly binding: SessionRuntimeBinding
  readonly owner: SettlementOwner
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
  | { readonly phase: 'dispatching'; readonly abort: () => void }
  | { readonly phase: 'reply_pending'; readonly pending: PendingModelResponse }
  | { readonly phase: 'settling' }
export interface CallContainerView<P extends PlannedSemantics, R> {
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
