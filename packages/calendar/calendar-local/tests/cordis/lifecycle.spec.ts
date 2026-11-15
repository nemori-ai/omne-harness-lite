import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import {
  calendarIdSchema,
  calendarPublicationQuerySchema,
  type CalendarQueries,
  type CalendarSupply,
} from '@omne-harness/calendar-contract'
import { calendarQueryKey, calendarSupplyKey } from '@omne-harness/calendar-cordis-contract/cordis'
import {
  CalendarLocalQueryProvider,
  CalendarLocalSupplyProvider,
  type CalendarProviderStop,
} from '../../src/cordis.ts'
import { application, context } from '../runner/fixture.ts'

const roots: Context[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await root.fiber.dispose()
})
function root() {
  const value = new Context()
  roots.push(value)
  return value
}
const intent = {
  calendarId: calendarIdSchema.parse('us-federal-holidays'),
  policyVersion: 'policy',
  operationKey: 'stable',
}
function lifecycle() {
  const reports: CalendarProviderStop[] = []
  return {
    reports,
    config: {
      drainTimeoutMs: 5,
      observer: {
        name: 'lifecycle-test',
        observe: (report: CalendarProviderStop) => {
          reports.push(report)
        },
      },
    },
  }
}
function queries() {
  const error = {
    kind: 'error',
    error: {
      code: 'missing_environment',
      message: 'fixture',
      requestId: context.requestId,
      retryable: false,
      details: {},
    },
  } as const
  return {
    list: vi.fn<CalendarQueries['list']>().mockResolvedValue(error),
    get: vi.fn<CalendarQueries['get']>().mockResolvedValue(error),
    effective: vi.fn<CalendarQueries['effective']>().mockResolvedValue(error),
    resolve: vi.fn<CalendarQueries['resolve']>().mockResolvedValue(error),
  }
}

it('injects the shared query definition and unloads query without stopping borrowed supply', async () => {
  const ctx = root(),
    q = queries(),
    supply = application(),
    life = lifecycle()
  const provider = ctx.plugin(CalendarLocalQueryProvider, {
    ...life.config,
    binding: { kind: 'borrowed', queries: q },
  })
  const supplyProvider = ctx.plugin(CalendarLocalSupplyProvider, {
    ...life.config,
    binding: { kind: 'borrowed', supply },
  })
  await Promise.all([provider.await(), supplyProvider.await()])
  const consumer = ctx.inject([calendarQueryKey], async child => {
    await child.calendarQuery.list(context)
  })
  await consumer.await()
  expect(q.list).toHaveBeenCalledOnce()
  const old = ctx.get(calendarQueryKey)
  if (!old) throw new Error('Missing query service')
  const getInput = { calendarId: intent.calendarId }
  expect(await old.get(context, getInput)).toMatchObject({
    kind: 'error',
    error: { code: 'missing_environment' },
  })
  expect(await old.effective(context)).toMatchObject({
    kind: 'error',
    error: { code: 'missing_environment' },
  })
  expect(q.get).toHaveBeenCalledWith(context, getInput)
  expect(q.effective).toHaveBeenCalledWith(context)
  await provider.dispose()
  expect(await old?.list(context)).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure' },
  })
  expect(q.list).toHaveBeenCalledOnce()
  expect(await old.get(context, getInput)).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure' },
  })
  expect(await old.effective(context)).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure' },
  })
  expect(q.get).toHaveBeenCalledOnce()
  expect(q.effective).toHaveBeenCalledOnce()
  expect(await ctx.get(calendarSupplyKey)?.refresh(context, intent)).toMatchObject({
    kind: 'ok',
    value: { kind: 'unknown' },
  })
  await supplyProvider.dispose()
  expect(supply.stop).not.toHaveBeenCalled()
})

