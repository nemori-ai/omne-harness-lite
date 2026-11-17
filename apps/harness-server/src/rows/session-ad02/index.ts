import type { Context, Plugin } from '@deepseek-ai/cordis'
import { createSessionJournalInterpretationPlugin } from '@omne-harness/session-adapters/cordis'
import {
  sessionKey,
  sessionTransactionsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'
import { coordinatorPrincipalsOf } from '../session-adapters/coordinator.ts'

const INJECTS = [
  sessionWorkPrincipalsKey,
  sessionKey,
  sessionTransactionsKey,
  storageKey,
  tenantDomainLookupKey,
]

const plugin: Plugin.Object = {
  name: 'session-ad02',
  inject: INJECTS,
  async apply(ctx: Context) {
    const interpretation = createSessionJournalInterpretationPlugin<unknown>({
      coordinator: coordinatorPrincipalsOf(ctx),
    })
    await ctx.plugin(interpretation.plugin)
  },
}

export const sessionAd02Row = defineRow({
  row: 'session-ad02',
  implementation: 'real',
  manifest: { provides: [], injects: INJECTS, sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin,
})
