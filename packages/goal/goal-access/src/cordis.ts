import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { goalProtocol } from '@omne-harness/goal-protocol'
import { createGoalContribution } from './contribution.ts'
import type { GoalChangeFeed, GoalEntrance, GoalFace } from './ports.ts'

export type GoalAccessPluginInput = Readonly<{
  goals: (ctx: Context) => GoalFace | undefined
  entrance: (ctx: Context) => GoalEntrance
  changes: (ctx: Context) => GoalChangeFeed | undefined
}>

const GOAL_ACCESS_PLUGIN = 'goal-access'

export function createGoalAccessPlugin(input: GoalAccessPluginInput): Plugin.Object {
  return {
    name: GOAL_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${GOAL_ACCESS_PLUGIN}.contribution`,
          protocol: goalProtocol,
          handlers: () =>
            createGoalContribution({
              goals: () => input.goals(ctx),
              entrance: input.entrance(ctx),
              changes: () => input.changes(ctx),
            }),
        }),
      )
    },
  }
}
