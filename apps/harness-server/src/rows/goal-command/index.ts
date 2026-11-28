import type { Context, Plugin } from '@deepseek-ai/cordis'
import { createGoalCommandSource } from '@omne-harness/goal-command'
import {
  commandEntrySourcesKey,
  type CommandEntrySourcesService,
} from '@omne-harness/slash-command-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

const goalCommandPlugin: Plugin.Object = {
  name: 'goal-command',
  inject: [commandEntrySourcesKey],
  apply(ctx: Context) {
    const sources = ctx.get(commandEntrySourcesKey) as CommandEntrySourcesService<unknown>
    sources.contribute(createGoalCommandSource<unknown>(), { official: true })
  },
}

/** The side of goals that knows commands: its official entrance source, which hands out `/goal`. */
export const goalCommandRow = defineRow({
  row: 'goal-command',
  implementation: 'real',
  manifest: { provides: [], injects: [commandEntrySourcesKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: goalCommandPlugin,
})
