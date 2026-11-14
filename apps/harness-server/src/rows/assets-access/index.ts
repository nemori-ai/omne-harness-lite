// The `assets-access` row: the access plugin of `assets/v1` (RFC-0015 §5, §7, §9), from
// `@omne-harness/assets-access/cordis`. Loading this row opens `assets/v1` at the entry's new
// address; leaving it out keeps the protocol closed (RFC-0015 I-15). The row injects
// `accessRegistry`, which the `server-entry` row provides, and the trusted `principalIssuer`.
// The settings face `tenantSettings`, which the `governance` row provides, is taken at each call:
// a call while it is off the tree answers `basis-unavailable` and the protocol stays mounted.
//
// The member asks for two ports. A target tenant's principal comes from identity's own
// `AccessIdentity` (`createAccessIdentity`), built here the way the `session-access` row builds it.
// The settings port is the face itself: the face checks that the principal is the login principal
// of the tenant before it reads anything.
import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { TargetTenantPrincipals, TenantSettingsPort } from '@omne-harness/assets-access'
import { createAssetsAccessPlugin } from '@omne-harness/assets-access/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { createAccessIdentity } from '@omne-harness/identity-access'
import { defineRow } from '../../row.ts'
import { tenantSettingsKey } from '../governance/tenant-settings-service.ts'
import { governanceOfCall, identityOfCall } from '../server-entry/identity.ts'

/** `TargetTenantPrincipals` over identity's `actFor`. */
function targetTenantPrincipals(ctx: Context): TargetTenantPrincipals {
  const identity = createAccessIdentity({
    operations: identityOfCall(ctx),
    governance: governanceOfCall(ctx),
    issuer: ctx.principalIssuer,
  })
  return {
    async actingFor(login, tenant) {
      const issued = await identity.actFor(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

/** The tenant settings face of this moment. */
function settingsOf(ctx: Context): TenantSettingsPort | undefined {
  return ctx.get(tenantSettingsKey)
}

const plugin = createAssetsAccessPlugin({
  principals: targetTenantPrincipals,
  settings: settingsOf,
})

export const assetsAccessRow = defineRow({
  row: 'assets-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    ...plugin,
    inject: [accessRegistryKey, principalIssuerKey],
  },
})
