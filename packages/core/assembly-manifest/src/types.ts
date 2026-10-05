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
export interface CheckedAppend {
  readonly session: ManifestSessionRef
  readonly expectedHead: JsonNumber
  readonly record: ManifestAppendInput
}
