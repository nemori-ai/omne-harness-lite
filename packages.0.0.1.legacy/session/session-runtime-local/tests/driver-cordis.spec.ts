import { Context, type Fiber } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { definePlugin, FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  SessionDriverStartupService,
  SESSION_DRIVER_CONTROL,
} from '@omne-harness-lite/session-runtime/cordis'
import type {
  SessionDriverControl,
  SessionDriverPolicy,
  SessionDriverStartup,
} from '@omne-harness-lite/session-runtime'
import { SessionDriver } from '../src/cordis.ts'

const policy: SessionDriverPolicy = {
  scanLimit: 4,
  intervalMs: 20,
  maxTasks: 2,
  maxHeld: 8,
  maxFailures: 16,
  maxStepsPerPass: 4,
}
const fibers: Fiber[] = []
afterEach(async () => {
  for (const fiber of fibers.splice(0).reverse()) await fiber.dispose()
})
class Startup extends SessionDriverStartupService {
  readonly start: SessionDriverStartup['start']
  constructor(ctx: Context, start: SessionDriverStartup['start']) {
    super(ctx)
    this.start = start
  }
}
function root(ctx: Context, start: SessionDriverStartup['start']) {
  const fiber = ctx.plugin(
    definePlugin({
      name: 'actual-driver-startup',
      Config: z.object({}).strict(),
      apply(inner) {
        new Startup(inner, start)
      },
    }),
    {},
  )
  fibers.push(fiber)
  return fiber
}
function control() {
  return {
    requestStop: vi.fn(),
    close: vi.fn<SessionDriverControl['close']>(async () => ({ closed: true })),
  }
}
it('waits for the real startup service without publishing or starting anything', async () => {
  const ctx = new Context()
  const driver = ctx.plugin(SessionDriver, policy)
  fibers.push(driver)
  await driver
  expect(driver.state).toBe(FIBER_STATE.PENDING)
  expect(ctx.get(SESSION_DRIVER_CONTROL)).toBeUndefined()
})
it('publishes the actual control after original startup and withdraws it on removal', async () => {
  const ctx = new Context(),
    original = control()
  const start = vi.fn<SessionDriverStartup['start']>(async () => original)
  await root(ctx, start)
  const driver = ctx.plugin(SessionDriver, policy)
  fibers.push(driver)
  await driver
  expect(start).toHaveBeenCalledOnce()
  expect(start.mock.calls[0]![0]).toEqual(policy)
  expect(Object.isFrozen(start.mock.calls[0]![0])).toBe(true)
  const service = ctx.get(SESSION_DRIVER_CONTROL)
  expect(service).toBeDefined()
  expect(await service!.close()).toEqual({ closed: true })
  await driver.dispose()
  expect(start.mock.calls[0]![1].aborted).toBe(true)
  expect(original.requestStop).toHaveBeenCalled()
  expect(ctx.get(SESSION_DRIVER_CONTROL)).toBeUndefined()
})
it('rejects policy before invoking the trusted startup', async () => {
  const ctx = new Context(),
    start = vi.fn<SessionDriverStartup['start']>(async () => control())
  await root(ctx, start)
  const driver = ctx.plugin(SessionDriver, { ...policy, maxTasks: 0 })
  fibers.push(driver)
  await expect(driver).rejects.toThrow()
  expect(start).not.toHaveBeenCalled()
  expect(ctx.get(SESSION_DRIVER_CONTROL)).toBeUndefined()
})
it('stops and closes late original startup without publishing its control', async () => {
  const ctx = new Context(),
    original = control(),
    entered = Promise.withResolvers<AbortSignal>(),
    ready = Promise.withResolvers<SessionDriverControl>()
  const start = vi.fn<SessionDriverStartup['start']>(async (_policy, signal) => {
    entered.resolve(signal)
    return ready.promise
  })
  await root(ctx, start)
  const driver = ctx.plugin(SessionDriver, policy)
  fibers.push(driver)
  await vi.waitFor(() => expect(start).toHaveBeenCalledOnce())
  const signal = await entered.promise
  const unloading = driver.dispose()
  await vi.waitFor(() => expect(signal.aborted).toBe(true))
  ready.resolve(original)
  await unloading
  expect(original.requestStop).toHaveBeenCalled()
  expect(original.close).toHaveBeenCalledOnce()
  expect(ctx.get(SESSION_DRIVER_CONTROL)).toBeUndefined()
})
it('keeps root-owned pending responsibility after the service disappears and permits explicit original close', async () => {
  const ctx = new Context(),
    original = control(),
    retained: SessionDriverControl[] = []
  let ended = false
  original.close.mockImplementation(async () =>
    ended ? { closed: true } : { pending: true, held: 1 },
  )
  await root(ctx, async () => {
    retained.push(original)
    return original
  })
  const driver = ctx.plugin(SessionDriver, policy)
  fibers.push(driver)
  await driver
  await driver.dispose()
  expect(ctx.get(SESSION_DRIVER_CONTROL)).toBeUndefined()
  expect(retained).toEqual([original])
  expect(await retained[0]!.close()).toEqual({ pending: true, held: 1 })
  ended = true
  expect(await retained[0]!.close()).toEqual({ closed: true })
})
it('retains partial startup ownership in the root when startup itself rejects', async () => {
  const ctx = new Context(),
    retained: { released: boolean }[] = []
  const failure = new Error('actual partial startup failure')
  const start = vi.fn<SessionDriverStartup['start']>(async () => {
    retained.push({ released: false })
    throw failure
  })
  await root(ctx, start)
  const driver = ctx.plugin(SessionDriver, policy)
  fibers.push(driver)
  await driver
  await vi.waitFor(() => expect(retained).toEqual([{ released: false }]))
  await expect(start.mock.results[0]!.value).rejects.toBe(failure)
  expect(retained[0]!.released).toBe(false)
  expect(ctx.get(SESSION_DRIVER_CONTROL)).toBeUndefined()
})
it('keeps the original close defect observable through the root after Cordis disposal', async () => {
  const ctx = new Context(),
    original = control(),
    failure = new Error('actual original close defect')
  original.close.mockRejectedValue(failure)
  await root(ctx, async () => original)
  const driver = ctx.plugin(SessionDriver, policy)
  fibers.push(driver)
  await driver
  await driver.dispose()
  expect(ctx.get(SESSION_DRIVER_CONTROL)).toBeUndefined()
  await expect(original.close()).rejects.toBe(failure)
})
it('withdraws only the replaced startup generation and never closes its successor', async () => {
  const ctx = new Context(),
    first = control(),
    second = control()
  const a = await root(ctx, async () => first)
  const driver = ctx.plugin(SessionDriver, policy)
  fibers.push(driver)
  await driver
  await a.dispose()
  expect(first.requestStop).toHaveBeenCalled()
  expect(first.close).toHaveBeenCalledOnce()
  expect(driver.state).toBe(FIBER_STATE.PENDING)
  await root(ctx, async () => second)
  await driver
  expect(second.requestStop).not.toHaveBeenCalled()
  expect(second.close).not.toHaveBeenCalled()
  expect(ctx.get(SESSION_DRIVER_CONTROL)).toBeDefined()
})
it('isolates two process Contexts while using the same plugin definition', async () => {
  const a = new Context(),
    b = new Context(),
    first = control(),
    second = control()
  await root(a, async () => first)
  await root(b, async () => second)
  const one = a.plugin(SessionDriver, policy),
    two = b.plugin(SessionDriver, policy)
  fibers.push(one, two)
  await one
  await two
  await one.dispose()
  expect(first.requestStop).toHaveBeenCalled()
  expect(second.requestStop).not.toHaveBeenCalled()
  expect(second.close).not.toHaveBeenCalled()
  expect(b.get(SESSION_DRIVER_CONTROL)).toBeDefined()
})
