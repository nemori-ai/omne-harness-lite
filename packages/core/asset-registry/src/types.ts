import type { AssetContent, CapabilityId, AssetVersion } from '@omne-harness-lite/asset-model'
import type { EffectiveAssembly, EffectiveAsset, EffectiveValue, EvaluationRootSource } from '@omne-harness-lite/asset-evaluation'
import type { EvaluationRef, ManifestRecord, ManifestTable } from '@omne-harness-lite/assembly-manifest'
import type { JsonNumber, JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import type { RunId, AttemptId } from '@omne-harness-lite/call-accounts'

import type { Instant } from '@omne-harness-lite/offer-expiry'






export const REGISTERED_CATEGORIES = Object.freeze([
  'tool',
  'skill',
  'slash_command',
  'loop_extension',
  'mcp',
  'plugin',
] as const)
export type RegisteredCategory = (typeof REGISTERED_CATEGORIES)[number]
export type FilledBy =
  | { readonly kind: 'assembly' | 'auto_refresh_after_failure' | 'asset_change' }
  | { readonly kind: 'reload'; readonly command: string }
export interface CompositionEntry {
  readonly capability: CapabilityId
  readonly asset: string
  readonly version: JsonNumber
  readonly from: EffectiveAsset['from']
  readonly resident?: boolean
}
export interface DependencyIssue {
  readonly dependency: JsonValue
  readonly state: 'missing' | 'unreadable'
}
export type Availability =
  | { readonly kind: 'available' }
  | { readonly kind: 'stand_in'; readonly for: readonly DependencyIssue[] }
  | { readonly kind: 'unavailable'; readonly reason: readonly DependencyIssue[] }
export type CommandAvailability =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: 'run_mode_never' | 'run_mode_unreadable' }
export interface RegistryEntry {
  readonly capability: CapabilityId
  readonly asset: string
  readonly from: EffectiveAsset['from']
  readonly content: AssetContent
  readonly resident?: boolean
  readonly availability: Availability
  readonly commandAvailability?: Readonly<Record<string, CommandAvailability>>
}
export interface RegistrySnapshot {
  readonly category: RegisteredCategory
  readonly entries: readonly RegistryEntry[]
  readonly filledAt: Instant
  readonly filledBy: FilledBy
  readonly basedOn: EvaluationRef
}
export interface TablePlan {
  readonly category: RegisteredCategory
  readonly composition: readonly CompositionEntry[]
  readonly entries: readonly RegistryEntry[]
}
export interface RegistryRecordContent {
  readonly evaluation: EffectiveAssembly
  readonly compositionOrder: readonly CapabilityId[]
  readonly filledBy: FilledBy
}
export interface CheckedRegistryRecord {
  readonly record: ManifestRecord
  readonly content: RegistryRecordContent
  readonly compositions: Readonly<Partial<Record<RegisteredCategory, readonly CompositionEntry[]>>>
}
export type RegistryFailure =
  | { readonly failure: 'invalidInput'; readonly reason?: 'evaluationSuperseded' }
  | {
      readonly failure:
        'unavailable' | 'sessionNotFound' | 'categoryNotRegistered' | 'toolNameConflict'
    }
  | { readonly failure: 'dependencyUnresolved'; readonly missing: EffectiveAssembly['unresolved'] }
  | { readonly compositionCycle: { readonly cycle: readonly CapabilityId[] } }
  | { readonly categoryUnsupported: { readonly category: 'plugin' | 'agent_definition' } }
export type TableBuildResult = RegistryFailure | { readonly plans: readonly TablePlan[] }
export interface ReportAvailability {
  readonly capability: CapabilityId
  readonly availability: Availability
  readonly commandAvailability?: Readonly<Record<string, CommandAvailability>>
}
export interface AvailabilityReport {
  readonly session: string
  readonly runId: RunId
  readonly attempt: AttemptId
  readonly computedAt: Instant
  readonly snapshots: readonly {
    readonly category: RegisteredCategory
    readonly filledAt: Instant
  }[]
  readonly availability: readonly ReportAvailability[]
  /** Empty in this provider's explicitly unsupported MCP-bridge composition. */
  readonly mcpActions: readonly JsonObject[]
  readonly endpointHoldings: readonly JsonObject[]
  readonly effectivePermissions: Readonly<
    Record<string, EffectiveValue | 'not_in_composition' | 'unavailable'>
  >
  readonly skillGate: readonly CapabilityId[]
}
export type Within =
  { readonly kind: 'session' } | { readonly kind: 'run'; readonly report: AvailabilityReport }
export type RefreshRun =
  | { readonly kind: 'start'; readonly runId: RunId }
  | { readonly kind: 'continue'; readonly runId: RunId; readonly report: AvailabilityReport }
export interface AssetRegistryService {
  fill(
    session: unknown,
    evaluation: unknown,
    evaluationRef: unknown,
    compositionOrder: unknown,
  ): Promise<RegistryFailure | { readonly snapshots: readonly RegistrySnapshot[] }>
  reload(
    session: unknown,
    category: unknown,
    compositionOrder: unknown,
  ): Promise<RegistryFailure | { readonly snapshots: readonly RegistrySnapshot[] }>
  refreshAvailability(
    session: unknown,
    run: unknown,
    attempt: unknown,
  ): Promise<RegistryFailure | { readonly report: AvailabilityReport }>
  lookup(
    session: unknown,
    category: unknown,
    name: unknown,
    within: unknown,
  ): Promise<RegistryFailure | { readonly entry: RegistryEntry } | { readonly none: true }>
  list(
    session: unknown,
    category: unknown,
    within: unknown,
  ): Promise<RegistryFailure | { readonly entries: readonly RegistryEntry[] }>
  markFailed(
    session: unknown,
    capability: unknown,
  ): Promise<RegistryFailure | { readonly snapshot: RegistrySnapshot }>
  onAssetChange(
    session: unknown,
    notification: unknown,
  ): Promise<RegistryFailure | { readonly snapshot: RegistrySnapshot }>
}
export interface BodySelection {
  readonly capability: CapabilityId
  readonly asset: string
  readonly version: AssetVersion
}
export interface AvailabilityFacts {
  readonly dependencies: readonly {
    readonly dependency: JsonValue
    readonly state: 'satisfied' | 'missing' | 'unreadable'
  }[]
  readonly runMode?: 'auto' | 'ask' | 'never'
}
export type RegistryTableMap = Readonly<Partial<Record<RegisteredCategory, ManifestTable>>>
export interface RootSourceProof {
  readonly record: ManifestRecord
  readonly rootSource: EvaluationRootSource
}
