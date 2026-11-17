import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { calendarProtocol } from '@omne-harness/calendar-protocol'
import { createCalendarContribution } from './contribution.ts'
import type { CalendarFaces, CalendarPrincipals } from './ports.ts'

export type CalendarAccessPluginInput = Readonly<{
  principals: (ctx: Context) => CalendarPrincipals
  faces: (ctx: Context) => CalendarFaces | undefined
  requestId: () => string
}>

const CALENDAR_ACCESS_PLUGIN = 'calendar-access'

export function createCalendarAccessPlugin(input: CalendarAccessPluginInput): Plugin.Object {
  return {
    name: CALENDAR_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${CALENDAR_ACCESS_PLUGIN}.contribution`,
          protocol: calendarProtocol,
          handlers: () =>
            createCalendarContribution({
              principals: input.principals(ctx),
              faces: () => input.faces(ctx),
              requestId: input.requestId,
            }),
        }),
      )
    },
  }
}
