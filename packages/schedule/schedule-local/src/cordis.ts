import type { Context } from '@deepseek-ai/cordis'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { calendarQueryKey } from '@omne-harness/calendar-cordis-contract/cordis'
import {
  ScheduleCommandsService,
  ScheduleQueriesService,
} from '@omne-harness/schedule-cordis-contract/cordis'
import type { ScheduleCommands, ScheduleQueries } from '@omne-harness/schedule-contract'
import { createScheduleLocalApplication, type ScheduleLocalOptions } from './application.ts'

export type ScheduleLocalConfiguration = Omit<ScheduleLocalOptions, 'sql' | 'prediction'> & {
  sql: Omit<ScheduleLocalOptions['sql'], 'storage'>
  prediction: Omit<ScheduleLocalOptions['prediction'], 'calendar'>
}

class LocalCommands extends ScheduleCommandsService {
  readonly create: ScheduleCommands['create']
  readonly execute: ScheduleCommands['execute']
  readonly queryOperation: ScheduleCommands['queryOperation']

  constructor(ctx: Context, commands: ScheduleCommands) {
    super(ctx)
    this.create = commands.create
    this.execute = commands.execute
    this.queryOperation = commands.queryOperation
  }
}

class LocalQueries extends ScheduleQueriesService {
  readonly list: ScheduleQueries['list']
  readonly get: ScheduleQueries['get']
  readonly revisions: ScheduleQueries['revisions']
  readonly executions: ScheduleQueries['executions']
  readonly agenda: ScheduleQueries['agenda']
  readonly preview: ScheduleQueries['preview']

  constructor(ctx: Context, queries: ScheduleQueries) {
    super(ctx)
    this.list = queries.list
    this.get = queries.get
    this.revisions = queries.revisions
    this.executions = queries.executions
    this.agenda = queries.agenda
    this.preview = queries.preview
  }
}

export function createScheduleLocalPlugin() {
  return {
    name: 'schedule-local',
    inject: [storageKey, calendarQueryKey],
    async apply(ctx: Context, config: ScheduleLocalConfiguration) {
      const application = await createScheduleLocalApplication({
        ...config,
        sql: { ...config.sql, storage: ctx.storage },
        prediction: { ...config.prediction, calendar: ctx.calendarQuery },
      })
      try {
        const commands = ctx.plugin(LocalCommands, application.commands)
        const queries = ctx.plugin(LocalQueries, application.queries)
        ctx.effect(() => () => application.close(), 'schedule-local-drain')
        await Promise.all([commands.await(), queries.await()])
      } catch (error) {
        try {
          await application.close()
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], 'Schedule binding and cleanup failed')
        }
        throw error
      }
    },
  }
}
