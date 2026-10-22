import type { ScopeRef, ContextBlockKey, ConsumerClass } from './shared.js'
import type { BlockDescriptorBase } from './descriptor.js'
import type { RegistrationRevision, ViewRevision, BlockRevision, Generation } from './shared.js'

/** Belongs to one bound reader; opaque to the caller. Whether it is still usable is decided by the mechanism (RC-04). */
export type Cursor = Readonly<{ cursor: string }>

/** Why a read is refused (RC-03 读取结果 表「拒绝」行). No unauthorized content, no source internals. */
export type ReadRefusalReason = 'unauthorized' | 'no-registration' | 'closed'
/** Why a required value is missing (「缺项」行). */
export type MissingCause =
  | 'no-value'
  | 'source-unavailable'
  | 'producer-withdrawn'
  | 'translation-failed'
  | 'uninterpretable'
/** Why the outcome is unknown (「未知」行). */
export type UnknownCause = 'source-unknown' | 'eligibility-unknown' | 'commit-unknown'

export type MissingItem = Readonly<{
  key: ContextBlockKey
  cause: MissingCause
  revision: BlockRevision | null
}>

/** Both revisions travel when the eligibility's revision lags the current one (RC-03 成功行). */
export type RevisionPair = Readonly<{ issued: RegistrationRevision; current: RegistrationRevision }>

export type ReadOutcome<T> =
  | Readonly<{ kind: 'success'; value: T; registration: RevisionPair }>
  | Readonly<{ kind: 'refused'; reason: ReadRefusalReason }>
  | Readonly<{ kind: 'missing'; items: readonly MissingItem[] }>
  | Readonly<{ kind: 'unknown'; cause: UnknownCause }>

/** Where a value came from: the key, its revision, the scope it was found in after shadowing, and the producer generation. */
export type SourceEvidence = Readonly<{
  key: ContextBlockKey
  revision: BlockRevision
  scope: ScopeRef
  generation: Generation | null
}>

export type NeedValue<T = unknown> =
  | Readonly<{ kind: 'value'; need: string; value: T; evidence: SourceEvidence }>
  /** An optional need without a current value. Not a failure (RC-03). */
  | Readonly<{ kind: 'none'; need: string }>

export type NeedRequest = Readonly<{ need: string; key: ContextBlockKey }>
export type ReadResult = ReadOutcome<readonly NeedValue[]>

export type BlockState<V = unknown> =
  | Readonly<{ kind: 'value'; value: V }>
  /** Invalidated or never supplied; an optional block reads as none (RC-07). */
  | Readonly<{ kind: 'none' }>

export type BlockEntry = Readonly<{
  key: ContextBlockKey
  revision: BlockRevision
  state: BlockState
  evidence: SourceEvidence
  /** Copied from the descriptor so the holder can place the block without the catalog (RQ-02 块带变化频率). */
  volatility: BlockDescriptorBase<ContextBlockKey, unknown>['volatility']
}>

/** The current value of one per-request block, fetched from the producer at read time (RC-04). */
export type PerRequestEntry = Readonly<{ key: ContextBlockKey }> &
  (
    | Readonly<{ kind: 'value'; value: unknown; evidence: SourceEvidence }>
    | Readonly<{ kind: 'none' }>
    | Readonly<{ kind: 'missing'; cause: MissingCause }>
    | Readonly<{ kind: 'unknown'; cause: UnknownCause }>
  )

export type Snapshot = Readonly<{
  scope: ScopeRef
  viewRevision: ViewRevision
  cursor: Cursor
  /** Stable and per-step blocks the reader may read and that have a value or read as none. */
  blocks: readonly BlockEntry[]
  /** Required blocks without a current value (F-RC03 「快照列出缺的是哪一块」). */
  missing: readonly MissingItem[]
  /** Per-request blocks, not part of the snapshot proper nor of the observation chain (RC-04). */
  perRequest: readonly PerRequestEntry[]
}>

export type ChangeEntry = Readonly<{
  key: ContextBlockKey
  revision: BlockRevision
  state: BlockState
  evidence: SourceEvidence
}>

export type Changes = Readonly<{
  scope: ScopeRef
  from: ViewRevision
  to: ViewRevision
  cursor: Cursor
  entries: readonly ChangeEntry[]
  /** New required-missing blocks since the cursor, so the holder can fold them into its kept snapshot. */
  missing: readonly MissingItem[]
  perRequest: readonly PerRequestEntry[]
}>

export type SnapshotResult = ReadOutcome<Snapshot>
/** `changes` has one more row than the read table (RC-04). Not a failure; the reader takes a full snapshot. */
export type CursorInvalidated = Readonly<{ kind: 'cursor-invalidated' }>
export type ChangesResult = ReadOutcome<Changes> | CursorInvalidated

export interface ContextReader {
  /** Fixed at bind time; the user cannot change it (RC-03). */
  readonly consumer: ConsumerClass
  readonly scope: ScopeRef
  snapshot(): Promise<SnapshotResult>
  changes(cursor: Cursor): Promise<ChangesResult>
  read(needs: readonly NeedRequest[]): Promise<ReadResult>
  /** Ends the reader: waits and resources end; nothing outside is undone (RC-07). Idempotent. */
  end(): Promise<void>
}

export type PreviousValue =
  | Readonly<{ kind: 'value'; value: unknown }>
  /** The descriptor forbids a previous value, the holder has no prior snapshot, or the reader may no longer read it (RC-04). */
  | Readonly<{ kind: 'withheld' }>

export type ChangeMaterial = Readonly<{
  key: ContextBlockKey
  /** Null when the block was not in the previous snapshot. */
  from: BlockRevision | null
  to: BlockRevision
  previous: PreviousValue
}>
