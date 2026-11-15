import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  SettingAssetSelector,
  SettingItemView,
  SettingLayers,
} from '@omne-harness/public-contract'
import type { Instant } from '@omne-harness/utc-instant'

export type SettingsAccess = Readonly<{ principal: ActingForTenantPrincipal; tenant: TenantId }>

export type SettingRef = Readonly<{ asset: SettingAssetSelector; item: string }>

export type SettingsListOutcome =
  | Readonly<{ kind: 'succeeded'; items: readonly SettingItemView[] }>
  | Readonly<{ kind: 'denied' | 'basis-unavailable' }>

export type SettingsSetOutcome =
  | Readonly<{ kind: 'succeeded'; configuredAt: Instant }>
  | Readonly<{
      kind: 'denied' | 'not-visible' | 'conflict' | 'not-writable' | 'basis-unavailable' | 'unknown'
    }>

export type SettingsDescribeOutcome =
  | Readonly<{ kind: 'succeeded'; setting: SettingLayers }>
  | Readonly<{ kind: 'denied' | 'not-visible' | 'conflict' | 'not-writable' | 'basis-unavailable' }>

export type SettingsClearOutcome =
  | Readonly<{ kind: 'succeeded' | 'no-change' }>
  | Readonly<{
      kind: 'denied' | 'not-visible' | 'conflict' | 'not-writable' | 'basis-unavailable' | 'unknown'
    }>

export interface SettingsGovernance {
  list(
    input: Readonly<{ access: SettingsAccess; asset?: SettingAssetSelector }>,
  ): Promise<SettingsListOutcome>
  set(
    input: Readonly<{ access: SettingsAccess; secret: string } & SettingRef>,
  ): Promise<SettingsSetOutcome>
  describe(
    input: Readonly<{ access: SettingsAccess } & SettingRef>,
  ): Promise<SettingsDescribeOutcome>
  clear(input: Readonly<{ access: SettingsAccess } & SettingRef>): Promise<SettingsClearOutcome>
}
