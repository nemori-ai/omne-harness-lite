import { expect, it, vi } from 'vitest'
import { invokeModel } from '../src/invoke.ts'
import { adapter, policy, request, result } from './invoke-policy-fixture.ts'

const at = '2026-09-28T00:00:00Z'

it('does not enter send admission after cancellation while waiting for the clock', async () => {
  const entered = Promise.withResolvers<void>()
  const clock = Promise.withResolvers<string>()
  const port = adapter()
  const controller = new AbortController()
  const beforeSend = vi.fn(() => true)
  const handle = invokeModel({
    ...request(),
    transport: port.transport,
    credential: 'fixture',
    signal: controller.signal,
    beforeSend,
    policy: {
      ...policy(),
      now: () => {
        entered.resolve()
        return clock.promise
      },
    },
  })
  await entered.promise
  controller.abort()
  clock.resolve(at)
  expect(await handle.outcome).toEqual({ cancelledBeforeSend: true })
  expect(beforeSend).not.toHaveBeenCalled()
  expect(port.sends()).toBe(0)
})

it('does not publish first content or start an idle deadline after cancellation during its timestamp', async () => {
  const entered = Promise.withResolvers<void>()
  const clock = Promise.withResolvers<string>()
  const port = adapter()
  const controller = new AbortController()
  const schedule = vi.fn(() => () => {})
  let calls = 0
  const handle = invokeModel({
    ...request(),
    transport: port.transport,
    credential: 'fixture',
    signal: controller.signal,
    policy: {
      ...policy(),
      schedule,
      now: async () => {
        if (++calls === 2) {
          entered.resolve()
          return clock.promise
        }
        return at
      },
    },
  })
  await entered.promise
  controller.abort()
  clock.resolve(at)
  const value = result(await handle.outcome)
  expect(value).not.toHaveProperty('timing.firstTokenAt')
  expect(schedule).toHaveBeenCalledTimes(1)
  expect(port.stopped()).toBe(1)
})

it('keeps an established normal result while waiting for its terminal timestamp', async () => {
  const entered = Promise.withResolvers<void>()
  const clock = Promise.withResolvers<string>()
  const port = adapter()
  const controller = new AbortController()
  const diagnostic = vi.fn()
  let calls = 0
  const handle = invokeModel({
    ...request(),
    transport: port.transport,
    credential: 'fixture',
    signal: controller.signal,
    policy: {
      ...policy(diagnostic),
      now: async () => {
        if (++calls === 3) {
          entered.resolve()
          return clock.promise
        }
        return at
      },
    },
  })
  await entered.promise
  expect(port.stopped()).toBe(1)
  handle.abort()
  controller.abort()
  clock.resolve(at)
  const value = result(await handle.outcome)
  expect(value).toHaveProperty('outcome', 'complete')
  expect(diagnostic).not.toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'model_invocation.cancel_requested' }),
  )
})
