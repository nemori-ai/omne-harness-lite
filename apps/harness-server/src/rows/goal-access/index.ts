import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { GoalEntrance } from '@omne-harness/goal-access'
import { createGoalAccessPlugin } from '@omne-harness/goal-access/cordis'
import { goalsKey } from '@omne-harness/goal-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { accountCodec, tenantCodec } from '@omne-harness/legal-identity'
import { defineRow } from '../../row.ts'
import { goalHolder } from '../goal/holder.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

/** The person at the panel is a member acting for their own tenant: the goals' authority verifies that principal itself, and the history names the tenant's account. */
function entrance(ctx: Context): GoalEntrance {
  const actForMember = memberActingOfCall(ctx)
  return {
    async admit(login, tenant) {
      const text = tenantCodec.encode(tenant)
      const account = accountCodec.encode(tenant.account)
      if (!text.ok || !account.ok) return { kind: 'basis-unavailable' }
      const issued = await actForMember(login, text.value)
      if (issued.outcome === 'denied') return { kind: 'denied' }
      if (issued.outcome !== 'issued') return { kind: 'basis-unavailable' }
      return { kind: 'admitted', subject: issued.principal, by: account.value }
    },
  }
}

const plugin = createGoalAccessPlugin({
  goals: ctx => ctx.get(goalsKey),
  entrance,
  changes: ctx => goalHolder(ctx).changes ?? undefined,
})

export const goalAccessRow = defineRow({
  row: 'goal-access',
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