it('rejects incomplete borrowed capabilities and noncallable local factories at the config boundary', () => {
  const life = lifecycle()
  for (const value of [null, {}, { ...queries(), get: null }]) {
    expect(
      CalendarLocalQueryProvider.Config.safeParse({
        ...life.config,
        binding: { kind: 'borrowed', queries: value },
      }).success,
    ).toBe(false)
  }
  for (const value of [null, {}, { ...application(), stop: null }]) {
    expect(
      CalendarLocalSupplyProvider.Config.safeParse({
        ...life.config,
        binding: { kind: 'borrowed', supply: value },
      }).success,
    ).toBe(false)
  }
  expect(
    CalendarLocalQueryProvider.Config.safeParse({
      ...life.config,
      binding: { kind: 'owned', create: null },
    }).success,
  ).toBe(false)
  expect(
    CalendarLocalSupplyProvider.Config.safeParse({
      ...life.config,
      binding: { kind: 'owned', create: null, runner: null },
    }).success,
  ).toBe(false)
  expect(
    CalendarLocalQueryProvider.Config.safeParse({
      ...life.config,
      observer: { name: 'observer', observe: null },
      binding: { kind: 'borrowed', queries: queries() },
    }).success,
  ).toBe(false)
})

it('closes owned supply admission, retains a late original result and never republishes an entry', async () => {
  const ctx = root(),
    supply = application(),
    life = lifecycle()
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof supply.refresh>>>()
  supply.refresh.mockReturnValue(pending.promise)
  const provider = ctx.plugin(CalendarLocalSupplyProvider, {
    ...life.config,
    binding: { kind: 'owned', create: () => supply, runner: null },
  })
  await provider.await()
  const old = ctx.get(calendarSupplyKey)
  const original = old?.refresh(context, intent)
  await Promise.resolve()
  await provider.dispose()
  expect(supply.stop).toHaveBeenCalledOnce()
  expect(life.reports).toContainEqual(
    expect.objectContaining({ inFlight: 'retained', pendingCalls: 1 }),
  )
  expect(await old?.refresh(context, intent)).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure' },
  })
  expect(supply.refresh).toHaveBeenCalledOnce()
  pending.resolve({ kind: 'ok', value: { kind: 'unknown', operationRef: 'original-run' } })
  expect(await original).toMatchObject({
    kind: 'ok',
    value: { kind: 'unknown', operationRef: 'original-run' },
  })
  expect(ctx.get(calendarSupplyKey)).toBeUndefined()
})

it('forwards every supply wire method unchanged and fences all five old entry points', async () => {
  const ctx = root(),
    supply = application(),
    life = lifecycle()
  const error = {
    kind: 'error',
    error: {
      code: 'forbidden',
      message: 'current authority denied',
      retryable: false,
      requestId: context.requestId,
      details: {},
    },
  } as const
  supply.probe.mockResolvedValue(error)
  supply.refresh.mockResolvedValue(error)
  supply.importSeed.mockResolvedValue(error)
  supply.queryPublication.mockResolvedValue(error)
  supply.health.mockResolvedValue(error)
  const fiber = ctx.plugin(CalendarLocalSupplyProvider, {
    ...life.config,
    binding: { kind: 'borrowed', supply },
  })
  await fiber.await()
  const service = ctx.get(calendarSupplyKey)
  if (!service) throw new Error('Missing supply service')
  const calls: ((target: CalendarSupply) => Promise<unknown>)[] = [
    target => target.probe(context, { ...intent, sourceId: 'source' }),
    target => target.refresh(context, intent),
    target =>
      target.importSeed(context, {
        packRef: 'pack',
        packHash: 'a'.repeat(64),
        releaseRef: 'release',
        operationKey: 'seed',
      }),
    target =>
      target.queryPublication(
        context,
        calendarPublicationQuerySchema.parse({
          address: {
            protocol: 'omne.calendar-schedule/1',
            systemScopeRef: 'test-system',
            operation: 'refresh',
            calendarId: intent.calendarId,
            operationKey: intent.operationKey,
          },
          expectedFingerprint: 'a'.repeat(64),
        }),
      ),
    target =>
      target.health(context, {
        calendarId: intent.calendarId,
        policyVersion: intent.policyVersion,
      }),
  ]
  for (const call of calls) expect(await call(service)).toBe(error)
  await fiber.dispose()
  for (const call of calls)
    expect(await call(service)).toMatchObject({
      kind: 'error',
      error: { code: 'provider_failure' },
    })
  for (const method of [
    supply.probe,
    supply.refresh,
    supply.importSeed,
    supply.queryPublication,
    supply.health,
  ]) {
    expect(method).toHaveBeenCalledOnce()
    expect(method.mock.calls[0]?.[0]).toBe(context)
  }
})

