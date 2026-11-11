import { afterEach, expect, it, vi } from 'vitest'
import type { SessionClock } from '@omne-harness/session-contract'
import { Lifecycle } from '../src/lifecycle.ts'
import { createScheduling } from '../src/scheduling.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const opened: Harness[] = []
afterEach(async () => {
  for (const h of opened.splice(0)) await h.close()
})

async function setup(clock?: SessionClock) {
  const h = await harness({ backend: memoryBackend })
  opened.push(h)
  const lifecycle = new Lifecycle()
  return {
    h,
    lifecycle,
    scheduling: createScheduling({ ...h.dependencies, clock: clock ?? h.clock }, lifecycle),
  }
}

it('separates elapsed, clock refusal and caller cancellation', async () => {
  const { h, scheduling } = await setup()
  expect(await scheduling.wait(0)).toBe('elapsed')
  h.clock.controls.unavailable(true)
  expect(await scheduling.wait(1)).toBe('refused')
  h.clock.controls.unavailable(false)
  const stop = new AbortController()
  const waiting = scheduling.wait(1000, stop.signal)
  stop.abort()
  expect(await waiting).toBe('cancelled')
})

it('cancels while sample is pending and never starts a timer from the late sample', async () => {
  const sample = Promise.withResolvers<Awaited<ReturnType<SessionClock['sample']>>>()
  const waitUntil = vi.fn<SessionClock['waitUntil']>(async () => 'elapsed')
  const { h, scheduling } = await setup({ sample: () => sample.promise, waitUntil })
  const stop = new AbortController()
  const waiting = scheduling.wait(1000, stop.signal)
  const result = vi.fn()
  void waiting.then(result)
  stop.abort()
  await vi.waitFor(() => expect(result).toHaveBeenCalledWith('cancelled'))
  sample.resolve(await h.clock.sample())
  await new Promise(resolve => setImmediate(resolve))
  expect(waitUntil).not.toHaveBeenCalled()
  expect(result).toHaveBeenCalledTimes(1)
})

it('close cancels a nonresponsive clock wait and its late elapsed cannot change the result', async () => {
  const answer = Promise.withResolvers<'elapsed' | 'cancelled'>()
  const seed = await setup()
  const waitUntil = vi.fn<SessionClock['waitUntil']>(() => answer.promise)
  const scheduling = createScheduling(
    { ...seed.h.dependencies, clock: { sample: seed.h.clock.sample, waitUntil } },
    seed.lifecycle,
  )
  const waiting = scheduling.wait(1000)
  seed.lifecycle.track(waiting)
  await vi.waitFor(() => expect(waitUntil).toHaveBeenCalledTimes(1))
  const result = vi.fn()
  void waiting.then(result)
  const closing = seed.lifecycle.close()
  await vi.waitFor(() => expect(result).toHaveBeenCalledWith('cancelled'))
  await closing
  answer.resolve('elapsed')
  await new Promise(resolve => setImmediate(resolve))
  expect(result).toHaveBeenCalledTimes(1)
})

it('a throwing clock is refused and never becomes elapsed', async () => {
  const seed = await setup()
  const scheduling = createScheduling(
    {
      ...seed.h.dependencies,
      clock: {
        sample: seed.h.clock.sample,
        waitUntil: async () => {
          throw new Error('clock unavailable')
        },
      },
    },
    seed.lifecycle,
  )
  expect(await scheduling.wait(1)).toBe('refused')
})
