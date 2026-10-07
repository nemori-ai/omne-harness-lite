import type { AssetRegistryService, AvailabilityReport } from '@omne-harness-lite/asset-registry'
import type { ArrivalTarget } from '@omne-harness-lite/arrival-events'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { AttemptId, ModelCallId, RunId } from '@omne-harness-lite/call-accounts'
import type { CapabilityId, JsonNumber } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'

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
  CallAcknowledgement,
  CallLifecycleState,
  CallResultFact,
} from './reference-types.ts'
import type {
  ModelProfileRejection,
  ModelRequestParameters,
  RouteName,
} from '@omne-harness-lite/model-profile'
import type { CredentialLookup, ModelCatalogRead } from '@omne-harness-lite/model-profile-directory'
import type {
  ModelResponse,
  PendingModelResponse,
  ReplyDisposition,
  ResponseId,
} from '@omne-harness-lite/model-response'
import type { ModelToolName } from '@omne-harness-lite/tool-definition'
import type { LogEntry } from '@omne-harness-lite/session-log'
import type { CallHistoryDispatch, CallHistoryResult } from './call-history.ts'
import type { ModelLogSettlementTarget } from './log-codec-settlement.ts'
import type { DispatchGuardPhase } from './dispatch-guard.ts'
import type {
  SessionModelSelectionInput,
  SessionSelectModelResult,
} from './session-selection-types.ts'
import type { EffectiveModel, ModelDisplayEntry } from './selection-types.ts'
import type { SettlementPrefix } from './settlement-prefix.ts'
import type { SettlementLogBinding, SettlementOwner, RunHistoryReader } from './settlement-types.ts'
import type { InputLimitRejection } from './invocation-types.ts'
import type { ReplaySelection } from './planning-types.ts'
import type { AnchoredInvocationHandle } from './anchored-invocation-types.ts'

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

/** RT12 S-96: the fifteenth operation of ModelRuntimeOperations. */
export type AcknowledgeCallOperation = (
  input: AcknowledgeCallInput,
) => Promise<AcknowledgeCallResult>

/** One service, with each operation's own closed result rather than a catch-all failure. */
export interface ModelRuntimeOperations {
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
