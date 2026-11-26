import type { Context, Plugin } from '@deepseek-ai/cordis'
import { createGoalCheck } from '@omne-harness/goal-check'
import { goalCheckingKey } from '@omne-harness/goal-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { checkSubject } from '../goal/check-subject.ts'
import { SYSTEM_EXTENSIONS_KEY, type SystemExtensionsRegistry } from '../system-extensions/index.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { verifySessionWork } from '../tool-runtime/session-work.ts'

export const GOAL_CHECK_PROVIDER = 'goal-check'

const goalCheckPlugin: Plugin.Object = {
  name: 'goal-check',
  inject: [SYSTEM_EXTENSIONS_KEY],
  apply(ctx: Context) {
    const check = createGoalCheck<unknown>({
      checking: () => ctx.get(goalCheckingKey),
      async sessionOf(principal, tenant) {
        const work = await verifySessionWork(toolRuntimeHolder(ctx).verifier(), principal, tenant)
        if (work.kind === 'unavailable') return 'unavailable'
        return work.kind === 'session' ? work.session : null
      },
      callerOf: (principal, tenant) => ({ tenant, subject: checkSubject(principal) }),
    })
    const registry = ctx.get(SYSTEM_EXTENSIONS_KEY) as SystemExtensionsRegistry
    registry.contribute(ctx, {
      name: GOAL_CHECK_PROVIDER,
      members: check.members,
      invoke: check.invoke,
    })
  },
}

/** The side of goals that knows Agent: its check before a round ends and its reminder after a compaction, as system extensions. */
export const goalCheckRow = defineRow({
  row: 'goal-check',
  implementation: 'real',
  manifest: { provides: [], injects: [SYSTEM_EXTENSIONS_KEY], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: goalCheckPlugin,
})
