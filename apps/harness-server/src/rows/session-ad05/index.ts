// The `session-ad05` row (B1, R2-D136): the AD-05 Model log consumption plugin of session-adapters
// (`createSessionModelLogConsumptionPlugin`). It subscribes to `session-adapters/agent-published`,
// reads the `received` entries and materials of the Journal provider of the same session log, and
// commits the consumed entries through `commitEntries`. It injects `session` as `coordinator`,
// `agentJournal`, `agentMaterials` and `sessionTransactions`. The coordinator principal comes from
// the trusted `sessionWorkPrincipals`. No configuration: the plugin takes none.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { agentJournalKey, agentMaterialsKey } from '@omne-harness/agent-cordis-contract/cordis'
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
