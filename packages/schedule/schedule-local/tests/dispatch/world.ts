import { createScheduleJobs } from '../../src/jobs.ts'
import { createScheduleDispatchSqlStore } from '../../src/storage/index.ts'
import type { TimeSource } from '@omne-harness/time-source'
import { simulatedTime } from '@omne-harness/time-source/simulated'
import {
  ScheduleDefinitionSchema,
  type ScheduleDefinition,
  type ScheduleId,
} from '@omne-harness/schedule-contract'
import {
  createProgramExecutor,
  createScheduleDispatcher,
  createScheduleLocalApplication,
  schedulePredictor,
  type ScheduleDispatchOptions,
  type ScheduleProgram,
} from '@omne-harness/schedule-local'
import {
  createDispatcher,
  createSchedulePredictionService,
  type DispatchStore,
} from '@omne-harness/schedule'
import { createScheduleCalculationWorker } from '@omne-harness/schedule-local'
import { openWorld } from '../storage/world.ts'
import { context, now } from '../storage/data.ts'
import { localOptions } from '../assembly/fixture.ts'

export const MINUTE = 60_000
export const START = Date.parse(now)

/** A program run every minute, from before the fixed `now` of the storage fixtures. */
export function everyMinute(change: Partial<ScheduleDefinition> = {}): ScheduleDefinition {
  return ScheduleDefinitionSchema.parse({
    label: 'Every minute',
    recurrence: {
      kind: 'cron',
      expression: '* * * * *',
      begin: '2026-11-01T00:00:00',
      until: null,
    },
    limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
    binding: { kind: 'explicit', timezone: 'UTC', calendar: null },
    calendarOverlay: null,
    purpose: {
      kind: 'execution',
      work: { kind: 'program', programRef: 'probe', input: {} },
      scope: { kind: 'fleet' },
      catchUp: { kind: 'none' },
      overlap: 'parallel',
      misfire: null,
      notifications: [],
    },
    ...change,
  })
}

export type DispatchWorldOptions = Readonly<{
  root?: string
  wall?: number
  gapMs?: number
  programs?: Readonly<Record<string, ScheduleProgram>>
  standing?: ScheduleDispatchOptions['standing']
  missingCarriers?: ScheduleDispatchOptions['missingCarriers']
  /** The application runs its own dispatcher, as the release does: started with it, woken by its commands. */
  watching?: boolean
}>

/** Real SQLite, real prediction, a simulated time the test moves, and a dispatcher whose rounds the test calls. */
export async function dispatchWorld(options: DispatchWorldOptions = {}) {
  const world = await openWorld(
    options.root === undefined ? {} : { root: options.root, configure: false },
  )
  const time = simulatedTime({ wall: options.wall ?? START + 10_000 })
  const local = localOptions(world)
  const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 4 })
  const base = localOptions(world)
  const prediction = createSchedulePredictionService({
    ...base.prediction,
    calculator: worker.calculator,
  })
  const sql = {
    storage: world.storage,
    scope: world.scope,
    transactionDomain: world.combination.transactionDomain,
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
  }
  const guards = {
    participant: world.guards.participant,
    dispatch: (requirement: unknown) => ({
      participant: world.guards.participant,
      facts: { dispatch: requirement as never },
    }),
  }
  const portsOf = (generation?: string, clock: TimeSource = time.source) => {
    const programs = createProgramExecutor(name => options.programs?.[name], generation)
    return {
      executor: (work: { kind: string }) => (work.kind === 'program' ? programs : undefined),
      owner: context.owner,
      guards,
      time: clock,
      standing: options.standing ?? (async () => ({ kind: 'eligible' }) as const),
      missingCarriers: options.missingCarriers ?? (() => []),
      policy: {
        intervalMs: MINUTE,
        gapMs: options.gapMs ?? 5 * MINUTE,
        roundLimit: 20,
        classifyPages: 10,
      },
    } satisfies ScheduleDispatchOptions
  }
  const app = await createScheduleLocalApplication({
    ...local,
    management: {
      ...local.management,
      clock: { now: () => new Date(time.source.now()).toISOString() as never },
    },
    ...(options.watching ? { dispatch: portsOf() } : {}),
  })
  const dispatcher = (
    generation?: string,
    clock: TimeSource = time.source,
    wrap?: (store: DispatchStore) => DispatchStore,
  ) => {
    const ports = portsOf(generation, clock)
    if (wrap === undefined) return createScheduleDispatcher(sql, prediction, ports)
    const { guards: held, ...rest } = ports
    return createDispatcher({
      ...rest,
      store: wrap(createScheduleDispatchSqlStore({ ...sql, owner: context.owner, guards: held })),
      predict: schedulePredictor(prediction, context.owner),
    })
  }
  const create = async (definition: ScheduleDefinition, key: string): Promise<ScheduleId> => {
    const created = await app.commands.create(context, {
      definition,
      initial: { kind: 'active' },
      meta: { operationKey: key, expectedRevision: null },
    })
    if (created.kind !== 'committed') throw new Error(JSON.stringify(created))
    return created.value.scheduleId
  }
  const facet = (from: ReturnType<typeof dispatcher>) =>
    createScheduleJobs({
      sql,
      owner: context.owner,
      queries: app.queries,
      authorizer: local.query.authorizer,
      dispatcher: from,
    })
  const rows = (sql: string) => world.sql(sql) as Record<string, unknown>[]
  return {
    world,
    app,
    time,
    dispatcher,
    facet,
    create,
    rows,
    receipts: (id: string) =>
      rows(
        `SELECT slot_at, job_id, receipt FROM sc_receipts WHERE schedule_id = '${id}' ORDER BY slot_at`,
      ).map((row): Record<string, unknown> => ({
        at: row['slot_at'],
        job: row['job_id'],
        ...(JSON.parse(String(row['receipt'])) as { receipt: Record<string, unknown> }).receipt,
      })),
    jobs: (id: string) =>
      rows(
        `SELECT job_id, slot_at, state FROM sc_jobs WHERE schedule_id = '${id}' ORDER BY slot_at`,
      ),
    view: (id: string) =>
      (
        JSON.parse(
          String(
            rows(`SELECT record FROM sc_schedules WHERE schedule_id = '${id}'`)[0]?.['record'],
          ),
        ) as { view: Record<string, unknown> }
      ).view,
    /** The fixture guard stamps management commits with a configured time: make it the simulated now. */
    stamp: () => world.configure({ decisionAt: new Date(time.source.now()).toISOString() }),
    async close() {
      await app.close()
      await worker.dispose()
      await world.close()
    },
  }
}
