import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { scheduleProtocol } from '@omne-harness/schedule-protocol'
import { createScheduleContribution } from './contribution.ts'
import type { ScheduleAccessClock, ScheduleFaces, SchedulePrincipals } from './ports.ts'

export type ScheduleAccessPluginInput = Readonly<{
  principals: (ctx: Context) => SchedulePrincipals
  faces: (ctx: Context) => ScheduleFaces | undefined
  requestId: () => string
  clock: ScheduleAccessClock
}>

const SCHEDULE_ACCESS_PLUGIN = 'schedule-access'

export function createScheduleAccessPlugin(input: ScheduleAccessPluginInput): Plugin.Object {
  return {
    name: SCHEDULE_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${SCHEDULE_ACCESS_PLUGIN}.contribution`,
          protocol: scheduleProtocol,
          handlers: () =>
            createScheduleContribution({
              principals: input.principals(ctx),
              faces: () => input.faces(ctx),
              requestId: input.requestId,
              clock: input.clock,
            }),
        }),
      )
    },
  }
}
