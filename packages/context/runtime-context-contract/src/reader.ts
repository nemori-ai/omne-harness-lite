import type { ScopeRef, ContextBlockKey, ConsumerClass } from './shared.js'
import type { BlockDescriptorBase } from './descriptor.js'
import type { RegistrationRevision, ViewRevision, BlockRevision, Generation } from './shared.js'

export type Cursor = Readonly<{ cursor: string }>

export type ReadRefusalReason =
  | 'unauthorized'
  | 'no-registration'
  | 'closed'
  | 'scope-ended'
  | 'replay-incomplete'
export type MissingCause =
  | 'no-value'
  | 'source-unavailable'
  | 'producer-withdrawn'
  | 'translation-failed'
  | 'uninterpretable'
export type UnknownCause =
  | 'source-unknown'
  | 'eligibility-unknown'
  | 'commit-unknown'
  | 'scope-binding-unknown'
  | 'replay-unknown'

export type MissingItem = Readonly<{
  key: ContextBlockKey
  cause: MissingCause
  revision: BlockRevision | null
}>

export type RevisionPair = Readonly<{ issued: RegistrationRevision; current: RegistrationRevision }>

export type ReadOutcome<T> =
  | Readonly<{ kind: 'success'; value: T; registration: RevisionPair }>
  | Readonly<{ kind: 'refused'; reason: ReadRefusalReason }>
  | Readonly<{ kind: 'missing'; items: readonly MissingItem[] }>
  | Readonly<{ kind: 'unknown'; cause: UnknownCause }>

export type SourceEvidence = Readonly<{
  key: ContextBlockKey
  revision: BlockRevision
  scope: ScopeRef
  generation: Generation | null
}>

export type NeedValue<T = unknown> =
  | Readonly<{ kind: 'value'; need: string; value: T; evidence: SourceEvidence }>
  | Readonly<{ kind: 'none'; need: string }>

export type NeedRequest = Readonly<{ need: string; key: ContextBlockKey }>
export type ReadResult = ReadOutcome<readonly NeedValue[]>

export type BlockState<V = unknown> =
  | Readonly<{ kind: 'value'; value: V }>
  | Readonly<{ kind: 'none' }>

export type BlockEntry = Readonly<{
  key: ContextBlockKey
  revision: BlockRevision
  state: BlockState
  evidence: SourceEvidence
  volatility: BlockDescriptorBase<ContextBlockKey, unknown>['volatility']
}>

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
  blocks: readonly BlockEntry[]
  missing: readonly MissingItem[]
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
  missing: readonly MissingItem[]
  perRequest: readonly PerRequestEntry[]
}>

export type SnapshotResult = ReadOutcome<Snapshot>
export type CursorInvalidated = Readonly<{ kind: 'cursor-invalidated' }>
export type ChangesResult = ReadOutcome<Changes> | CursorInvalidated

export interface ContextReader {
  readonly consumer: ConsumerClass
  readonly scope: ScopeRef
  snapshot(): Promise<SnapshotResult>
  changes(cursor: Cursor): Promise<ChangesResult>
  read(needs: readonly NeedRequest[]): Promise<ReadResult>
  end(): Promise<void>
}

export type PreviousValue =
  | Readonly<{ kind: 'value'; value: unknown }>
  | Readonly<{ kind: 'withheld' }>

export type ChangeMaterial = Readonly<{
  key: ContextBlockKey
  from: BlockRevision | null
  to: BlockRevision
  previous: PreviousValue
}>
