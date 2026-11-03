import type { Context } from '@deepseek-ai/cordis'
import { calendarQueryKey } from '@omne-harness/calendar-cordis-contract/cordis'
import { toolBindingsKey, toolGenerationsKey } from '@omne-harness/tool-cordis-contract/cordis'
import {
  contributeTool,
  type ToolAuthorConfiguration,
  type ToolAuthorContext,
} from '@omne-harness/tool-host-local/author'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import type { CalendarToolEnvironment } from './environment.ts'
import { createCalendarToolModule } from './author.ts'

export type CalendarToolConfiguration = ToolAuthorConfiguration<
  CalendarToolEnvironment,
  ToolMessageContentBlock
>
export function createCalendarToolsPlugin<P>(input: ToolAuthorContext<P>) {
  return {
    name: 'calendar-tools',
    inject: [calendarQueryKey, toolBindingsKey, toolGenerationsKey],
    async apply(ctx: Context, config: CalendarToolConfiguration) {
      if (
        !input.asset.requiredCapabilities.includes('calendar.read') ||
        input.asset.requiredCapabilities.some(capability => capability !== 'calendar.read')
      )
        throw new Error('Calendar tools require only calendar.read')
      await contributeTool(ctx, config, createCalendarToolModule(ctx.calendarQuery), input)
    },
  }
}
