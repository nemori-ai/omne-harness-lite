import type { Context } from '@deepseek-ai/cordis'
import {
  scheduleCommandsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import { toolBindingsKey, toolGenerationsKey } from '@omne-harness/tool-cordis-contract/cordis'
import {
  contributeTool,
  type ToolAuthorConfiguration,
  type ToolAuthorContext,
} from '@omne-harness/tool-host-local/author'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import type { ScheduleToolEnvironment } from './environment.ts'
import { createScheduleToolModule } from './author.ts'
export type ScheduleToolConfiguration = ToolAuthorConfiguration<
  ScheduleToolEnvironment,
  ToolMessageContentBlock
>
export function createScheduleToolsPlugin<P>(input: ToolAuthorContext<P>) {
  return {
    name: 'schedule-tools',
    inject: [scheduleCommandsKey, scheduleQueriesKey, toolBindingsKey, toolGenerationsKey],
    async apply(ctx: Context, config: ScheduleToolConfiguration) {
      const capabilities = new Set(input.asset.requiredCapabilities)
      if (
        capabilities.size !== 2 ||
        !capabilities.has('schedule.read') ||
        !capabilities.has('schedule.write')
      )
        throw new Error('Schedule tools require schedule.read and schedule.write')
      await contributeTool(
        ctx,
        config,
        createScheduleToolModule({ commands: ctx.scheduleCommands, queries: ctx.scheduleQueries }),
        input,
      )
    },
  }
}
