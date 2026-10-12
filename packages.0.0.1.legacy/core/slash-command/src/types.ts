import type {
  BlockId,
  CapabilityId,
  JsonNumber,
  Visibility,
} from '@omne-harness-lite/content-blocks'
import type { AssetOrigin } from '@omne-harness-lite/asset-model'

export type CommandName = string
export type ServiceName = string
export type SkillReference = CapabilityId & { readonly category: 'skill' }
export type CommandBinding =
  | { readonly kind: 'prompt'; readonly template: string }
  | { readonly kind: 'skill'; readonly skill: SkillReference }
  | { readonly kind: 'command'; readonly service: ServiceName }
export type ParameterDeclaration = {
  readonly name: string
  readonly required: boolean
  readonly positional?: true
  readonly hint?: string
} & (
  | { readonly kind: 'string' | 'integer' | 'boolean'; readonly values?: never }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
)
export interface SlashCommandDefinition {
  readonly description: string
  readonly binding: CommandBinding
  readonly parameters?: readonly ParameterDeclaration[]
}
export interface Span {
  readonly start: JsonNumber
  readonly end: JsonNumber
}
export interface CommandInvocation {
  readonly raw: string
  readonly name: string
  readonly argumentText: string
  readonly span: Span
}
export type Recognition =
  | { readonly kind: 'text' | 'literal'; readonly text: string }
  | { readonly kind: 'invocation'; readonly invocation: CommandInvocation }
export type ParseFailureReason =
  | 'unknown_command'
  | 'unterminated_quote'
  | 'missing_required'
  | 'type_mismatch'
  | 'unexpected_argument'
  | 'enum_out_of_range'
export type ParseFailure = {
  readonly kind: 'failed'
  readonly explanation: string
} & (
  | { readonly reason: 'missing_required'; readonly at?: Span }
  | { readonly reason: Exclude<ParseFailureReason, 'missing_required'>; readonly at: Span }
)
export type CommandArguments = Readonly<Record<string, string | JsonNumber | boolean>>
/** Supplied by the projection caller after choosing the effective, authorized skill. */
export interface ExpansionBlockAnnotation {
  readonly id: BlockId
  readonly visibility: Visibility
}
export type ParseResult =
  | { readonly kind: 'expanded'; readonly text: string }
  | { readonly kind: 'skill'; readonly skill: SkillReference }
  | {
      readonly kind: 'command'
      readonly service: ServiceName
      readonly arguments?: CommandArguments
    }
  | ParseFailure
export type SessionCommandSet = Readonly<Record<CommandName, SlashCommandDefinition>>
export interface SlashCommandJudgeContext {
  readonly capabilityName?: string
  readonly origin?: AssetOrigin
  /** For a Span or ParseResult received with its original invocation. */
  readonly raw?: string
}
export type SlashCommandRejection =
  | 'binding_unknown'
  | 'name_invalid'
  | 'name_reserved'
  | 'parameter_duplicate'
  | 'positional_after_named'
  | 'malformed'
export type SlashCommandJudgment =
  { readonly ok: true } | { readonly rejected: SlashCommandRejection }
