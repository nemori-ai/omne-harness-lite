import { expect, it } from 'vitest'
import { createAssemblyLifetime, createRetainedWork } from '../src/index.ts'

it.each([false, true])(
  'retains dependencies after close rejection (failed ready: %s)',
  async failed => {
    const setup = Promise.withResolvers<void>()
    const second = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const events: string[] = []
    let calls = 0
    const owned = createRetainedWork(setup.promise, async function close() {
      calls++
      if (calls === 1) throw new Error('original write not confirmed')
      entered.resolve()
      await second.promise
      events.push('runtime quiescent')
    })
    expect(owned.work.ready).toBe(setup.promise)
    const lifetime = createAssemblyLifetime(['dependency', 'runtime'], () => {})
    lifetime.tryClaim()
    lifetime.port('dependency').register({
      ready: Promise.resolve(),
      async close() {
        events.push('dependency closed')
      },
    })
    lifetime.port('runtime').register(owned.work)
    if (failed) setup.reject(new Error('recovery unfinished'))
    else setup.resolve()
    const closing = lifetime.close()
    expect(await owned.control.closeAttempt()).toBe('retained')
    expect(await owned.control.closeAttempt()).toBe('retained')
    expect(calls).toBe(1)
    expect(events).toEqual([])
    const a = owned.control.retryClose()
    const b = owned.control.retryClose()
    expect(a).toBe(b)
    await entered.promise
    expect(calls).toBe(2)
    expect(events).toEqual([])
    second.resolve()
    expect(await a).toBe('closed')
    const report = await closing
    expect(events).toEqual(['runtime quiescent', 'dependency closed'])
    expect(report.complete).toBe(!failed)
    expect(report.rows[0]?.result).toEqual(
      failed ? { kind: 'failed', codes: ['setup'] } : { kind: 'closed' },
    )
    expect(await owned.control.retryClose()).toBe('closed')
    expect(await owned.control.closeAttempt()).toBe('closed')
    expect(calls).toBe(2)
  },
)

it('fixes requests before stopping to the first attempt without an automatic retry', async () => {
  let calls = 0
  const owned = createRetainedWork(Promise.resolve(), function close() {
    calls++
    throw new Error('synchronous root failure')
  })
  const observed = owned.control.closeAttempt()
  const retried = owned.control.retryClose()
  expect(observed).toBe(retried)
  expect(calls).toBe(0)
  void owned.work.close()
  expect(await observed).toBe('retained')
  expect(await retried).toBe('retained')
  expect(await owned.control.closeAttempt()).toBe('retained')
  expect(calls).toBe(1)
})

it('keeps a previous attempt observation when a later explicit retry succeeds', async () => {
  let calls = 0
  const owned = createRetainedWork(Promise.resolve(), async function close() {
    if (++calls === 1) throw new Error('retained original obligation')
  })
  const closing = owned.work.close()
  expect(owned.work.close()).toBe(closing)
  expect(await owned.control.closeAttempt()).toBe('retained')
  const earlier = owned.control.closeAttempt()
  expect(await owned.control.retryClose()).toBe('closed')
  expect(await earlier).toBe('retained')
  await closing
  expect(await owned.control.closeAttempt()).toBe('closed')
  expect(owned.work.close()).toBe(closing)
  expect(calls).toBe(2)
})

it('keeps genuinely pending root work pending without releasing dependencies', async () => {
  const release = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  let calls = 0
  const owned = createRetainedWork(Promise.resolve(), async function close() {
    calls++
    entered.resolve()
    await release.promise
  })
  let closed = false
  const closing = owned.work.close()
  void closing.then(() => {
    closed = true
  })
  await entered.promise
  const retry = owned.control.retryClose()
  const observed = owned.control.closeAttempt()
  expect(retry).toBe(observed)
  expect(closed).toBe(false)
  expect(calls).toBe(1)
  release.resolve()
  expect(await observed).toBe('closed')
  await closing
  expect(closed).toBe(true)
})
