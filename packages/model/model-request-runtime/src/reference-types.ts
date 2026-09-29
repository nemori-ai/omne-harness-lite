import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  CallKey,
  CreationKey,
  ModelCallCreatedPayload,
  ModelCallPayloadRef,
} from '@omne-harness-lite/messages'
import type { ModelResponse, PendingModelResponse } from '@omne-harness-lite/model-response'
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
export interface CallReadView {
  readonly ref: CallKey
  readonly origin: CallOrigin
  readonly state: CallLifecycleState
  readonly source: CallSource
  readonly presence: Exclude<CallPresenceFact, { readonly kind: 'notFound' }>
  readonly result?: CallResultFact
}
export interface AcquireCallInput {
  readonly ref: CallKey
  readonly mode: 'read' | 'wait'
  readonly observer?: ModelObserverRequest
}
export type AcquireCallResult =
  | { readonly view: CallReadView; readonly consumer?: CallConsumer }
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

export type CallAccessAction = 'read' | 'wait' | 'settle' | 'cancel'
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
}
export type CallAccessResult<T> =
  | { readonly allowed: T; readonly evidence: CallAccessEvidence }
  | { readonly denied: true; readonly evidence: CallAccessEvidence }
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
  /** Confirm immutable original bytes before issuing the reference; no delete/GC operation. */
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
        readonly view: CallReadView
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