it('old cleanup cannot remove a later generation or another isolated provider', async () => {
  const ctx = root(),
    a = ctx.isolate(calendarSupplyKey),
    b = ctx.isolate(calendarSupplyKey)
  const first = application(),
    second = application(),
    third = application(),
    life = lifecycle()
  const oldFiber = a.plugin(CalendarLocalSupplyProvider, {
    ...life.config,
    binding: { kind: 'owned', create: () => first, runner: null },
  })
  const otherFiber = b.plugin(CalendarLocalSupplyProvider, {
    ...life.config,
    binding: { kind: 'owned', create: () => second, runner: null },
  })
  await Promise.all([oldFiber.await(), otherFiber.await()])
  const old = a.get(calendarSupplyKey)
  await oldFiber.dispose()
  const replacement = a.plugin(CalendarLocalSupplyProvider, {
    ...life.config,
    binding: { kind: 'owned', create: () => third, runner: null },
  })
  await replacement.await()
  await oldFiber.dispose()
  expect(await old?.refresh(context, intent)).toMatchObject({ kind: 'error' })
  expect(await a.get(calendarSupplyKey)?.refresh(context, intent)).toMatchObject({ kind: 'ok' })
  expect(await b.get(calendarSupplyKey)?.refresh(context, intent)).toMatchObject({ kind: 'ok' })
  expect(first.stop).toHaveBeenCalledOnce()
  expect(second.stop).not.toHaveBeenCalled()
  expect(third.stop).not.toHaveBeenCalled()
})

it('reports cleanup failure without leaving a callable service', async () => {
  const ctx = root(),
    supply = application(),
    life = lifecycle()
  supply.stop.mockImplementation(() => {
    throw new Error('stop failed: durable runs retained')
  })
  const provider = ctx.plugin(CalendarLocalSupplyProvider, {
    ...life.config,
    binding: { kind: 'owned', create: () => supply, runner: null },
  })
  await provider.await()
  await provider.dispose()
  expect(life.reports).toContainEqual(
    expect.objectContaining({
      cleanup: { kind: 'failed', message: 'Error: stop failed: durable runs retained' },
    }),
  )
  expect(ctx.get(calendarSupplyKey)).toBeUndefined()
})

it('cleans partially constructed query and rejects invalid configuration before factory allocation', async () => {
  const ctx = root(),
    life = lifecycle()
  const broken = ctx.plugin(CalendarLocalQueryProvider, {
    ...life.config,
    binding: {
      kind: 'owned',
      create: () => {
        throw new Error('partial initialization')
      },
    },
  })
  await expect(broken.await()).rejects.toThrow('partial initialization')
  expect(ctx.get(calendarQueryKey)).toBeUndefined()
  expect(life.reports).toHaveLength(1)
  const create = vi.fn(application)
  const invalid = ctx.plugin(CalendarLocalSupplyProvider, {
    ...life.config,
    drainTimeoutMs: 0,
    binding: { kind: 'owned', create, runner: null },
  })
  await expect(invalid.await()).rejects.toThrow('invalid config')
  expect(create).not.toHaveBeenCalled()
  expect(ctx.get(calendarSupplyKey)).toBeUndefined()
})

it('disposes a provider whose runner context supplier never settles', async () => {
  const ctx = root(),
    supply = application(),
    life = lifecycle()
  const pending = Promise.withResolvers<typeof context>()
  const events: unknown[] = []
  const provider = ctx.plugin(CalendarLocalSupplyProvider, {
    ...life.config,
    drainTimeoutMs: 30,
    binding: {
      kind: 'owned',
      create: () => supply,
      runner: {
        contextSupplier: () => pending.promise,
        seed: null,
        initializationOperationKey: 'init',
        acknowledgementKey: 'ack',
        intervalMs: 1000,
        drainTimeoutMs: 5,
        limit: 10,
        phases: { recover: true, runDue: true, deliverReactions: true },
        observer: {
          name: 'runner-test',
          observe: event => {
            events.push(event)
          },
        },
      },
    },
  })
  await provider.await()
  await provider.dispose()
  expect(supply.stop).toHaveBeenCalledOnce()
  expect(events).toContainEqual(expect.objectContaining({ kind: 'stopped', inFlight: 'retained' }))
  pending.resolve(context)
  await Promise.resolve()
  expect(supply.initialize).not.toHaveBeenCalled()
  expect(ctx.get(calendarSupplyKey)).toBeUndefined()
})
