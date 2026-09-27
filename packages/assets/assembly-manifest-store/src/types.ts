import type { AssetCategory, CapabilityId } from '@omne-harness-lite/asset-model'
import type { EffectiveAssembly } from '@omne-harness-lite/asset-evaluation'
import type { JsonNumber, JsonValue } from '@omne-harness-lite/content-blocks'
import type { OpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { Instant } from '@omne-harness-lite/offer-expiry'

export type EvaluationRef = OpaqueIdentifier<'EvaluationRef'>
export type ManifestSessionRef = OpaqueIdentifier<'SessionRef'>
export type EvaluationIdentity =
  { readonly kind: 'given' | 'reuse'; readonly ref: EvaluationRef } | { readonly kind: 'mint' }
export interface ManifestTable {
  readonly filledAt: Instant
  readonly composition: JsonValue
}
export interface ManifestAppendInput {
  readonly evaluation: EvaluationIdentity
  readonly tables: Readonly<Partial<Record<AssetCategory, ManifestTable>>>
  readonly content: JsonValue
}
export interface ManifestRecord extends ManifestAppendInput {
  readonly session: ManifestSessionRef
  readonly seq: number
  readonly evaluationRef: EvaluationRef
}
export type ReadFailure = { readonly failure: 'invalidInput' | 'unavailable' }
export type AppendDecision =
  | { readonly failure: 'alreadyRecorded'; readonly record: ManifestRecord }
  | { readonly failure: 'evaluationRefConflict' | 'recordNotFound' }
  | { readonly failure: 'headMismatch'; readonly head: number }
  | { readonly failure: 'filledAtNotIncreasing'; readonly categories: readonly AssetCategory[] }
export interface AppendFacts {
  readonly session: ManifestSessionRef
  readonly head: number
  readonly owner?: ManifestRecord
  readonly filledAt: Readonly<Partial<Record<AssetCategory, Instant>>>
}
export type AppendResult =
  | ReadFailure
  | AppendDecision
  | { readonly seq: number; readonly head: number; readonly evaluationRef: EvaluationRef }
export type Presence = 'present' | 'absent'
export interface PresenceSource {
  /** All requested facts belong to one observation; unknown facts must stay absent from this map. */
  read(
    session: ManifestSessionRef,
    names: readonly string[],
  ): Promise<Readonly<Record<string, Presence>> | { readonly failure: 'unavailable' }>
}
export interface ManifestDiagnostic {
  readonly kind: 'assembly_manifest'
  readonly operation:
    'readHead' | 'append' | 'readHistory' | 'dependencyPresence' | 'readEvaluation' | 'readGiven'
  readonly providerRevision: 'MF4'
  readonly session: string
  readonly result: string
  readonly head?: number
  readonly evaluationRef?: EvaluationRef
  /** Emits only after storage has actually returned or thrown. */
  readonly resourceEnded: true
  readonly stage?:
    | 'capacity'
    | 'head_range'
    | 'source'
    | 'decode'
    | 'projection'
    | 'parent_conflict'
    | 'table_failure'
  readonly requestedHead?: number
  readonly requestedHeadOmitted?: true
  readonly selectedSeq?: number
}
export interface ManifestOptions {
  readonly presenceSource?: PresenceSource
  /** Ports own bounded output/retention. This provider never forwards payloads or error messages. */
  readonly diagnostic?: (event: ManifestDiagnostic) => void
  readonly diagnosticFailure?: (fact: { readonly kind: 'manifest_diagnostic_unavailable' }) => void
}
export interface EvaluationProjection {
  readonly evaluation: EffectiveAssembly
  readonly compositionOrder: readonly CapabilityId[]
}
export type EvaluationReadResult =
  | ReadFailure
  | { readonly failure: 'recordNotFound' }
  | { readonly failure: 'unavailable'; readonly reason: 'invalid_evaluation_content' }
  | (EvaluationProjection & { readonly evaluationRef: EvaluationRef })
export type GivenReadResult =
  | ReadFailure
  | { readonly none: true }
  | { readonly record: ManifestRecord }
  | { readonly failure: 'unavailable'; readonly reason: 'invalid_evaluation_content' }
export interface AssemblyManifestService {
  readHead(session: unknown): Promise<
    | ReadFailure
    | {
        readonly head: number
        readonly latest: Readonly<Partial<Record<AssetCategory, ManifestRecord>>>
      }
  >
  append(session: unknown, expectedHead: unknown, record: unknown): Promise<AppendResult>
  readHistory(
    session: unknown,
    category: unknown,
    filledAt: unknown,
  ): Promise<
    ReadFailure | { readonly failure: 'recordNotFound' } | { readonly record: ManifestRecord }
  >
  dependencyPresence(
    session: unknown,
    names: unknown,
  ): Promise<ReadFailure | { readonly presence: Readonly<Record<string, Presence>> }>
  readEvaluation(session: unknown): Promise<EvaluationReadResult>
  readGiven(session: unknown, head: unknown): Promise<GivenReadResult>
}
export interface AssemblyManifestStore extends AssemblyManifestService {
  close(): Promise<void>
}
export interface CheckedAppend {
  readonly session: ManifestSessionRef
  readonly expectedHead: JsonNumber
  readonly record: ManifestAppendInput
}
export interface ManifestDb {
  assembly_manifest_record: {
    session: string
    seq: number
    evaluation_kind: 'given' | 'mint' | 'reuse'
    evaluation_ref: string
    owned_ref: string | null
    content: string
  }
  assembly_manifest_table: {
    session: string
    seq: number
    category: string
    filled_at: number
    composition: string
  }
}
