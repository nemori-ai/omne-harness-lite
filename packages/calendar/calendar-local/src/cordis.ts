import type { Context } from '@deepseek-ai/cordis'
import type { CalendarSupplyApplication } from '@omne-harness/calendar'
import type { CalendarQueries, CalendarSupply } from '@omne-harness/calendar-contract'
import {
  CalendarQueryService,
  CalendarSupplyService,
} from '@omne-harness/calendar-cordis-contract/cordis'
import { z } from 'zod'
import { CalendarAdmission, type CalendarProviderStop } from './runner/admission.ts'
import { calendarRunnerConfigurationSchema, timerDelaySchema } from './runner/configuration.ts'
import { createCalendarSupplyRunner } from './runner/index.ts'
import { drain } from './runner/drain.ts'

export type { CalendarProviderStop } from './runner/admission.ts'

function hasMethods(value: unknown, methods: readonly string[]): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    methods.every(key => typeof Reflect.get(value, key) === 'function')
  )
}
const querySchema = z.custom<CalendarQueries>(value =>
  hasMethods(value, ['list', 'get', 'effective', 'resolve']),
)
const supplySchema = z.custom<CalendarSupplyApplication>(value =>
  hasMethods(value, [
    'probe',
    'refresh',
    'importSeed',
    'queryPublication',
    'health',
    'initialize',
    'recover',
    'runDue',
    'deliverReactions',
    'stop',
  ]),
)
const observerSchema = z.strictObject({
  name: z.string().trim().min(1),
  observe: z.custom<(report: CalendarProviderStop) => void | Promise<void>>(
    value => typeof value === 'function',
  ),
})
const lifecycleShape = { drainTimeoutMs: timerDelaySchema, observer: observerSchema }
const queryConfigurationSchema = z.strictObject({
  ...lifecycleShape,
  binding: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('borrowed'), queries: querySchema }),
    z.strictObject({
      kind: z.literal('owned'),
      create: z.custom<() => CalendarQueries>(value => typeof value === 'function'),
    }),
  ]),
})
const supplyConfigurationSchema = z.strictObject({
  ...lifecycleShape,
  binding: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('borrowed'), supply: supplySchema }),
    z.strictObject({
      kind: z.literal('owned'),
      create: z.custom<() => CalendarSupplyApplication>(value => typeof value === 'function'),
      runner: calendarRunnerConfigurationSchema.nullable(),
    }),
  ]),
})
export type CalendarLocalQueryConfiguration = z.infer<typeof queryConfigurationSchema>
export type CalendarLocalSupplyConfiguration = z.infer<typeof supplyConfigurationSchema>

function lifetime(
  ctx: Context,
  config: z.infer<typeof observerSchema>,
  timeoutMs: number,
  close: () => Promise<CalendarProviderStop>,
) {
  ctx.effect(() => async () => {
    const report = await close()
    if (report.cleanup.kind === 'failed' || report.inFlight === 'retained')
      ctx.logger.warn('Calendar cleanup retained responsibility', report)
    const notification = Promise.resolve()
      .then(() => config.observe(report))
      .catch(error => {
        ctx.logger.error(`Calendar lifecycle observer ${config.name} failed`, error)
      })
    if ((await drain(notification, timeoutMs)) === 'retained')
      ctx.logger.warn(`Calendar lifecycle observer ${config.name} retained`)
  })
}

export class CalendarLocalQueryProvider extends CalendarQueryService {
  static readonly Config = queryConfigurationSchema
  readonly list: CalendarQueries['list']
  readonly get: CalendarQueries['get']
  readonly effective: CalendarQueries['effective']
  readonly resolve: CalendarQueries['resolve']
  readonly close: () => Promise<CalendarProviderStop>

  constructor(ctx: Context, config: CalendarLocalQueryConfiguration) {
    super(ctx)
    const gate = new CalendarAdmission(config.drainTimeoutMs)
    this.close = () => gate.close()
    lifetime(ctx, config.observer, config.drainTimeoutMs, this.close)
    const queries =
      config.binding.kind === 'borrowed'
        ? config.binding.queries
        : querySchema.parse(config.binding.create())
    this.list = (context, input) => gate.invoke(context, () => queries.list(context, input))
    this.get = (context, input) => gate.invoke(context, () => queries.get(context, input))
    this.effective = context => gate.invoke(context, () => queries.effective(context))
    this.resolve = (context, input) => gate.invoke(context, () => queries.resolve(context, input))
  }
}

export class CalendarLocalSupplyProvider extends CalendarSupplyService {
  static readonly Config = supplyConfigurationSchema
  readonly probe: CalendarSupply['probe']
  readonly refresh: CalendarSupply['refresh']
  readonly importSeed: CalendarSupply['importSeed']
  readonly queryPublication: CalendarSupply['queryPublication']
  readonly health: CalendarSupply['health']
  readonly close: () => Promise<CalendarProviderStop>

  constructor(ctx: Context, config: CalendarLocalSupplyConfiguration) {
    super(ctx)
    const supply =
      config.binding.kind === 'borrowed'
        ? config.binding.supply
        : supplySchema.parse(config.binding.create())
    const gate = new CalendarAdmission(config.drainTimeoutMs)
    const runner =
      config.binding.kind === 'owned' && config.binding.runner
        ? createCalendarSupplyRunner({ ...config.binding.runner, supply })
        : null
    const release =
      config.binding.kind === 'borrowed'
        ? undefined
        : () => (runner ? runner.stop() : supply.stop())
    this.close = () => gate.close(release)
    lifetime(ctx, config.observer, config.drainTimeoutMs, this.close)
    this.probe = (context, input) => gate.invoke(context, () => supply.probe(context, input))
    this.refresh = (context, input) => gate.invoke(context, () => supply.refresh(context, input))
    this.importSeed = (context, input) =>
      gate.invoke(context, () => supply.importSeed(context, input))
    this.queryPublication = (context, input) =>
      gate.invoke(context, () => supply.queryPublication(context, input))
    this.health = (context, input) => gate.invoke(context, () => supply.health(context, input))
    if (runner)
      void runner.start().catch(error => {
        ctx.logger.error('Calendar runner failed', error)
      })
  }
}
