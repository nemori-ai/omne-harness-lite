import type { Modality } from '@omne-harness-lite/content-blocks'
import type {
  ModelProfile,
  ModelProfileRef,
  ModelProfileRejection,
  RouteName,
} from '@omne-harness-lite/model-profile'
import type { CatalogScope, ProfileRow } from '@omne-harness-lite/model-profile-directory'

/** Explicit caller facts; unknown never means an empty set or an absent setting. */
export type SelectionFact<T> = { readonly known: T } | { readonly unknown: true }
export type SelectionInvalidInput = {
  readonly invalidInput: { readonly reason: ModelProfileRejection }
}
export type SelectionUnavailable = { readonly unavailable: true }
export type SelectionFailure = SelectionInvalidInput | SelectionUnavailable

/** The caller supplies the pure compatibility implementation for the full current profile. */
export type SelectionCompatibilityResult =
  { readonly ok: true } | { readonly blocked: readonly Modality[] } | SelectionFailure
export type SelectionCompatibility = (
  profile: ModelProfile,
  projection: readonly Modality[],
) => SelectionCompatibilityResult

/** No credential value, source reference, or IO port belongs in this input. */
export interface RowCredentialFact {
  readonly ref: ModelProfileRef
  readonly present: SelectionFact<boolean>
}

export type ModelDisplayAnnotation =
  | 'legal'
  | 'withdrawn'
  | 'scope_disallowed'
  | 'modality_mismatch'
  | 'credential_missing'
  | { readonly overridden_by: { readonly scope: CatalogScope } }
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
export type LegalTargetsResult = { readonly ok: readonly RouteName[] } | SelectionFailure
export type DisplayListResult =
  | { readonly ok: readonly ModelDisplayEntry[] }
  | SelectionFailure
  | { readonly profileNotFound: true }
export type EffectiveModelResult =
  { readonly ok: EffectiveModel } | SelectionFailure | { readonly profileNotFound: true }
export type SelectionRows = SelectionFact<readonly ProfileRow[]>
export type SelectionAllowed = SelectionFact<readonly RouteName[]>
export type SelectionProjection = SelectionFact<readonly Modality[]>
/** known:null means no durable initial selection, not a default route. */
export type SelectedRouteFact = SelectionFact<RouteName | null>
/** Evaluated above-session lock only. known:null also represents a known missing model setting. */
export type ModelLockFact = SelectionFact<RouteName | null>
