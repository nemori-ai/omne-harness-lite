import type {
  AssetCategory,
  AssetContent,
  AssetDefinition,
  AssetHolding,
  AttributeAssignment,
  AttributeDeclaration,
  CapabilityId,
  PermissionValue,
  WorkspaceKey,
} from '@omne-harness-lite/asset-model'
import type { JsonNumber, JsonValue } from '@omne-harness-lite/content-blocks'
import type { MembershipStanding, TenantId } from '@omne-harness-lite/identity-values'
import type { ActionSnapshot } from '@omne-harness-lite/mcp-endpoint'

export type Layer = 'factory' | 'organization' | 'tenant' | 'workspace' | 'session'
export type HoldingLayer = Exclude<Layer, 'session'>
export interface AssetReference {
  readonly capability: CapabilityId
  readonly resident?: boolean
}
export interface CompositionRoot {
  readonly definition: CapabilityId
  readonly references: readonly AssetReference[]
  readonly attributes: readonly AttributeDeclaration[]
  readonly source: EvaluationRootSource
}
export interface EvaluationRootSource {
  readonly asset: string
  readonly version: JsonNumber
}
export type EvaluationRootSelectionInput = Pick<
  NonConnectorEvaluationInput,
  'tenant' | 'standing' | 'workspace' | 'holdings' | 'definitions' | 'session'
> & {
  readonly rootDefinition: CapabilityId
}
export type EvaluationRootSelectionResult =
  | { readonly ok: EvaluationRootSource }
  | { readonly missing: true }
  | Extract<EvaluationResult, { readonly invalidInput: unknown }>
  | { readonly unavailable: true }
export interface SessionAssignment {
  readonly capability: CapabilityId
  readonly assignment: AttributeAssignment
}
export interface McpActionSet {
  readonly endpoint: CapabilityId
  readonly scope: Layer
  readonly actions: ActionSnapshot
}
export interface EvaluationInput {
  readonly tenant: TenantId
  readonly standing: MembershipStanding
  readonly workspace?: WorkspaceKey
  readonly holdings: readonly AssetHolding[]
  readonly definitions: readonly AssetDefinition[]
  readonly session?: readonly SessionAssignment[]
  readonly mcpActionSets?: readonly McpActionSet[]
  readonly root: CompositionRoot
}
export type NonConnectorAssetContent =
  | Exclude<AssetContent, { readonly category: 'skill' | 'mcp' | 'slash_command' | 'connector' }>
  | { readonly category: 'skill' | 'mcp' | 'slash_command'; readonly body: JsonValue }
type WithoutConnector<D> = D extends AssetDefinition
  ? Omit<D, 'capability' | 'draft' | 'versions'> & {
      readonly capability: CapabilityId & { readonly category: Exclude<AssetCategory, 'connector'> }
      readonly draft?: NonConnectorAssetContent
      readonly versions: readonly {
        readonly number: JsonNumber
        readonly content: NonConnectorAssetContent
        readonly publishedAt: string
        readonly publishedBy?: TenantId
      }[]
    }
  : never
export type NonConnectorAssetDefinition = WithoutConnector<AssetDefinition>
export type NonConnectorEvaluationInput = Omit<EvaluationInput, 'definitions'> & {
  readonly definitions: readonly NonConnectorAssetDefinition[]
}
export type FilterReason =
  | 'disabled'
  | 'not_usable'
  | 'locked_below'
  | 'workspace_permission'
  | 'workspace_placement'
  | 'workspace_governance'
export interface EffectiveAsset {
  readonly capability: CapabilityId
  readonly asset: string
  readonly version: JsonNumber
  readonly from: HoldingLayer
  readonly replaced: readonly HoldingLayer[]
  readonly lockedAt?: HoldingLayer
  readonly resident?: boolean
}
export interface EffectiveValue {
  readonly capability: CapabilityId
  readonly item: string
  readonly value: JsonValue
  readonly from: Layer
  readonly lockedAt?: Layer
  readonly provenance?: Layer
  readonly tenantAutoWritable?: boolean
}
export interface FilteredOut {
  readonly capability: CapabilityId
  readonly from: HoldingLayer
  readonly reason: FilterReason
}
export interface Unresolved {
  readonly capability: CapabilityId
  readonly referencedBy?: CapabilityId
}
export interface EffectiveAssembly {
  readonly root: CapabilityId
  readonly assets: readonly EffectiveAsset[]
  readonly composition: readonly CapabilityId[]
  readonly values: readonly EffectiveValue[]
  readonly filteredOut: readonly FilteredOut[]
  readonly unresolved: readonly Unresolved[]
}
export type Condition = `C${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16}`
export interface InputDiagnostic {
  readonly condition: Condition
  readonly message: string
  readonly rejected?: string
}
export type EvaluationResult =
  | { readonly ok: EffectiveAssembly }
  | { readonly invalidInput: { readonly diagnostics: readonly InputDiagnostic[] } }
  | { readonly compositionCycle: { readonly cycle: readonly CapabilityId[] } }
  | { readonly categoryUnsupported: { readonly category: 'plugin' | 'agent_definition' } }
export type DropReason = 'immutable_flag' | 'unknown_asset'
export interface DroppedEntry {
  readonly capability: CapabilityId
  readonly item?: string
  readonly reason: DropReason
}
export type CarrierAssignment = Omit<AttributeAssignment, 'since'>
export type CarrierHolding = Omit<AssetHolding, 'since' | 'assignments'> & {
  readonly assignments: readonly CarrierAssignment[]
}
export interface CarrierReadResult {
  readonly holdings: readonly CarrierHolding[]
  readonly dropped: readonly DroppedEntry[]
}
export type CarrierReadOutcome =
  | { readonly ok: CarrierReadResult }
  | { readonly invalidInput: { readonly diagnostics: readonly InputDiagnostic[] } }
export type PermissionDeclaration = Extract<AttributeDeclaration, { readonly kind: 'permission' }>
export interface PermissionAssignment {
  readonly value: PermissionValue
  readonly immutable: boolean
}
export type TierOrder = readonly string[]
export interface PermissionClassification {
  readonly role: 'bound' | 'pick'
  readonly tiers: TierOrder | null
}
