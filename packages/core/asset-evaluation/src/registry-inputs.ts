import { type EvaluationResult, type EvaluationRootSource, type NonConnectorEvaluationInput } from '@omne-harness-lite/asset-evaluation'

import { type TenantId } from '@omne-harness-lite/identity-values'






export interface RegistryInputRequest {
  readonly session: string
  readonly tenant: TenantId
  readonly purpose: 'reload' | 'refresh_availability'
  /** Caller must verify the same-session original complete fill before calling this restricted component. */
  readonly rootSource: EvaluationRootSource
}
export type RegistryInputStage =
  | 'stopped'
  | 'session_tenancy'
  | 'current_membership'
  | 'recipe'
  | 'source'
  | 'fixed_body'
  | 'body_provider'
  | 'evaluation_input'
  | 'unsupported_source'
  | 'storage'
export type RegistryInputResult =
  | { readonly input: NonConnectorEvaluationInput }
  | {
      readonly failure: 'rootSourceMismatch'
      readonly input: NonConnectorEvaluationInput
      readonly selected: EvaluationRootSource
      readonly rejection: Extract<EvaluationResult, { readonly invalidInput: unknown }>
      readonly sourceRevision: string
    }
  | { readonly failure: 'invalidInput' }
  | { readonly failure: 'unavailable'; readonly stage: RegistryInputStage }
