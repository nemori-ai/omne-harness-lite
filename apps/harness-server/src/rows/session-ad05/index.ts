import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { createSessionModelLogConsumptionPlugin } from '@omne-harness/session-adapters/cordis'
import {
  sessionKey,
  sessionTransactionsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { coordinatorPrincipalsOf } from '../session-adapters/coordinator.ts'

const INJECTS = [
  sessionWorkPrincipalsKey,
  sessionKey,
  agentJournalKey,
  agentJournalEntriesKey,
  agentMaterialsKey,
  sessionTransactionsKey,
]

const plugin: Plugin.Object = {
  name: 'session-ad05',
  inject: INJECTS,
  async apply(ctx: Context) {
    const consumption = createSessionModelLogConsumptionPlugin<unknown>({
      coordinator: coordinatorPrincipalsOf(ctx),
    })
    await ctx.plugin(consumption.plugin)
  },
}

export const sessionAd05Row = defineRow({
  row: 'session-ad05',
  implementation: 'real',
  manifest: { provides: [], injects: INJECTS, sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin,
})
