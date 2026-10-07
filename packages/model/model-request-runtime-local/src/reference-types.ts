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
import type { PendingModelResponse, ResponseId } from '@omne-harness-lite/model-response'
import type { SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import type { SettlementStagedBatch } from './settlement-types.ts'

import type {
  RuntimeCloseResult,
  ServiceCallNotFound,
  ServiceInvalidInput,
  ServiceUnavailable,
} from '@omne-harness-lite/model-request-runtime'

export type ModelCallContentValue =
  | { readonly kind: 'created'; readonly value: ModelCallCreatedPayload }
  | { readonly kind: 'reply_ready'; readonly value: PendingModelResponse }

/**
 * RT12 S-98: a committed publish permit on the call's retention row. The publisher releases it
 * only after its marker outcome is known and its append task actually stopped.
 */
export interface ModelCallPublishPermit {
  readonly release: () => Promise<RuntimeCloseResult>
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

/** RT12 S-99⑧: one post-ACK settlement's write responsibility for one ResponseId. */
export type ModelCallSettlementWorkKey = ModelCallRetentionKey & {
  readonly response: ResponseId
}

/**
 * The durable staging row of one started post-ACK settlement: the complete batch of the latest
 * append not yet known to have written nothing, with its identity. `workId` names one write
 * responsibility; `generation` counts its durable replacements. Every change is conditioned on
 * both, so a late worker of another work or an older generation is refused.
 */
export interface ModelCallSettlementWork {
  readonly workId: string
  readonly generation: number
  /** The runtime instance that started the work; another instance needs recovery evidence. */
  readonly owner: string
  readonly staged: SettlementStagedBatch
}

export interface ModelCallSettlementWorkStore {
  /** Insert a new work row; an existing row of any work is returned, never replaced. */
  readonly stage: (
    input: ModelCallSettlementWorkKey & {
      readonly workId: string
      readonly owner: string
      readonly staged: SettlementStagedBatch
    },
  ) => Promise<
    | { readonly staged: { readonly generation: number } }
    | { readonly occupied: ModelCallSettlementWork }
    | ServiceUnavailable
  >
  /** Replace the held batch of this exact work and generation after a proven zero write. */
  readonly replace: (
    input: ModelCallSettlementWorkKey & {
      readonly workId: string
      readonly generation: number
      readonly staged: SettlementStagedBatch
    },
  ) => Promise<
    | { readonly staged: { readonly generation: number } }
    | { readonly rejected: true }
    | ServiceUnavailable
  >
  readonly read: (
    key: ModelCallSettlementWorkKey,
  ) => Promise<
    { readonly work: ModelCallSettlementWork } | { readonly absent: true } | ServiceUnavailable
  >
  /**
   * Delete this exact work and generation. `rejected` means the row now belongs to another
   * work or generation and was left untouched. An unknown commit is recognized only by reading
   * the row as absent; the row still present or an unreadable row stays pending.
   */
  readonly remove: (
    key: ModelCallSettlementWorkKey & { readonly workId: string; readonly generation: number },
  ) => Promise<
    | { readonly removed: true }
    | { readonly rejected: true }
    | { readonly pending: 'storage_unavailable' | 'receipt_unknown' }
  >
}

export interface ModelCallContentStore {
  /**
   * Confirm immutable original bytes before issuing the reference. Content, the call's
   * retention row and a publish permit commit together; a non-retained call admits no writer.
   */
  readonly put: (input: {
    readonly binding: SettlementLogBinding
    readonly locator: string
    readonly version: string
    readonly content: ModelCallContentValue
  }) => Promise<
    | { readonly ref: ModelCallPayloadRef; readonly permit: ModelCallPublishPermit }
    | ServiceInvalidInput
    | ServiceUnavailable
  >
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
