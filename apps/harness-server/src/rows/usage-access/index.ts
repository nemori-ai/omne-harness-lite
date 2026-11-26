import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { UsageFace, UsagePrincipals } from '@omne-harness/usage-access'
import { createUsageAccessPlugin } from '@omne-harness/usage-access/cordis'
import { usageKey } from '@omne-harness/usage-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

function usagePrincipals(ctx: Context): UsagePrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

const plugin = createUsageAccessPlugin({
  principals: usagePrincipals,
  usage: ctx => ctx.get(usageKey) as UsageFace | undefined,
})

export const usageAccessRow = defineRow({
  row: 'usage-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  swap: 'implementation',
  plugin: { ...plugin, inject: [accessRegistryKey, principalIssuerKey] },
})
