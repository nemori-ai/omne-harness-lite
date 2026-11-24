import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  ScheduleCommands,
  ScheduleJobExecutor,
  ScheduleProgram,
  ScheduleQueries,
  ScheduleResultCarrier,
  ScheduleWorkPath,
} from '@omne-harness/schedule-contract'

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

/** @owner packages/schedule/schedule-cordis-contract
 * The programs program work can name: a row registers one and withdraws only its own. */
export abstract class ScheduleProgramsService extends Service {
  static readonly provide = 'schedulePrograms'

  constructor(ctx: Context) {
    super(ctx, ScheduleProgramsService.provide)
  }

  abstract register(program: ScheduleProgram): () => void
  abstract get(name: string): ScheduleProgram | undefined
}
export const scheduleProgramsKey = ScheduleProgramsService.provide

/** @owner packages/schedule/schedule-cordis-contract
 * The executors, one per path of work; a row registers one and withdraws only its own. */
export abstract class ScheduleExecutorsService extends Service {
  static readonly provide = 'scheduleExecutors'

  constructor(ctx: Context) {
    super(ctx, ScheduleExecutorsService.provide)
  }

  abstract register(path: ScheduleWorkPath, executor: ScheduleJobExecutor): () => void
  abstract get(path: ScheduleWorkPath): ScheduleJobExecutor | undefined
}
export const scheduleExecutorsKey = ScheduleExecutorsService.provide

/** @owner packages/schedule/schedule-cordis-contract
 * The carriers of results and notices; a row registers one and withdraws only its own. */
export abstract class ScheduleCarriersService extends Service {
  static readonly provide = 'scheduleCarriers'

  constructor(ctx: Context) {
    super(ctx, ScheduleCarriersService.provide)
  }

  abstract register(carrier: ScheduleResultCarrier): () => void
  abstract has(carrier: ScheduleResultCarrier): boolean
}
export const scheduleCarriersKey = ScheduleCarriersService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    scheduleCommands: ScheduleCommandsService
    scheduleQueries: ScheduleQueriesService
    schedulePrograms: ScheduleProgramsService
    scheduleExecutors: ScheduleExecutorsService
    scheduleCarriers: ScheduleCarriersService
  }
}
