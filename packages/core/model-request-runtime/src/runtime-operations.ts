import type {
  CallKey,
  SessionRef,
  ModelCallCreatedPayload,
  ModelCallAcknowledgedRecord,
  CreationKey,
  ModelCallDispatchedRecord,
  ModelCallReplyReadyRecord,
} from '@omne-harness-lite/messages'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { ArrivalTarget } from '@omne-harness-lite/arrival-events'
import type { JsonNumber, CapabilityId, JsonValue } from '@omne-harness-lite/content-blocks'
import type {
  ModelLogSettlementTarget,
  InputLimitRejection,
  ModelLogResponseProjection,
} from './index.ts'
import type {
  PendingModelResponse,
  ModelResponse,
  ResponseId,
  Route,
  Timing,
  ReplyDisposition,
} from '@omne-harness-lite/model-response'
import type {
  ModelProfileRejection,
  RouteName,
  ModelProfileRef,
  ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import type { CatalogScope } from '@omne-harness-lite/model-profile-directory'
import type { RunId, AttemptId, ModelCallId } from '@omne-harness-lite/call-accounts'
import type { AvailabilityReport } from '@omne-harness-lite/asset-registry'
import type {
  ModelRequest,
  AfterModelCallFailureSubject,
  RetryPlan,
} from '@omne-harness-lite/loop-extension'
import type { ModelToolName } from '@omne-harness-lite/tool-definition'
import type { LogEntry } from '@omne-harness-lite/session-log'

export interface CallHistoryDispatch {
  readonly ordinal: JsonNumber
  readonly dispatched: LogEntry
  readonly record: ModelCallDispatchedRecord
  readonly opened: LogEntry | null
  readonly response: {
    /** Original complete validated response, including raw usage and billing facts. */
    readonly value: JsonValue
    readonly projection: ModelLogResponseProjection
    readonly entry: LogEntry
  } | null
  /**
   * RT11/RT12 S-86: the confirmed ready marker of this dispatch. Its complete original result
   * lives in the immutable content row; this prefix alone proves only that it is durable.
   */
  readonly ready: {
    readonly record: ModelCallReplyReadyRecord
    readonly entry: LogEntry
  } | null
}

/** RT4 S-6. This is a projection of the caller's current authoritative facts. */
export type DispatchGuardPhase =
  | 'open'
  | 'in_flight'
  | 'speaking'
  | 'reply_pending'
  | 'awaiting_decision'
  | 'resumable'
  | 'complete'
  | 'handed_up'
  | 'interrupted'

/** RT11 S-6 is shared by lookup, creation recognition and reconciliation. */
export type CallLifecycleState =
  | 'open'
  | 'in_flight'
  | 'speaking'
  | 'reply_pending'
  | 'awaiting_decision'
  | 'resumable'
  | 'complete'
  | 'handed_up'
  | 'interrupted'

export interface CallSource {
  /** Bound to the actual log dataset by trusted assembly; never serialized into CallKey. */
  readonly generation: object
  readonly progress: JsonNumber
}

export type CallOrigin = ModelCallCreatedPayload['origin']

export type CallResultFact =
  | {
      readonly disposition: 'disposition_pending'
      readonly pending: PendingModelResponse
    }
  | {
      readonly disposition: 'final'
      readonly response: ModelResponse
    }

export type CallPresenceFact = {
  readonly source: CallSource
  /** Exact original execution registration; absence is not proof of stopping. */
  readonly executionGeneration: object | null
  readonly sourceVersion: string
} & (
  | {
      readonly kind: 'live'
    }
  | {
      readonly kind: 'stopped'
      readonly target: ModelLogSettlementTarget | null
      readonly unknownBatches: readonly string[]
    }
  | {
      readonly kind: 'unknown'
    }
  | {
      readonly kind: 'notFound'
    }
)

/** A view of a call whose model-side copy is still retained (no legal acknowledgement yet). */
export interface RetainedCallReadView {
  readonly ref: CallKey
  readonly origin: CallOrigin
  readonly state: CallLifecycleState
  readonly source: CallSource
  readonly presence: Exclude<
    CallPresenceFact,
    {
      readonly kind: 'notFound'
    }
  >
  readonly result?: CallResultFact
  readonly acknowledged?: never
}

/** RT12 S-95 AckTarget: the record projection owned by MS8 S-58, never a second union. */
export type AckTarget = ModelCallAcknowledgedRecord['target']

/** RT12 S-96⑤: only current, real obstacles to releasing the model-side copy. */
export type AckPendingReason =
  | 'writer_in_flight'
  | 'read_in_flight'
  | 'receipt_unknown'
  | 'storage_unavailable'
  | 'external_retention'

/** RT12 S-96⑤: confirmation summary plus the current cleanup progress of the same CallKey. */
export type CallAcknowledgement = {
  readonly ref: CallKey
  readonly target: AckTarget
  /** The original acknowledgement fact's time; never rewritten by a later recognition. */
  readonly acknowledgedAt: ModelCallAcknowledgedRecord['acknowledgedAt']
} & (
  | {
      readonly cleanup: 'pending'
      /** Non-empty and without duplicates. */
      readonly pendingReasons: readonly [AckPendingReason, ...AckPendingReason[]]
    }
  | {
      readonly cleanup: 'released'
      readonly pendingReasons?: never
    }
)

/** RT12 S-97: the current final disposition of one attempt, or the reply still pending. */
export type AcknowledgedAttemptDisposition =
  | {
      readonly disposition: 'final'
      readonly replyDisposition?: ReplyDisposition
      readonly late?: true
    }
  | {
      readonly disposition: 'disposition_pending'
      readonly replyDisposition?: never
      readonly late?: never
    }

/**
 * RT12 S-97: one original dispatch as a small accounting result. It never carries the route,
 * profile, parameters, reply, delivered content, raw response or input calibration.
 */
export type AcknowledgedAttempt = {
  readonly response: ResponseId
  readonly dispatch: JsonNumber
  /** The original account shell of this dispatch; may differ from the creation attempt. */
  readonly origin: CallOrigin
  readonly usage: ModelResponse['usage']
  readonly cost: ModelResponse['cost']
  readonly credentialScope: Route['credentialScope']
  readonly provider: Route['provider']
  readonly upstreamRequestId?: string
  readonly timing: Timing
} & (
  | {
      readonly outcome: 'interrupted'
      readonly initiator: 'user' | 'run_cancelled' | 'runtime_lost'
    }
  | {
      readonly outcome: 'complete' | 'truncated' | 'failed'
      readonly initiator?: never
    }
) &
  AcknowledgedAttemptDisposition

/**
 * RT12 S-97: the explicit acknowledged branch. Released content is neither callNotFound nor
 * damage, and this branch is not another encoding of a complete response.
 */
export interface AcknowledgedCallView {
  readonly ref: CallKey
  readonly acknowledged: CallAcknowledgement
  readonly origin: CallOrigin
  readonly terminalState: ModelCallAcknowledgedRecord['terminalState']
  readonly source: CallSource
  /** Known to be empty only when no dispatch exists; an unverifiable source is unavailable. */
  readonly attempts: readonly AcknowledgedAttempt[]
  readonly state?: never
  readonly presence?: never
  readonly result?: never
}

/** Discriminated by `acknowledged`: present only on the RT12 S-97 branch. */
export type CallReadView = RetainedCallReadView | AcknowledgedCallView

export interface AcquireCallInput {
  readonly ref: CallKey
  readonly mode: 'read' | 'wait'
  readonly observer?: ModelObserverRequest
}

export type AcquireCallResult =
  | {
      readonly view: RetainedCallReadView
      readonly consumer?: CallConsumer
    }
  | {
      readonly view: AcknowledgedCallView
      readonly consumer?: never
    }
  | ServiceInvalidInput
  | ServiceUnavailable
  | ServiceCallNotFound
  | ServiceRuntimeStopped

export interface CallConsumer {
  readonly wait: (input: { readonly signal?: AbortSignal }) => Promise<CallWaitResult>
  readonly release: () => void
  readonly stopped: Promise<void>
}

export type CallWaitResult =
  | {
      readonly view: CallReadView
    }
  | {
      readonly released: true
    }
  | {
      readonly aborted: true
    }
  | ServiceUnavailable
  | {
      readonly rejected: {
        readonly reason: 'buffer_full' | 'consumer_failed'
      }
    }

export type SelectionInvalidInput = {
  readonly invalidInput: {
    readonly reason: ModelProfileRejection
  }
}

export type SelectionUnavailable = {
  readonly unavailable: true
}

export type SelectionFailure = SelectionInvalidInput | SelectionUnavailable

export type ModelDisplayAnnotation =
  | 'legal'
  | 'withdrawn'
  | 'scope_disallowed'
  | 'modality_mismatch'
  | 'credential_missing'
  | {
      readonly overridden_by: {
        readonly scope: CatalogScope
      }
    }

export interface ModelDisplayCoveredRow {
  readonly ref: ModelProfileRef
  readonly annotations: readonly ModelDisplayAnnotation[]
}

export interface ModelDisplayEntry {
  readonly routeName: RouteName
  readonly ref: ModelProfileRef
  readonly annotations: readonly ModelDisplayAnnotation[]
  readonly covered: readonly ModelDisplayCoveredRow[]
  readonly selected: boolean
}

export interface EffectiveModel {
  readonly routeName: RouteName
  readonly profile: ModelProfileRef
  readonly selectedBy: 'session' | 'layer_lock'
  readonly selected: RouteName
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
  ? {
      readonly invalidInput: Omit<T, 'rejected'>
    }
  : never

export type ServiceInvalidInput =
  | {
      readonly invalidInput: {
        readonly reason: PlainInvalidReason
      }
    }
  | WrapInputLimitRejection<InputLimitRejection>

export type ServiceUnavailable = {
  readonly unavailable: true
}

export type ServiceCallNotFound = {
  readonly callNotFound: true
}

export type ServiceAlreadyEnded = {
  readonly alreadyEnded: true
}

export type ServiceWrongPhase = {
  readonly wrongPhase: {
    readonly phase: DispatchGuardPhase
  }
}

export type ServiceRuntimeStopped = {
  readonly runtimeStopped: true
}

export type ServiceRetryRefused = {
  readonly retryRefused: {
    readonly why: 'already_spoke' | 'fact_class' | 'provider_not_allowed'
  }
}

export type ServiceAlreadySpoke = {
  readonly retryRefused: {
    readonly why: 'already_spoke'
  }
}

export type ServiceProfileNotFound = {
  readonly profileNotFound: true
}

export type ServiceNotLegalTarget = Extract<
  SessionSelectModelResult,
  {
    readonly notLegalTarget: object
  }
>

export type ServiceLegalTargetsResult =
  | {
      readonly legalTargets: readonly RouteName[]
    }
  | ServiceInvalidInput
  | ServiceUnavailable

export type ServiceDisplayListResult =
  | {
      readonly displayList: readonly ModelDisplayEntry[]
    }
  | ServiceInvalidInput
  | ServiceUnavailable
  | ServiceProfileNotFound

export type ServiceEffectiveModelResult =
  | {
      readonly effectiveModel: EffectiveModel
    }
  | ServiceInvalidInput
  | ServiceProfileNotFound
  | ServiceUnavailable

export type ServiceSelectModelResult =
  | {
      readonly selected: RouteName
    }
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
  | {
      readonly run?: never
      readonly attempt?: never
      readonly report?: never
    }

/** The original call's actual lifetime owner, independent of session identity. */
export interface ModelCallHost {
  readonly signal: AbortSignal
  readonly stopping: () => boolean
  readonly register: (close: () => Promise<RuntimeCloseResult>) =>
    | {
        readonly registration: {
          readonly unregister: () => void
        }
      }
    | ServiceRuntimeStopped
    | ServiceUnavailable
}

export type ModelArrivalTarget = Extract<
  ArrivalTarget,
  {
    readonly kind: 'model_call'
  }
>

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
  | {
      readonly creationConflict: true
    }
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
      readonly settled: ModelResponse & {
        readonly outcome: 'failed'
      }
      readonly failureSubject: AfterModelCallFailureSubject
    }
  | {
      readonly settled: ModelResponse & {
        readonly outcome: 'interrupted'
        readonly reply?: never
      }
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
      readonly released: {
        readonly cause: 'credential_unavailable'
      }
    }

export type DispatchInput = CallKey & {
  readonly attempt?: AttemptId
}

export type DispatchResult =
  | DispatchSuccess
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceAlreadySpoke
  | ServiceWrongPhase
  | ServiceRuntimeStopped
  | ServiceUnavailable

export type DispatchAgainInput = DispatchInput & {
  readonly plan: RetryPlan
}

export type DispatchAgainResult =
  | DispatchSuccess
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceRetryRefused
  | ServiceWrongPhase
  | ServiceRuntimeStopped
  | ServiceUnavailable

export type InterruptInput = CallKey & {
  readonly initiator: 'user' | 'run_cancelled'
}

export type InterruptResult =
  | {
      readonly stage: 'before_dispatch' | 'in_flight' | 'speaking'
    }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceUnavailable

export type ReleaseCallResult =
  | {
      readonly callId: ModelCallId
      readonly state: 'handed_up'
    }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceWrongPhase
  | ServiceUnavailable

export type ReconcileInput = {
  readonly session: SessionRef
  readonly attempt?: AttemptId
}

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
  | {
      readonly calls: readonly ReconciledCall[]
    }
  | ServiceInvalidInput
  | ServiceUnavailable

/**
 * RT12 S-34⑤/S-86: one dispatch as readAttempts returns it. A confirmed ready without a final
 * carries its complete original result with disposition_pending; a final stays in `response`.
 */
export type ReadAttemptDispatch = CallHistoryDispatch & {
  readonly result?: Extract<
    CallResultFact,
    {
      readonly disposition: 'disposition_pending'
    }
  >
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
    | {
        readonly authoritativeSubject: AfterModelCallFailureSubject
      }
    | {
        readonly invalidInput: true
      }
    | {
        readonly unavailable: true
      }
  readonly release: () => void
}

export type FailureConsumption<R> = {
  readonly result: R
  readonly consumption:
    | {
        readonly kind: 'failure'
        readonly source: ModelFailureSource
      }
    | {
        readonly kind: 'notApplicable'
      }
}

export interface FailureConsumableOperation<I, R> {
  (input: I): Promise<R>
  (
    input: I,
    options: {
      readonly consumeFailure: true
    },
  ): Promise<FailureConsumption<R>>
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
  | {
      readonly callId: ModelCallId
      readonly state: 'complete' | 'interrupted'
    }
  | ServiceInvalidInput
  | ServiceCallNotFound
  | ServiceAlreadyEnded
  | ServiceWrongPhase
  | ServiceUnavailable

export type CanDispatchAgainInput = CallKey & {
  readonly plan: RetryPlan
}

export type CanDispatchAgainResult =
  | {
      readonly allowed: true
    }
  | {
      readonly refused: ServiceRetryRefused['retryRefused']
    }
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
  | {
      readonly acknowledged: CallAcknowledgement
    }
  | ServiceInvalidInput
  | ServiceUnavailable
  | ServiceCallNotFound
  | ServiceWrongPhase

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

export type RuntimeCloseResult =
  | {
      readonly released: true
    }
  | {
      readonly unavailable: true
    }

export type SessionSelectModelResult =
  | {
      readonly selected: RouteName
    }
  | SelectionFailure
  | {
      readonly profileNotFound: true
    }
  | {
      readonly notLegalTarget: {
        readonly because: readonly ['withdrawn' | 'scope_disallowed' | 'modality_mismatch']
      }
    }
