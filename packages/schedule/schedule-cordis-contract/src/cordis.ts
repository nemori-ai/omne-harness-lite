import { Service, type Context } from '@deepseek-ai/cordis'
import type { ScheduleCommands, ScheduleQueries } from '@omne-harness/schedule-contract'

/** @owner packages/schedule/schedule-cordis-contract */
export abstract class ScheduleCommandsService extends Service implements ScheduleCommands {
  static readonly provide = 'scheduleCommands'

  constructor(ctx: Context) {
    super(ctx, ScheduleCommandsService.provide)
  }

  abstract readonly create: ScheduleCommands['create']
  abstract readonly execute: ScheduleCommands['execute']
  abstract readonly queryOperation: ScheduleCommands['queryOperation']
}
export const scheduleCommandsKey = ScheduleCommandsService.provide

/** @owner packages/schedule/schedule-cordis-contract */
export abstract class ScheduleQueriesService extends Service implements ScheduleQueries {
  static readonly provide = 'scheduleQueries'

  constructor(ctx: Context) {
    super(ctx, ScheduleQueriesService.provide)
  }

  abstract readonly list: ScheduleQueries['list']
  abstract readonly get: ScheduleQueries['get']
  abstract readonly revisions: ScheduleQueries['revisions']
  abstract readonly executions: ScheduleQueries['executions']
  abstract readonly agenda: ScheduleQueries['agenda']
  abstract readonly preview: ScheduleQueries['preview']
}
export const scheduleQueriesKey = ScheduleQueriesService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    scheduleCommands: ScheduleCommandsService
    scheduleQueries: ScheduleQueriesService
  }
}
