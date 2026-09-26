import type {
  BlockId,
  CallId,
  Visibility,
  MediaType,
  ModelToolName,
  ContentBlock,
  ContentBlockRejection,
  ImageBlock,
  FileBlock,
  ToolResultBlock,
  JsonNumber,
} from '@omne-harness-lite/content-blocks'
import type { Usage, Cost, ModelCallId, TrimReason } from '@omne-harness-lite/call-accounts'
import type { FailureCause } from '@omne-harness-lite/loop-extension'

export type ArrivalTarget =
  | { readonly kind: 'model_call'; readonly callId: ModelCallId; readonly dispatch: JsonNumber }
  | { readonly kind: 'tool_execution'; readonly callId: CallId }
export type BlockKind = ContentBlock['kind']
export type FillMode = 'append' | 'replace'
export interface PresentationHint {
  readonly hint: string
  readonly language?: string
}
export interface BlockHead {
  readonly mediaType?: MediaType
  readonly callId?: CallId
  readonly tool?: ModelToolName
  readonly presentation?: PresentationHint
}
interface OpenBase {
  readonly t: 'open'
  readonly index: JsonNumber
  readonly id: BlockId
  readonly visibility: Visibility
}
type NonCallHead = Omit<BlockHead, 'callId' | 'tool'> & {
  readonly callId?: never
  readonly tool?: never
}
export type OpenEvent = OpenBase &
  (
    | { readonly kind: 'text' | 'thinking'; readonly fill: FillMode; readonly head?: NonCallHead }
    | {
        readonly kind: 'voice'
        readonly fill: FillMode
        readonly head: NonCallHead & { readonly mediaType: MediaType }
      }
    | {
        readonly kind: 'tool_call'
        readonly fill: FillMode
        readonly head: Omit<BlockHead, 'mediaType'> & {
          readonly mediaType?: never
          readonly callId: CallId
          readonly tool: ModelToolName
        }
      }
    | { readonly kind: 'image' | 'file'; readonly fill: 'replace'; readonly head?: NonCallHead }
    | {
        readonly kind: 'tool_result'
        readonly fill: 'replace'
        readonly head?: Omit<NonCallHead, 'mediaType'> & { readonly mediaType?: never }
      }
  )
export type WholeFillBlock = ImageBlock | FileBlock | ToolResultBlock
export interface FillEvent {
  readonly t: 'fill'
  readonly index: JsonNumber
  readonly payload: string | WholeFillBlock
}
export interface CloseEvent {
  readonly t: 'close'
  readonly index: JsonNumber
  readonly block?: Exclude<ContentBlock, { readonly kind: 'tool_call' }>
}
export type TrimEvent = { readonly t: 'trim'; readonly index?: JsonNumber } & (
  | {
      readonly reason: Extract<TrimReason, 'rate_merged'>
      readonly merged: JsonNumber
      readonly omittedBytes?: never
    }
  | {
      readonly reason: Exclude<TrimReason, 'rate_merged'>
      readonly omittedBytes: JsonNumber
      readonly merged?: never
    }
)
export interface AccountEvent {
  readonly t: 'account'
  readonly usage: Usage
  readonly cost: Cost
}
export type FinishReason = 'end' | 'max_tokens' | 'interrupted' | 'lost'
export type ArrivalError = { readonly cause: FailureCause } & (
  | { readonly statusCode?: JsonNumber; readonly inBand?: never }
  | { readonly statusCode: JsonNumber; readonly inBand: true }
)
export type FinishEvent =
  | { readonly t: 'finish'; readonly reason: Exclude<FinishReason, 'lost'>; readonly error?: never }
  | { readonly t: 'finish'; readonly reason: 'lost'; readonly error?: ArrivalError }
export type ArrivalEvent =
  OpenEvent | FillEvent | CloseEvent | TrimEvent | AccountEvent | FinishEvent
export interface ArrivalEnvelope {
  readonly target: ArrivalTarget
  readonly event: ArrivalEvent
}
/** Only the immutable kind/fill facts are needed by S-19. Whole classes never append. */
export type ReductionMode =
  | { readonly kind: 'text' | 'thinking' | 'voice' | 'tool_call'; readonly fill: FillMode }
  | { readonly kind: 'image' | 'file' | 'tool_result'; readonly fill: 'replace' }
export type OpenBlock = (index: JsonNumber) => OpenEvent | undefined
export type ArrivalRejection =
  | 'event_unknown'
  | 'trim_reason_unknown'
  | 'finish_reason_unknown'
  | 'presentation_invalid'
  | 'head_modality_mismatch'
  | 'fill_kind_not_appendable'
  | 'frame_media_inline'
  | 'replace_payload_shape'
  | ContentBlockRejection
  | 'negative_amount'
  | 'unknown_with_source'
export type ArrivalJudgment = { readonly ok: true } | { readonly rejected: ArrivalRejection }
