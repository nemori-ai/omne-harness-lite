import type { CallId, JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ScopeLayerIdentity, TenantId } from '@omne-harness-lite/identity-values'

export type Unknown = 'unknown'
export type ResponseId = string
export type RunId = string
export type ModelCallId = string
export type AttemptId = JsonNumber
export type Amount = JsonNumber | Unknown
export interface Usage {
  readonly input_tokens: Amount
  readonly output_tokens: Amount
  readonly cache_read_tokens: Amount
  readonly cache_write_tokens: Amount
  readonly reasoning_tokens?: JsonNumber
  readonly source: 'upstream' | 'none'
}
export interface Cost {
  readonly cost_usd: Amount
  readonly upstream_inference_cost_usd?: JsonNumber
  readonly source: 'upstream_usage' | 'later_correction' | 'none'
}
export interface CostItem {
  readonly service: string
  readonly cost_usd: Amount
  readonly quantity?: { readonly amount: JsonNumber; readonly unit: string }
  readonly reference?: string
  readonly source: 'tool_reported' | 'service_reported' | 'model_response' | 'none'
}
export type TrimReason = 'rate_merged' | 'frame_too_long' | 'quota_exhausted' | 'rejected'
export interface TrimSummary {
  readonly merged: JsonNumber
  readonly cut: JsonNumber
  readonly omittedBytes: JsonNumber
  readonly byReason: Readonly<Record<TrimReason, JsonNumber>>
}
export interface FrameAccount {
  readonly emitted: JsonNumber
  readonly trims: TrimSummary
}
export interface ToolCallAccount {
  readonly callId: CallId
  readonly initiator: TenantId
  readonly credentialScope?: Extract<ScopeLayerIdentity, { layer: 'tenant' }>
  readonly externalEffect: 'confirmed' | 'unknown'
  readonly cost: { readonly total_usd: Amount; readonly items: readonly CostItem[] }
  readonly usage?: Usage
  readonly frames: FrameAccount | Unknown
  readonly wallClock: { readonly startedAt: string; readonly endedAt?: string }
  readonly stoppedAt?: string
  readonly late?: true
}
export type CorrectionTarget =
  | { readonly kind: 'model_response'; readonly responseId: ResponseId }
  | { readonly kind: 'tool_execution'; readonly callId: CallId }
export interface CostCorrection {
  readonly target: CorrectionTarget
  readonly cost_usd: JsonNumber
  readonly obtainedVia: 'generation_endpoint' | 'manual'
  readonly at: string
  readonly late?: true
}
export type AccountRejection =
  | 'correction_without_target'
  | 'malformed'
  | 'negative_amount'
  | 'unknown_with_source'
  | 'total_not_unknown'
export type AccountJudgment = { readonly ok: true } | { readonly rejected: AccountRejection }
