import { type AssetVersion, type CapabilityId } from '@omne-harness-lite/asset-model'
import { type JsonNumber } from '@omne-harness-lite/content-blocks'

import { type TenantId } from '@omne-harness-lite/identity-values'
import { type Instant } from '@omne-harness-lite/offer-expiry'

export type RegistryHistoryCategory =
  'plugin' | 'tool' | 'skill' | 'loop_extension' | 'mcp' | 'slash_command'
export interface RegistryHistoryRequest {
  readonly session: string
  readonly tenant: TenantId
  readonly category: RegistryHistoryCategory
  readonly filledAt: Instant
  readonly capability: CapabilityId
  readonly asset: string
  readonly version: JsonNumber
}
export type RegistryHistoryStage =
  | 'stopped'
  | 'session_tenancy'
  | 'manifest'
  | 'history_binding'
  | 'current_membership'
  | 'source'
  | 'body_provider'
  | 'storage'
export type RegistryHistoryResult =
  | { readonly version: AssetVersion }
  | { readonly failure: 'invalidInput' }
  | { readonly failure: 'unavailable'; readonly stage: RegistryHistoryStage }
