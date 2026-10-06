import type { AttributeDeclaration, SettingCategory } from '@omne-harness-lite/asset-model'
import type {
  AttachmentRef,
  BlockId,
  CapabilityId,
  ContentBlockRejection,
  InlineBytes,
  JsonNumber,
  JsonObject,
  JsonValue,
  MediaType,
  ModelToolName,
  Modality,
  ResultContentBlock,
} from '@omne-harness-lite/content-blocks'

export type { ModelToolName } from '@omne-harness-lite/content-blocks'
export type ToolName = string
export type Duration = string
export type DependencyName = string
export type Facility = string
export type BindingLayer =
  'host_machine' | 'stateless_sandbox' | 'session_sandbox' | 'tenant_sandbox'
export interface TargetEnvironment {
  readonly bindingLayer: BindingLayer
  readonly facilities: readonly Facility[]
}
export interface SettingDeclaration<
  T extends JsonValue = JsonValue,
  C extends SettingCategory = SettingCategory,
> {
  readonly category: C
  readonly default: T
}
export interface ExecutePermission {
  readonly default: 'forbid' | 'auto' | 'ask'
}
export type ToolSource =
  | { readonly kind: 'authored' }
  | {
      readonly kind: 'mcp'
      readonly endpoint: CapabilityId & { readonly category: 'mcp' }
      readonly remoteName: string
    }
export interface ToolNeeds {
  readonly externalServices?: readonly DependencyName[]
  readonly attachmentStorage?: DependencyName
  readonly inputModalities?: readonly Modality[]
  readonly outputModalities?: readonly Modality[]
}
export interface ToolSettings {
  readonly targetEnvironment?: {
    readonly category: 'placement_identity'
    readonly default: TargetEnvironment
  }
  readonly backgroundThreshold?: SettingDeclaration<Duration, 'preference'>
  readonly timeout?: SettingDeclaration<Duration, 'preference'>
  readonly concurrency?: SettingDeclaration<JsonNumber, 'preference'>
}
export type JsonSchema = JsonObject
export interface ToolCommand {
  readonly description: string
  readonly input: JsonSchema
  readonly help?: string
}
export type CommandDefinition = ToolCommand
interface ToolBase {
  readonly name: ToolName
  readonly description: string
  readonly help?: string
  readonly needs?: ToolNeeds
  readonly settings?: ToolSettings
  readonly allowBackground?: boolean
  readonly permissions: { readonly execute: ExecutePermission }
}
export type SingleFunctionTool = ToolBase & {
  readonly paradigm: 'single'
  readonly input: JsonSchema
  readonly commands?: never
} & (
    | {
        readonly origin: { readonly kind: 'authored' }
        readonly composes?: { readonly skills?: readonly string[] }
      }
    | { readonly origin: Extract<ToolSource, { kind: 'mcp' }>; readonly composes?: never }
  )
export type MultiCommandTool = ToolBase & {
  readonly paradigm: 'multi'
  readonly commands: Readonly<Record<string, ToolCommand>>
  readonly input?: never
  readonly origin: { readonly kind: 'authored' }
  readonly composes?: { readonly skills?: readonly string[] }
}
export type ToolDefinition = SingleFunctionTool | MultiCommandTool
export interface ModelToolEntry {
  readonly name: ModelToolName
  readonly description: string
  readonly parameters: JsonSchema
}
export interface Offload {
  readonly raw: AttachmentRef | { readonly inline: InlineBytes; readonly mediaType: MediaType }
  readonly summary?: readonly [ResultContentBlock, ...ResultContentBlock[]]
}
export interface ToolResult {
  readonly content: readonly ResultContentBlock[]
  /** Ordinary business failure. Omitted or false means ordinary success. */
  readonly isError?: boolean
  readonly offload?: Offload
  readonly attachments?: readonly AttachmentRef[]
}
export type ToolReturn = string | ToolResult
export type ToolRejection =
  | 'malformed'
  | 'paradigm_unknown'
  | 'commands_missing'
  | 'commands_forbidden'
  | 'input_not_schema'
  | 'parameter_description_missing'
  | 'binding_layer_unknown'
  | 'setting_category_unknown'
  | 'permission_unknown'
  | 'tool_origin_unknown'
  | 'name_reserved_sequence'
  | 'result_call_in_content'
  | 'schema_unsupported'
export type MalformedCode =
  `M${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27}`
export type ToolJudgment =
  | { readonly ok: true }
  | {
      readonly rejected: ToolRejection | ContentBlockRejection
      readonly malformed?: MalformedCode
      readonly unsupported?: string
    }
export type ArgumentJudgment =
  | { readonly ok: { readonly command?: string; readonly args: JsonObject } }
  | { readonly invalid: string }
  | { readonly unsupported: string }
export interface ParameterJudge {
  readonly metaValidate: (schema: JsonSchema) => boolean
  readonly judgeCallArguments: (definition: ToolDefinition, call: unknown) => ArgumentJudgment
  readonly compile: (schema: JsonSchema) => { readonly ok: true } | { readonly unsupported: string }
}
export type ToolDependency =
  | { readonly kind: 'external_service'; readonly name: string }
  | { readonly kind: 'attachment_storage'; readonly name: string; readonly readerRequired: true }
  | { readonly kind: 'input_modality' | 'output_modality'; readonly modality: Modality }
  | { readonly kind: 'target_environment'; readonly value: TargetEnvironment }
export type ToolDeclarations = readonly AttributeDeclaration[]
export type RuntimeBlockId = BlockId
