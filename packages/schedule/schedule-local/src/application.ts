import {
  createScheduleManagementApplication,
  createSchedulePredictionService,
  createScheduleQueryApplication,
  type ScheduleManagementDependencies,
  type SchedulePredictionDependencies,
  type ScheduleQueryDependencies,
} from '@omne-harness/schedule'
import type {
  ScheduleCommands,
  ScheduleJobs,
  ScheduleQueries,
} from '@omne-harness/schedule-contract'
import { createScheduleCalculationWorker } from './calculation-worker/index.ts'
import {
  createScheduleManagementSqlBackend,
  type ScheduleManagementSqlOptions,
} from './storage/index.ts'
import { ScheduleLocalLifetime, stoppedError } from './lifetime.ts'
import { createScheduleDispatcher, type ScheduleDispatchOptions } from './dispatch.ts'
import { createScheduleHistoryReader, createScheduleJobs } from './jobs.ts'

export type ScheduleLocalOptions = Readonly<{
  sql: ScheduleManagementSqlOptions
  worker: Parameters<typeof createScheduleCalculationWorker>[0]
  prediction: Omit<SchedulePredictionDependencies, 'calculator'>
  management: Omit<
    ScheduleManagementDependencies,
    'store' | 'persistence' | 'definitions' | 'executor'
  >
  query: Omit<
    ScheduleQueryDependencies,
    'store' | 'prediction' | 'clock' | 'monotonicClock' | 'history'
  >
  /** Absent: nothing disposes due slots in this application (a read-only or management-only use). */
  dispatch?: ScheduleDispatchOptions
}>

export type ScheduleLocalApplication = Readonly<{
  commands: ScheduleCommands
  queries: ScheduleQueries
  /** One round of the dispatcher now; absent without dispatch. */
  round?: () => Promise<unknown>
  /** Reading, cancelling and directly starting Jobs; absent without dispatch. */
  jobs?: ScheduleJobs
  close(): Promise<void>
}>

export async function createScheduleLocalApplication(
  options: ScheduleLocalOptions,
): Promise<ScheduleLocalApplication> {
  const backend = createScheduleManagementSqlBackend(options.sql)
  const worker = createScheduleCalculationWorker(options.worker)
  try {
    const prediction = createSchedulePredictionService({
      ...options.prediction,
      calculator: worker.calculator,
    })
    const { commands } = createScheduleManagementApplication({
      ...options.management,
      ...backend,
      definitions: prediction.definitions,
      ...(options.dispatch === undefined ? {} : { executor: options.dispatch.executor }),
    })
    const { queries } = createScheduleQueryApplication({
      ...options.query,
      history: createScheduleHistoryReader(options.sql),
      store: backend.store,
      prediction,
      clock: options.management.clock,
      monotonicClock: options.prediction.monotonicClock,
    })
    const dispatcher =
      options.dispatch === undefined
        ? undefined
        : createScheduleDispatcher(options.sql, prediction, options.dispatch)
    dispatcher?.start()
    const dispose = async () => {
      await dispatcher?.close()
      await worker.dispose()
    }
    const jobs =
      dispatcher === undefined || options.dispatch === undefined
        ? undefined
        : createScheduleJobs({
            sql: options.sql,
            owner: options.dispatch.owner,
            queries,
            authorizer: options.query.authorizer,
            dispatcher,
            executor: options.dispatch.executor,
          })
    const managed = dispatcher === undefined ? commands : waking(commands, dispatcher.wake)
    return {
      ...bindLifetime(managed, queries, dispose, jobs),
      ...(dispatcher === undefined ? {} : { round: dispatcher.round }),
    }
  } catch (error) {
    try {
      await worker.dispose()
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Schedule initialization and cleanup failed')
    }
    throw error
  }
}

/** A committed management command wakes the dispatcher: what it changed is seen now, not a round later. */
function waking(commands: ScheduleCommands, wake: () => void): ScheduleCommands {
  const told = async <T extends { kind: string }>(answer: Promise<T>): Promise<T> => {
    const result = await answer
    if (result.kind === 'committed') wake()
    return result
  }
  return {
    ...commands,
    create: (context, input) => told(commands.create(context, input)),
    execute: (context, input) => told(commands.execute(context, input)),
  }
}

function bindLifetime(
  commands: ScheduleCommands,
  queries: ScheduleQueries,
  dispose: () => Promise<void>,
  jobs: ScheduleJobs | undefined,
): ScheduleLocalApplication {
  const lifetime = new ScheduleLocalLifetime()
  const rejected = () => ({ kind: 'rejected' as const, error: stoppedError() })
  const failed = () => ({ kind: 'error' as const, error: stoppedError() })
  return {
    commands: {
      create: (context, input) => lifetime.run(() => commands.create(context, input), rejected),
      execute: (context, input) => lifetime.run(() => commands.execute(context, input), rejected),
      queryOperation: (context, input) =>
        lifetime.run(() => commands.queryOperation(context, input), failed),
    },
    queries: {
      list: (context, input) => lifetime.run(() => queries.list(context, input), failed),
      get: (context, input) => lifetime.run(() => queries.get(context, input), failed),
      revisions: (context, input) => lifetime.run(() => queries.revisions(context, input), failed),
      executions: (context, input) =>
        lifetime.run(() => queries.executions(context, input), failed),
      agenda: (context, input) => lifetime.run(() => queries.agenda(context, input), failed),
      preview: (context, input) => lifetime.run(() => queries.preview(context, input), failed),
    },
    ...(jobs === undefined
      ? {}
      : {
          jobs: {
            get: (context, input) => lifetime.run(() => jobs.get(context, input), failed),
            cancel: (context, input) => lifetime.run(() => jobs.cancel(context, input), failed),
            queryCancel: (context, input) =>
              lifetime.run(() => jobs.queryCancel(context, input), failed),
            start: (context, input) => lifetime.run(() => jobs.start(context, input), failed),
            queryStart: (context, input) =>
              lifetime.run(() => jobs.queryStart(context, input), failed),
          },
        }),
    close: () => lifetime.close(dispose),
  }
}
