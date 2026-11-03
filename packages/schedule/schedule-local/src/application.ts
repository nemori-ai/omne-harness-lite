import {
  createScheduleManagementApplication,
  createSchedulePredictionService,
  createScheduleQueryApplication,
  type ScheduleManagementDependencies,
  type SchedulePredictionDependencies,
  type ScheduleQueryDependencies,
} from '@omne-harness/schedule'
import type { ScheduleCommands, ScheduleQueries } from '@omne-harness/schedule-contract'
import { createScheduleCalculationWorker } from './calculation-worker/index.ts'
import {
  createScheduleManagementSqlBackend,
  type ScheduleManagementSqlOptions,
} from './storage/index.ts'
import { ScheduleLocalLifetime, stoppedError } from './lifetime.ts'

export type ScheduleLocalOptions = Readonly<{
  sql: ScheduleManagementSqlOptions
  worker: Parameters<typeof createScheduleCalculationWorker>[0]
  prediction: Omit<SchedulePredictionDependencies, 'calculator'>
  management: Omit<ScheduleManagementDependencies, 'store' | 'persistence' | 'definitions'>
  query: Omit<ScheduleQueryDependencies, 'store' | 'prediction' | 'clock' | 'monotonicClock'>
}>

export type ScheduleLocalApplication = Readonly<{
  commands: ScheduleCommands
  queries: ScheduleQueries
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
    })
    const { queries } = createScheduleQueryApplication({
      ...options.query,
      store: backend.store,
      prediction,
      clock: options.management.clock,
      monotonicClock: options.prediction.monotonicClock,
    })
    return bindLifetime(commands, queries, worker.dispose)
  } catch (error) {
    try {
      await worker.dispose()
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Schedule initialization and cleanup failed')
    }
    throw error
  }
}

function bindLifetime(
  commands: ScheduleCommands,
  queries: ScheduleQueries,
  dispose: () => Promise<void>,
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
    close: () => lifetime.close(dispose),
  }
}
