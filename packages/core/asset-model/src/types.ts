import type {
  CapabilityId,
  JsonNumber,
  JsonValue,
  OpaqueJson,
} from '@omne-harness-lite/content-blocks'
import type {
  OrganizationId,
  TenantId,
  ScopeLayerIdentity,
} from '@omne-harness-lite/identity-values'

export type { CapabilityId } from '@omne-harness-lite/content-blocks'
export type AssetCategory = CapabilityId['category']
export type CapabilityName = string
export type AssetRecordId = string
export type LineageId = string
export type SharingId = string
export type CredentialRef = string
export type AssetOrigin = 'official' | 'customized'
export type AssetOwner =
  | { readonly kind: 'organization'; readonly organization: OrganizationId }
  | { readonly kind: 'tenant'; readonly tenant: TenantId }
export type BodyCategory = Exclude<AssetCategory, 'plugin' | 'agent_definition'>
/** Body packages own the precise body types; these are the exchange shells, not second body definitions. */
export type AssetContent =
  | { readonly category: 'tool'; readonly definition: JsonValue }
  | { readonly category: 'loop_extension'; readonly extension: JsonValue }
  | { readonly category: 'skill' | 'mcp' | 'slash_command' | 'connector'; readonly body: JsonValue }
  | { readonly category: 'agent_definition'; readonly body: OpaqueJson }
  | { readonly category: 'plugin'; readonly members: readonly CapabilityId[] }
export interface AssetVersion {
  readonly number: JsonNumber
  readonly content: AssetContent
  readonly publishedAt: string
  readonly publishedBy?: TenantId
}
export interface CopyLineage {
  readonly lineage: LineageId
  readonly sourceVersion: JsonNumber
  readonly importedBy: TenantId
  readonly importedAt: string
  readonly imports: JsonNumber
}
interface DefinitionBase {
  readonly id: AssetRecordId
  readonly capability: CapabilityId
  readonly draft?: AssetContent
  readonly versions: readonly AssetVersion[]
}
export type AssetDefinition = DefinitionBase &
  (
    | {
        readonly origin: 'official'
        readonly owner?: never
        readonly author?: never
        readonly byAgent?: never
        readonly lineage?: never
      }
    | {
        readonly origin: 'customized'
        readonly owner: AssetOwner
        readonly author: TenantId
        readonly byAgent: boolean
        readonly lineage?: CopyLineage
      }
  )
export type SettingCategory = 'preference' | 'binding' | 'placement_identity' | 'governance'
export type AttributeKind = 'setting' | 'permission'
export type JsonSchema = boolean | { readonly [key: string]: JsonValue }
export type AttributeDomain =
  | { readonly kind: 'open'; readonly schema: JsonSchema }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
export type AttributeDeclaration =
  | {
      readonly item: string
      readonly kind: 'setting'
      readonly category: 'preference' | 'binding'
      readonly domain: { readonly kind: 'open'; readonly schema: JsonSchema }
      readonly default: JsonValue
    }
  | {
      readonly item: string
      readonly kind: 'setting'
      readonly category: 'placement_identity' | 'governance'
      readonly domain: { readonly kind: 'open'; readonly schema: JsonSchema }
      readonly default?: JsonValue
    }
  | {
      readonly item: string
      readonly kind: 'permission'
      readonly category?: never
      readonly domain: { readonly kind: 'enum'; readonly values: readonly string[] }
      readonly default: string
    }
export interface PermissionValue {
  readonly allowed: readonly string[]
}
export interface AttributeAssignment {
  readonly item: string
  readonly value: JsonValue
  readonly immutable: boolean
  readonly since: string
}
export interface WorkspaceKey {
  readonly tenant: TenantId
  readonly directory: string
}
export type HoldingScope =
  | ScopeLayerIdentity
  | { readonly layer: 'factory' }
  | { readonly layer: 'workspace'; readonly workspace: WorkspaceKey }
export type HoldingBasis =
  | { readonly kind: 'owned' | 'organization' | 'official' | 'carrier' }
  | { readonly kind: 'shared'; readonly sharing: SharingId }
export type VersionSelection =
  { readonly kind: 'current' } | { readonly kind: 'pinned'; readonly number: JsonNumber }
export interface AssetHolding {
  readonly holder: HoldingScope
  readonly capability: CapabilityId
  readonly asset: AssetRecordId
  readonly basis: HoldingBasis
  readonly versionSelection: VersionSelection
  readonly immutable: boolean
  readonly assignments: readonly AttributeAssignment[]
  readonly since: string
}
export interface WorkspaceCarrierManifest {
  /** Numeric one can retain a lossless source spelling such as 1.0. */
  readonly format: JsonNumber
  readonly assets: readonly { readonly capability: CapabilityId; readonly source: string }[]
  readonly assignments: readonly {
    readonly capability: CapabilityId
    readonly item: string
    readonly value: JsonValue
    readonly immutable?: boolean
  }[]
  readonly disabled: readonly CapabilityId[]
}
/** Only visible record facts and a fixed referenced definition, never runtime state. */
export interface BodyJudgeContext {
  readonly capabilityName?: string
  readonly origin?: AssetOrigin
  readonly definition?: string
}
export type BodyJudgment = { readonly ok: true } | { readonly rejected: string }
export type DeclarationResult<C extends AssetCategory = AssetCategory> =
  { readonly declarations: readonly AttributeDeclaration[] } | { readonly underivable: C }
/** Category is a literal discriminant, so a tool implementation cannot occupy the skill slot. */
export interface BodyContract<C extends BodyCategory> {
  readonly category: C
  readonly schema: JsonSchema
  readonly judge: (body: unknown, context?: BodyJudgeContext) => BodyJudgment
  readonly deriveDeclarations: (
    body: JsonValue,
    ...snapshot: C extends 'mcp' ? [actionSnapshot?: JsonValue] : []
  ) => DeclarationResult<C>
  readonly references: (body: JsonValue) => readonly CapabilityId[]
}
export type BodyContracts = { readonly [C in BodyCategory]: BodyContract<C> }
export interface AssetJudgeContext {
  readonly declarations?: readonly AttributeDeclaration[]
}
export type AssetRejection =
  | 'manifest_format_unsupported'
  | 'category_unknown'
  | 'origin_unknown'
  | 'owner_kind_unknown'
  | 'name_invalid'
  | 'plugin_member_is_plugin'
  | 'version_sequence_broken'
  | 'assignment_item_duplicate'
  | 'manifest_source_escapes'
  | 'malformed'
export type AssetJudgment = { readonly ok: true } | { readonly rejected: string }
