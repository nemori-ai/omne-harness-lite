import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  CallKey,
  CreationKey,
  ModelCallAcknowledgedRecord,
  ModelCallCreatedPayload,
  ModelCallPayloadRef,
} from '@omne-harness-lite/messages'
import type {
  ModelResponse,
  PendingModelResponse,
  ReplyDisposition,
  ResponseId,
  Route,
  Timing,
} from '@omne-harness-lite/model-response'
import type { SettlementLogBinding } from './settlement-types.ts'
import type { ModelLogSettlementTarget } from './log-codec.ts'
import type {
  ModelObserverRequest,
  RuntimeCloseResult,
  ServiceCallNotFound,
  ServiceInvalidInput,
  ServiceRuntimeStopped,
  ServiceUnavailable,
} from './service-types.ts'

export type { CallKey, CreationKey, ModelCallPayloadRef, ModelCallCreatedPayload }
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
  | { readonly disposition: 'disposition_pending'; readonly pending: PendingModelResponse }
  | { readonly disposition: 'final'; readonly response: ModelResponse }
export type CallPresenceFact = {
  readonly source: CallSource
  /** Exact original execution registration; absence is not proof of stopping. */
  readonly executionGeneration: object | null
  readonly sourceVersion: string
} & (
  | { readonly kind: 'live' }
  | {
      readonly kind: 'stopped'
      readonly target: ModelLogSettlementTarget | null
      readonly unknownBatches: readonly string[]
    }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'notFound' }
)
/** A view of a call whose model-side copy is still retained (no legal acknowledgement yet). */
export interface RetainedCallReadView {
  readonly ref: CallKey
  readonly origin: CallOrigin
  readonly state: CallLifecycleState
  readonly source: CallSource
  readonly presence: Exclude<CallPresenceFact, { readonly kind: 'notFound' }>
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
  | { readonly cleanup: 'released'; readonly pendingReasons?: never }
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
  | { readonly outcome: 'complete' | 'truncated' | 'failed'; readonly initiator?: never }
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
  | { readonly view: RetainedCallReadView; readonly consumer?: CallConsumer }
  | { readonly view: AcknowledgedCallView; readonly consumer?: never }
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
  | { readonly view: CallReadView }
  | { readonly released: true }
  | { readonly aborted: true }
  | ServiceUnavailable
  | { readonly rejected: { readonly reason: 'buffer_full' | 'consumer_failed' } }

/** `ack` (RT12 S-95) is granted only by current succession, never by read/wait or a held ref. */
export type CallAccessAction = 'read' | 'wait' | 'settle' | 'cancel' | 'ack'
export interface CallAccessInput {
  readonly binding: SettlementLogBinding
  readonly ref: CallKey
  readonly action: CallAccessAction
  /** Only trusted content lookup supplies original association; caller identity is captured. */
  readonly origin?: CallOrigin
}
export interface CallAccessEvidence {
  readonly action: CallAccessAction
  readonly ref: CallKey
  readonly source: CallSource
  readonly sourceVersion: string
  /** Immediate resource invalidation only; never a cached authorization grant. */
  readonly revoked: AbortSignal
}
export type CallAccessResult<T> =
  | { readonly allowed: T; readonly evidence: CallAccessEvidence }
  | { readonly denied: true; readonly evidence: CallAccessEvidence }
  | ServiceInvalidInput
  | ServiceUnavailable
/** S-87/S-93: each callback is an admission point, held against revocation until actual drain. */
export interface CallAccess {
  readonly check: <T>(
    input: CallAccessInput,
    admitted: (evidence: CallAccessEvidence) => Promise<T>,
  ) => Promise<CallAccessResult<T>>
}
export interface CallPresenceInput {
  readonly ref: CallKey
  readonly origin: CallOrigin
  readonly source: CallSource
  readonly executionGeneration: object | null
}
/** The trusted host keeps live attachment and exact-generation ending in one critical section. */
export interface CallPresence {
  readonly read: <T>(
    input: CallPresenceInput,
    observed: (fact: CallPresenceFact) => Promise<T>,
  ) => Promise<{ readonly read: T } | ServiceInvalidInput | ServiceUnavailable>
}
export type ModelCallContentValue =
  | { readonly kind: 'created'; readonly value: ModelCallCreatedPayload }
  | { readonly kind: 'reply_ready'; readonly value: PendingModelResponse }
export interface ModelCallContentStore {
  /** Confirm immutable original bytes before issuing the reference. ACK successor pending. */
  readonly put: (input: {
    readonly binding: SettlementLogBinding
    readonly locator: string
    readonly version: string
    readonly content: ModelCallContentValue
  }) => Promise<{ readonly ref: ModelCallPayloadRef } | ServiceInvalidInput | ServiceUnavailable>
  readonly read: (input: {
    readonly binding: SettlementLogBinding
    readonly ref: ModelCallPayloadRef
  }) => Promise<
    { readonly content: ModelCallContentValue } | ServiceInvalidInput | ServiceUnavailable
  >
  readonly close: () => Promise<RuntimeCloseResult>
}
/** This node implements the port from its immutable Storage rows and authoritative SL3 keys. */
export interface CallFacts {
  readonly content: ModelCallContentStore
  readonly lookup: (input: {
    readonly binding: SettlementLogBinding
    readonly ref: CallKey
  }) => Promise<{ readonly view: CallReadView } | ServiceCallNotFound | ServiceUnavailable>
  readonly creation: (input: {
    readonly binding: SettlementLogBinding
    readonly creationKey: CreationKey
  }) => Promise<
    | {
        readonly payload: ModelCallCreatedPayload
        readonly view: RetainedCallReadView
      }
    /** RT12 S-101: after release, same-key recognition uses the ACK's creation digest. */
    | {
        readonly acknowledged: ModelCallAcknowledgedRecord
        readonly view: AcknowledgedCallView
      }
    | ServiceCallNotFound
    | ServiceUnavailable
  >
  /** Incremental chase/rebuild is explicit; normal lookup never scans the whole log. */
  readonly refresh: (
    binding: SettlementLogBinding,
  ) => Promise<{ readonly current: true } | ServiceUnavailable>
  readonly close: () => Promise<RuntimeCloseResult>
}
