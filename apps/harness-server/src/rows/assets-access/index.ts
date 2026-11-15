import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { TargetTenantPrincipals, TenantSettingsPort } from '@omne-harness/assets-access'
import { createAssetsAccessPlugin } from '@omne-harness/assets-access/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { createAccessIdentity } from '@omne-harness/identity-access'
import { defineRow } from '../../row.ts'
import { tenantSettingsKey } from '../governance/tenant-settings-service.ts'
import { governanceOfCall, identityOfCall } from '../server-entry/identity.ts'

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
