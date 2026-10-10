import type {
  RetainedCallReadView,
  AcknowledgedCallFacts,
  ModelCallCleanupResult,
} from '@omne-harness-lite/model-request-runtime'

import type {
  CallKey,
  CreationKey,
  ModelCallAcknowledgedRecord,
  ModelCallCreatedPayload,
  ModelCallPayloadRef,
} from '@omne-harness-lite/messages'
import type { ResponseId } from '@omne-harness-lite/model-response'
import type { SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import type { ModelCallSettlementWorkStore } from '@omne-harness-lite/model-request-runtime'
export type {
  ModelCallSettlementWorkKey,
  ModelCallSettlementWork,
  ModelCallSettlementWorkStore,
} from '@omne-harness-lite/model-request-runtime'

import type {
  RuntimeCloseResult,
  ServiceCallNotFound,
  ServiceInvalidInput,
  ServiceUnavailable,
} from '@omne-harness-lite/model-request-runtime'

import type {
  ModelCallContentValue,
  ModelCallContentWriter,
} from '@omne-harness-lite/model-request-runtime'
export type {
  ModelCallContentValue,
  ModelCallPublishPermit,
} from '@omne-harness-lite/model-request-runtime'

/** Durable custody of exact external bytes, including a later cold recovery.
 * Confirmation must cover every locator in the supplied original content.
 * Custody lasts at least as long as that call's retained payloads. A provider may
 * retain bytes longer under its own lifetime. This store does not delete them.
 */
export interface ModelCallExternalContentCustody {
  readonly confirm: (input: {
    readonly binding: SettlementLogBinding
    readonly content: ModelCallContentValue
  }) => Promise<{ readonly retained: true } | ServiceUnavailable>
}

/** RT12 S-98 custody phase of one CallKey; not an execution state. */
export type ModelCallRetentionPhase = 'retained' | 'retiring' | 'acknowledged' | 'released'

export type ModelCallRetentionKey = {
  readonly binding: SettlementLogBinding
  readonly call: CallKey['callId']
}

/** Pure, synchronous ACK batch builder run over contents read under the retention lock. */
export type ModelCallAcknowledgementBuilder = (
  contents: readonly ModelCallContentValue[],
) => { readonly record: ModelCallAcknowledgedRecord } | ServiceInvalidInput | ServiceUnavailable

export interface ModelCallContentStore extends ModelCallContentWriter {
  /** The phase check and the byte copy share one snapshot: only a retained call is read. */
  readonly read: (
    input: ModelCallRetentionKey & { readonly ref: ModelCallPayloadRef },
  ) => Promise<
    { readonly content: ModelCallContentValue } | ServiceInvalidInput | ServiceUnavailable
  >
  /**
   * RT12 S-96④: under the retention lock, read the exact original contents, build the one
   * ACK batch and close new reads/publications (retiring). A retiring or later row returns its
   * fixed original batch unchanged; it is never rebuilt.
   */
  readonly prepareAcknowledgement: (
    input: ModelCallRetentionKey & {
      readonly payloads: readonly ModelCallPayloadRef[]
      readonly build: ModelCallAcknowledgementBuilder
    },
  ) => Promise<
    | {
        readonly record: ModelCallAcknowledgedRecord
        readonly phase: Exclude<ModelCallRetentionPhase, 'retained'>
      }
    | ServiceInvalidInput
    | ServiceUnavailable
  >
  /**
   * RT12 S-96: the only retreat of a preparation. The caller proved that this exact fixed batch
   * wrote nothing, that its writers stopped and that the explicit policy ends; the row returns
   * to retained and the original contents stay. A confirmed or different batch never retreats.
   */
  readonly withdrawAcknowledgement: (
    input: ModelCallRetentionKey & { readonly record: ModelCallAcknowledgedRecord },
  ) => Promise<{ readonly phase: 'retained' } | ServiceInvalidInput | ServiceUnavailable>
  /**
   * Record that the log confirmed this exact batch; never retreats from a later phase. A record
   * this store never fixed is first checked against the still retained originals (exact bytes,
   * creation and retained-result digests); a contradiction is reported and nothing changes.
   */
  readonly confirmAcknowledgement: (
    input: ModelCallRetentionKey & { readonly record: ModelCallAcknowledgedRecord },
  ) => Promise<
    | { readonly phase: 'acknowledged' | 'released' }
    | { readonly contradicted: true }
    | ServiceInvalidInput
    | ServiceUnavailable
  >
  /**
   * RT12 S-98: in one transaction, recheck confirmation and drained publishers, delete exactly
   * the releasable contents of this call and mark released. Obstacles are reported, not waited.
   */
  readonly releaseAcknowledged: (input: ModelCallRetentionKey) => Promise<ModelCallCleanupResult>
  /** Current durable custody progress; storage failure is reported by the caller as pending. */
  readonly retention: (
    input: ModelCallRetentionKey,
  ) => Promise<
    | { readonly phase: ModelCallRetentionPhase | null; readonly publishers: number }
    | ServiceUnavailable
  >
  /** RT12 S-99⑧ staging rows in the same Storage; not a content or result-retrieval surface. */
  readonly work: ModelCallSettlementWorkStore
  readonly close: () => Promise<RuntimeCloseResult>
}

/** This node implements the port from its immutable Storage rows and authoritative SL3 keys. */
export interface CallFacts {
  readonly content: ModelCallContentStore
  /** An acknowledged call yields its durable S-97 facts; the runtime adds cleanup progress. */
  readonly lookup: (input: {
    readonly binding: SettlementLogBinding
    readonly ref: CallKey
  }) => Promise<
    | { readonly view: RetainedCallReadView }
    | { readonly acknowledged: AcknowledgedCallFacts }
    | ServiceCallNotFound
    | ServiceUnavailable
  >
  readonly creation: (input: {
    readonly binding: SettlementLogBinding
    readonly creationKey: CreationKey
  }) => Promise<
    | {
        readonly payload: ModelCallCreatedPayload
        readonly view: RetainedCallReadView
      }
    /** RT12 S-101: after ACK, same-key recognition uses the ACK's creation digest. */
    | { readonly acknowledged: AcknowledgedCallFacts }
    | ServiceCallNotFound
    | ServiceUnavailable
  >
  /** Incremental chase/rebuild is explicit; normal lookup never scans the whole log. */
  readonly refresh: (
    binding: SettlementLogBinding,
  ) => Promise<{ readonly current: true } | ServiceUnavailable>
  readonly close: () => Promise<RuntimeCloseResult>
}

/** Borrowed readers of the same physical content/index; no independent close owner. */
export type CallFactsView = Omit<CallFacts, 'close'>
