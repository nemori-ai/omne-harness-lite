import { type AssetRegistryService } from '@omne-harness-lite/asset-registry'
import type { AssetDefinition, CapabilityId } from '@omne-harness-lite/asset-model'
import type {
  EffectiveAssembly,
  NonConnectorEvaluationInput,
} from '@omne-harness-lite/asset-evaluation'
import type { AssemblyManifestService } from '@omne-harness-lite/assembly-manifest'
import type { JsonObject } from '@omne-harness-lite/content-blocks'

import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { RegistryInputRequest, RegistryInputResult } from '@omne-harness-lite/asset-evaluation'
import type {
  RegistryHistoryRequest,
  RegistryHistoryResult,
} from '@omne-harness-lite/asset-evaluation'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy'
export interface AssetRegistry extends AssetRegistryService {
  close(): Promise<void>
}
export interface RegistryDependencies {
  readonly manifest: AssemblyManifestService
  readonly clock: Clock
  readonly sessionTenancy?: SessionTenancyService
  readonly currentInputs?: CurrentEvaluationInputs
  readonly fixedRootInput?: { read(request: RegistryInputRequest): Promise<RegistryInputResult> }
  readonly historicalBody?: {
    read(request: RegistryHistoryRequest): Promise<RegistryHistoryResult>
  }
  /** Trusted deployment metadata; not supplied by publishers or individual calls. */
  readonly deployedMeta: readonly CapabilityId[]
  readonly diagnostic: (event: JsonObject) => void
  readonly diagnosticFailure: (fact: { readonly kind: 'registry_diagnostic_unavailable' }) => void
  readonly monotonicNow: () => bigint
  readonly conflictPolicy: { readonly maxRetries: number }
  readonly maxInFlight: number
}
export type { EffectiveAssembly, NonConnectorEvaluationInput, AssetDefinition }
