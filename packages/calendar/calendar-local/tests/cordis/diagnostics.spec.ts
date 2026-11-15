import { Context, type Message } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { calendarIdSchema } from '@omne-harness/calendar-contract'
import { calendarSupplyKey } from '@omne-harness/calendar-cordis-contract/cordis'
import { CalendarLocalSupplyProvider, type CalendarProviderStop } from '../../src/cordis.ts'
import { application, context } from '../runner/fixture.ts'

const roots: Context[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await root.fiber.dispose()
  vi.useRealTimers()
})

function setup(observe: (report: CalendarProviderStop) => void | Promise<void>) {
  const ctx = new Context()
  roots.push(ctx)
  const messages: Message[] = []
  ctx.logger.exporter({ levels: { default: 2 }, export: message => messages.push(message) })
  const supply = application()
  const fiber = ctx.plugin(CalendarLocalSupplyProvider, {
    drainTimeoutMs: 10,
    observer: { name: 'provider-observer', observe },
    binding: { kind: 'owned', create: () => supply, runner: null },
  })
  return { ctx, fiber, supply, messages }
}

it.each(['settled', 'cleanup failed', 'call retained'] as const)(
  'warns only when closing retains responsibility: %s',
  async state => {
    vi.useFakeTimers()
    const reports: CalendarProviderStop[] = []
    const w = setup(report => {
      reports.push(report)
    })
    if (state === 'cleanup failed')
      w.supply.stop.mockImplementation(() => {
        throw new Error('cleanup failed')
      })
    await w.fiber.await()
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof w.supply.health>>>()
    let call: Promise<unknown> | undefined
    if (state === 'call retained') {
      w.supply.health.mockReturnValue(pending.promise)
      call = w.ctx.get(calendarSupplyKey)?.health(context, {
        calendarId: calendarIdSchema.parse('us-federal-holidays'),
        policyVersion: 'policy',
      })
      await Promise.resolve()
    }
    const closed = w.fiber.dispose()
    await vi.advanceTimersByTimeAsync(10)
    await closed
    const warnings = w.messages.filter(message => message.type === 'warn')
    if (state === 'settled') expect(warnings).toEqual([])
    else
      expect(warnings.map(message => message.args)).toEqual([
        ['Calendar cleanup retained responsibility', reports[0]],
      ])
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      inFlight: state === 'call retained' ? 'retained' : 'settled',
      pendingCalls: state === 'call retained' ? 1 : 0,
    })
    pending.resolve({
      kind: 'error',
      error: {
        code: 'provider_failure',
        message: 'late original result',
        retryable: true,
        requestId: context.requestId,
        details: {},
      },
    })
    await call
  },
)

it('reports rejected and retained observers without extending provider disposal indefinitely', async () => {
  vi.useFakeTimers()
  const failure = new Error('observer rejected')
  const rejected = setup(async () => {
    throw failure
  })
  await rejected.fiber.await()
  await rejected.fiber.dispose()
  expect(
    rejected.messages.filter(message => message.type === 'error').map(message => message.args),
  ).toEqual([['Calendar lifecycle observer provider-observer failed', failure]])
  expect(rejected.messages.filter(message => message.type === 'warn')).toEqual([])
  const pending = Promise.withResolvers<void>()
  const retained = setup(() => pending.promise)
  await retained.fiber.await()
  const closed = retained.fiber.dispose()
  const observed = vi.fn()
  void closed.then(observed)
  await vi.advanceTimersByTimeAsync(9)
  expect(observed).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await closed
  expect(
    retained.messages.filter(message => message.type === 'warn').map(message => message.args),
  ).toEqual([['Calendar lifecycle observer provider-observer retained']])
  pending.resolve()
  await Promise.resolve()
  expect(vi.getTimerCount()).toBe(0)
})
