import type { JsonNumber, JsonObject, Modality } from '@omne-harness-lite/content-blocks'
import type { ScopeLayerIdentity } from '@omne-harness-lite/identity-values'

export type RouteName = string
export type ProviderName = string
export type ProfileOrigin = 'official' | 'custom'
export type Registration = 'listed' | 'withdrawn'
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'max'

/** Counts have no safe-integer ceiling in v1. Validation checks their exact value. */
export interface InputConstraints {
  readonly maxImageBytes?: JsonNumber
}

export interface ModelRequestParameters {
  readonly reasoningEffort?: ReasoningEffort
  readonly temperature?: JsonNumber
  readonly topP?: JsonNumber
  readonly seed?: JsonNumber
  readonly maxOutputTokens?: JsonNumber
  readonly stopSequences?: readonly string[]
  readonly frequencyPenalty?: JsonNumber
  readonly presencePenalty?: JsonNumber
  readonly extra?: JsonObject
}

/** Exact selected implementation, definition and immutable configuration revision. */
export interface ModelAdaptationBinding {
  readonly implementation: { readonly name: string; readonly revision: string }
  readonly definition: { readonly modelId: RouteName; readonly revision: string }
  readonly configuration: { readonly revision: string; readonly values: JsonObject }
}

export interface ModelProfileContent {
  readonly adaptation: ModelAdaptationBinding
  readonly routeName: RouteName
  readonly origin: ProfileOrigin
  readonly providers: readonly ProviderName[]
  readonly allowFallback: boolean
  readonly inputModalities: readonly Modality[]
  readonly outputModalities: readonly Modality[]
  readonly maxInputTokens: JsonNumber
  readonly maxOutputTokens: JsonNumber
  readonly inputConstraints: InputConstraints
  readonly parameters?: ModelRequestParameters
}

export interface ModelProfile extends ModelProfileContent {
  readonly registration: Registration
  /** RFC 3339 exchange representation; no normalization or wall-clock read. */
  readonly updatedAt: string
}

export type ModelProfileRef =
  | { readonly origin: 'official'; readonly routeName: RouteName }
  | {
      readonly origin: 'custom'
      readonly scope: ScopeLayerIdentity
      readonly routeName: RouteName
    }

/** S-27: copying and preserving this value is the model-request runtime's duty. */
export type ModelProfileSnapshot = Pick<
  ModelProfile,
  | 'adaptation'
  | 'providers'
  | 'allowFallback'
  | 'inputModalities'
  | 'outputModalities'
  | 'maxInputTokens'
  | 'maxOutputTokens'
  | 'parameters'
  | 'updatedAt'
>

export type ModelProfileDocumentKind =
  'ModelProfile' | 'ModelProfileContent' | 'ModelProfileRef' | 'ModelRequestParameters'

export type ModelProfileRejection =
  | 'malformed'
  | 'route_name_empty'
  | 'providers_empty'
  | 'modalities_empty'
  | 'input_text_missing'
  | 'modality_unknown'
  | 'registration_unknown'
  | 'parameter_out_of_range'
  | 'max_output_exceeds_profile'
  | 'constraint_unknown'

export type ModelProfileJudgment =
  { readonly ok: true } | { readonly rejected: ModelProfileRejection }
