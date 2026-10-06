import type { OpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { JsonNumber, JsonValue, OpaqueJson } from './json.ts'

export type BlockId = OpaqueIdentifier<'BlockId'>
export type CallId = OpaqueIdentifier<'CallId'>
export type MediaType = string
export type InlineBytes = string
export type ModelToolName = string
export type Modality = 'text' | 'image' | 'audio' | 'video'
export type ExecutionOutcome =
  'completed' | 'failed' | 'unavailable' | 'backgrounded' | 'interrupted' | 'no_answer'
/** A denied call has a reply but no execution or execution account. */
export type ToolCallOutcome = ExecutionOutcome | 'denied'
export type AdmissionDenialCode =
  | 'not_held'
  | 'permission_forbidden'
  | 'authorization_denied'
  | 'run_mode_never'
  | 'human_refused'
  | 'human_declined'
export type ActionDenialReason =
  | {
      readonly kind: 'admission'
      readonly code: AdmissionDenialCode
      readonly by: string
      readonly conclusion: string
    }
  | {
      readonly kind: 'extension_veto' | 'admission_unavailable'
      readonly by: string
      readonly conclusion: string
      readonly explanation: string
    }
export type PlaceholderReason =
  | 'user_interrupted'
  | 'backgrounded_auto'
  | 'backgrounded_by_user'
  | 'backgrounded_by_preemption'
  | 'interrupted_by_preemption'
  | 'human_declined'
  | 'session_archived'
  | 'abnormal_interruption'
  | 'backgrounded_at_start'
  | 'run_cancelled'
  | 'foreground_timeout'

export interface Visibility {
  readonly toHuman: boolean
  readonly toModel: boolean
}
export interface CapabilityId {
  readonly category:
    | 'skill'
    | 'tool'
    | 'mcp'
    | 'connector'
    | 'loop_extension'
    | 'slash_command'
    | 'plugin'
    | 'agent_definition'
  readonly name: string
}
export interface AttachmentRef {
  readonly storage: string
  readonly key: string
  readonly mediaType: MediaType
  readonly bytes?: JsonNumber
  readonly name?: string
}
interface BlockIdentity {
  readonly id: BlockId
  readonly visibility: Visibility
}
export type BlockBase = BlockIdentity & MediaDerivation
export interface OriginTag {
  readonly kind:
    'slash_command_args' | 'skill_body' | 'slash_command_expansion' | 'slash_command_record'
  readonly command?: string
  readonly skill?: string
}
export interface TextBlock extends BlockIdentity {
  readonly kind: 'text'
  readonly text: string
  readonly origin?: OriginTag
}
export interface ThinkingBlock extends BlockIdentity {
  readonly kind: 'thinking'
  readonly text: string
  readonly opaque?: OpaqueJson
}
export interface DerivedRendering {
  readonly producedBy: 'system'
  readonly blocks: readonly RenderingBlock[]
}
export type MediaDerivation =
  | { readonly renderings: readonly DerivedRendering[]; readonly transcript: string }
  | { readonly renderings?: never; readonly transcript?: never }

export interface InlineData {
  readonly inline: InlineBytes
}
export type VoiceBlock = BlockBase & {
  readonly kind: 'voice'
  readonly mediaType: MediaType
  readonly data: InlineData | AttachmentRef
}
export type ImageBlock = BlockBase & {
  readonly kind: 'image'
  readonly mediaType: MediaType
  readonly data: InlineData | AttachmentRef
}
export type FileBlock = BlockBase & {
  readonly kind: 'file'
  readonly attachment: AttachmentRef
}
export type RenderingBlock =
  | TextBlock
  | (BlockIdentity & {
      readonly kind: 'voice' | 'image'
      readonly mediaType: MediaType
      readonly data: InlineData | AttachmentRef
      readonly renderings?: never
      readonly transcript?: never
    })
export type ToolCallBlock = BlockIdentity & {
  readonly kind: 'tool_call'
  readonly complete: true
  readonly callId: CallId
} & (
    | {
        readonly tool: ModelToolName
        readonly arguments: JsonValue
        readonly rawArguments?: never
        readonly unparseable?: never
      }
    | {
        /** The received nonempty name is retained verbatim, without ModelToolName admission. */
        readonly tool: string
        readonly arguments?: never
        readonly rawArguments: string
        readonly unparseable: true
      }
  )
export interface IncompleteToolCallBlock extends BlockIdentity {
  readonly kind: 'tool_call'
  readonly complete: false
  readonly visibility: { readonly toHuman: false; readonly toModel: false }
  readonly rawArguments: string
  readonly callId?: CallId
  readonly tool?: string
}
export interface ToolResultReason<C extends string = PlaceholderReason | 'terminated_by_agent'> {
  readonly code: C
  readonly text: string
}
export type ToolResultBlock = BlockIdentity & {
  readonly kind: 'tool_result'
  readonly callId: CallId
  readonly blocks: readonly ResultContentBlock[]
  readonly offloaded?: AttachmentRef
} & (
    | { readonly outcome: 'completed' | 'unavailable' | 'no_answer'; readonly reason?: never }
    | {
        readonly outcome: 'denied'
        readonly reason: ActionDenialReason
        readonly offloaded?: never
      }
    | { readonly outcome: 'failed'; readonly reason?: ToolResultReason<'abnormal_interruption'> }
    | {
        readonly outcome: 'backgrounded'
        readonly reason: ToolResultReason<
          | 'backgrounded_auto'
          | 'backgrounded_by_user'
          | 'backgrounded_by_preemption'
          | 'backgrounded_at_start'
        >
      }
    | {
        readonly outcome: 'interrupted'
        readonly reason: ToolResultReason<
          | 'user_interrupted'
          | 'interrupted_by_preemption'
          | 'human_declined'
          | 'session_archived'
          | 'run_cancelled'
          | 'terminated_by_agent'
          | 'foreground_timeout'
        >
      }
  )
export type ResultContentBlock =
  TextBlock | ThinkingBlock | VoiceBlock | ImageBlock | FileBlock | ToolResultBlock
export type ContentBlock = ResultContentBlock | ToolCallBlock | IncompleteToolCallBlock

/** Exchange representation before identity branding and opaque wrapping. */
export type Wire<T> = T extends OpaqueJson
  ? JsonValue
  : T extends OpaqueIdentifier<string>
    ? string
    : T extends JsonValue
      ? T
      : T extends readonly (infer Item)[]
        ? readonly Wire<Item>[]
        : T extends object
          ? { readonly [Key in keyof T]: Wire<T[Key]> }
          : T

export type ContentBlockRejection =
  | 'kind_unknown'
  | 'visibility_missing'
  | 'incomplete_call_visible'
  | 'call_in_result'
  | 'modality_mismatch'
  | 'malformed'
export type ContentBlockJudgment =
  { readonly ok: ContentBlock } | { readonly rejected: ContentBlockRejection }
