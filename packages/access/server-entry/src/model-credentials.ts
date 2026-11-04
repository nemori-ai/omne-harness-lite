// The port that the governance location needs for the three model credential operations (SPEC
// 「模型凭据」). This member declares it in its own words; the assembly implements it over the
// custody that holds the secrets. The entry hands the port the acting principal it issued for the
// login and the acting tenant, and the port decides whether that access may manage the binding.
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelCredentialState } from '@omne-harness/public-contract'
import type { Instant } from '@omne-harness/utc-instant'

/** The access of one request: the principal issued for the login, acting for the acting tenant. */
export type ModelCredentialAccess = Readonly<{
  principal: ActingForTenantPrincipal
  tenant: TenantId
}>

/** `unknown`: the write may have committed; the caller reads the binding before it tries again. */
export type ModelCredentialBindOutcome =
  | Readonly<{ kind: 'succeeded'; configuredAt: Instant }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'basis-unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/** `no-change`: the tenant had no binding. */
export type ModelCredentialUnbindOutcome =
  | Readonly<{ kind: 'succeeded' }>
  | Readonly<{ kind: 'no-change' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'basis-unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export type ModelCredentialDescribeOutcome =
  | Readonly<{ kind: 'succeeded'; credential: ModelCredentialState }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'basis-unavailable' }>

/**
 * The model credential binding of the acting tenant. A method that rejects gives the entry no
 * result: `bind` and `unbind` answer `unknown`, `describe` answers `basis-unavailable`. The secret
 * goes in through `bind` only; no result carries it.
 */
export interface ModelCredentialCustody {
  bind(
    input: Readonly<{ access: ModelCredentialAccess; secret: string }>,
  ): Promise<ModelCredentialBindOutcome>
  unbind(input: Readonly<{ access: ModelCredentialAccess }>): Promise<ModelCredentialUnbindOutcome>
  describe(
    input: Readonly<{ access: ModelCredentialAccess }>,
  ): Promise<ModelCredentialDescribeOutcome>
}
