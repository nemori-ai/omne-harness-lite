import { type CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type {
  AssetDefinition,
  AssetHolding,
  CapabilityId,
  HoldingScope,
  WorkspaceKey,
} from '@omne-harness-lite/asset-model'
import type { SessionAssignment } from '@omne-harness-lite/asset-evaluation'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { MembershipsService } from '@omne-harness-lite/organization-governance'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy'

export interface EvaluationStorageDependencies {
  readonly storage: AtomicStorage
  readonly storeKey: string
  /** Actual deployed manifest given by the trusted assembly, never self-declared by a publication. */
  readonly deployedOfficial: readonly DeployedOfficialEntry[]
  readonly sessionTenancy: SessionTenancyService
  readonly diagnostics: (event: JsonObject) => void
  readonly onDiagnosticFailure: (stage: string) => void
  readonly monotonicNow: () => bigint
}
export interface InputSourceDependencies extends EvaluationStorageDependencies {
  readonly memberships: Pick<MembershipsService, 'participate'>
}
export interface DeployedOfficialEntry {
  readonly capability: CapabilityId
  readonly meta: boolean
}
export interface LocalPublication {
  readonly expectedRevision: string | null
  readonly definitions: readonly AssetDefinition[]
  readonly scopes: readonly {
    readonly holder: Exclude<HoldingScope, { readonly layer: 'workspace' }>
    readonly holdings: readonly AssetHolding[]
  }[]
}
export type PublicationResult =
  { readonly revision: string } | { readonly failure: 'invalidInput' | 'conflict' | 'unavailable' }
export interface SessionRecipeInput {
  readonly session: string
  readonly tenant: TenantId
  readonly rootDefinition: CapabilityId
  readonly sessionAssignments?: readonly SessionAssignment[]
  readonly workspace?: WorkspaceKey
}
export interface CurrentInputReader extends CurrentEvaluationInputs {
  close(): Promise<void>
}
export interface SourceDb {
  evaluation_input_head: { store_key: string; revision: string; factory_manifest: string }
  evaluation_input_asset: {
    store_key: string
    asset_id: string
    metadata: string
    draft: string | null
  }
  evaluation_input_version: {
    store_key: string
    asset_id: string
    version_position: string
    version: string
  }
  evaluation_input_scope: { store_key: string; layer: string; scope_key: string; holdings: string }
  evaluation_input_recipe: {
    store_key: string
    session: string
    tenant: string
    standing_at_creation: string
    root_definition: string
    session_assignments: string | null
    workspace: string | null
    source_at_creation: string
  }
}
