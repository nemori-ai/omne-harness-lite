// The port that the governance location needs for the four setting operations (SPEC「设置项」).
// This member declares it in its own words; the assembly implements it over Settings and the
// custody that holds the secrets. The entry hands the port the acting principal it issued for the
// login and the acting tenant, and the port decides whether that access may manage the item. The
// port has management only: it lists, writes, describes and clears, and never gives a secret back.
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  SettingAssetSelector,
  SettingItemView,
  SettingState,
} from '@omne-harness/public-contract'
import type { Instant } from '@omne-harness/utc-instant'

/** The access of one request: the principal issued for the login, acting for the acting tenant. */
export type SettingsAccess = Readonly<{ principal: ActingForTenantPrincipal; tenant: TenantId }>

/** One setting item: the asset that declares it and the item identifier. */
export type SettingRef = Readonly<{ asset: SettingAssetSelector; item: string }>

export type SettingsListOutcome =
  | Readonly<{ kind: 'succeeded'; items: readonly SettingItemView[] }>
  | Readonly<{ kind: 'denied' | 'basis-unavailable' }>

/** `unknown`: the write may have committed; the caller describes the item before it tries again. */
export type SettingsSetOutcome =
  | Readonly<{ kind: 'succeeded'; configuredAt: Instant }>
  | Readonly<{
      kind: 'denied' | 'not-visible' | 'conflict' | 'not-writable' | 'basis-unavailable' | 'unknown'
    }>

export type SettingsDescribeOutcome =
  | Readonly<{ kind: 'succeeded'; setting: SettingState }>
  | Readonly<{ kind: 'denied' | 'not-visible' | 'conflict' | 'not-writable' | 'basis-unavailable' }>

/** `no-change`: no secret was configured for the item. */
export type SettingsClearOutcome =
  | Readonly<{ kind: 'succeeded' | 'no-change' }>
  | Readonly<{
      kind: 'denied' | 'not-visible' | 'conflict' | 'not-writable' | 'basis-unavailable' | 'unknown'
    }>

/**
 * The settings of the acting tenant. A method that rejects gives the entry no result: `set` and
 * `clear` answer `unknown`, `list` and `describe` answer `basis-unavailable`. The secret goes in
 * through `set` only; no result carries it.
 */
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
