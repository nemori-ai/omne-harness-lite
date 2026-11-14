// The ports this member asks for, in its own words. The application assembly adapts them: identity
// answers the principal port, the tenant settings face of the assets side the settings port. The
// handlers take each port at every call.
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'

/**
 * Issues the principal of this login for this target tenant. The rule belongs to identity: the
 * account of the target tenant must be the account of the login.
 */
export interface TargetTenantPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

/** A plain JSON value, as the settings face reads and writes it. */
export type SettingJson =
  | string
  | number
  | boolean
  | null
  | SettingJson[]
  | { [key: string]: SettingJson }

export type AssetQuery = Readonly<{ category?: string; name: string }>
export type AssetRef = Readonly<{ category: string; name: string }>
export type Presence = Readonly<{ kind: 'unset' }> | Readonly<{ kind: 'set'; value: SettingJson }>
export type Editable =
  | Readonly<{ kind: 'yes' }>
  | Readonly<{ kind: 'no'; reason: 'locked' | 'not-a-source' | 'prohibited-above' }>
export type SecretState = 'unset' | 'available' | 'revoked' | 'unreadable'
type Layer = 'default' | 'organization' | 'tenant'

/** One item of the tenant layer, in the words of the settings face (RFC-0015 §9 `SettingView`). */
export type SettingView = Readonly<{
  asset: AssetRef
  item: string
  revision: string
  declaration: Readonly<{ title: string; purpose: string; appliesAt: string; clearEffect: string }>
}> &
  (
    | Readonly<{
        kind: 'ordinary'
        valueSchema: SettingJson
        default: Presence
        own: Presence
        effective: Readonly<{ value: Presence; source: Layer | null }>
        lockedBy: 'organization' | null
        editable: Editable
      }>
    | Readonly<{
        kind: 'permission'
        choices: readonly Readonly<{
          value: string
          label: string
          description: string
          permitsOperation: boolean
        }>[]
        default: string
        own: string | null
        effective:
          | Readonly<{ kind: 'value'; value: string; source: Layer }>
          | Readonly<{ kind: 'prohibited'; by: 'organization' | 'tenant' }>
          | Readonly<{ kind: 'empty-bound' }>
        bound: readonly string[] | null
        editable: Editable
      }>
    | Readonly<{ kind: 'secret'; own: SecretState; official: SecretState; editable: Editable }>
  )

/** What a caller writes. A permission item takes a pick only. */
export type SettingInput =
  | Readonly<{ kind: 'ordinary'; value: SettingJson }>
  | Readonly<{ kind: 'permission'; pick: string }>
  | Readonly<{ kind: 'secret'; secret: string }>

/** `denied` carries no reason and cannot be told from an absent target. */
export type ReadRefusal =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'not-visible' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'unavailable' }>
/** `unavailable` is certainly not written; `unknown` may be written. */
export type WriteOutcome =
  | Readonly<{ kind: 'written'; revision: string }>
  | Readonly<{ kind: 'no-change' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'not-visible' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{
      kind: 'not-writable'
      reason: 'locked' | 'out-of-bound' | 'prohibited-above' | 'not-a-source'
    }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

type ItemInput = Readonly<{
  principal: Principal
  tenant: TenantId
  asset: AssetQuery
  item: string
}>
type WriteInput = ItemInput & Readonly<{ operation: string; expectedRevision: string }>

/**
 * The tenant-layer settings face (RFC-0015 §9「设置读写面的契约」): one method per operation. It
 * checks the principal itself; the plugin hands over what the body carries.
 */
export interface TenantSettingsPort {
  list(
    input: Readonly<{
      principal: Principal
      tenant: TenantId
      asset?: AssetQuery
      after: string | null
      limit: number
    }>,
  ): Promise<
    | Readonly<{
        kind: 'listed'
        items: readonly SettingView[]
        next: string | null
        completeness: 'complete' | 'partial'
      }>
    | ReadRefusal
  >
  describe(
    input: ItemInput,
  ): Promise<Readonly<{ kind: 'described'; item: SettingView }> | ReadRefusal>
  set(input: WriteInput & Readonly<{ value: SettingInput }>): Promise<WriteOutcome>
  clear(input: WriteInput): Promise<WriteOutcome>
}
