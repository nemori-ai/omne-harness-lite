// How the driver runs a call again later (SPEC 23, F7 of #1218): it is the one owner of a later
// run of a call. A run that ends without progress, on a port that cannot answer, or blocked on a
// fact that no wake-up announces, is run again after a delay that doubles each time up to
// max(driverRetryDelayMs, 60000) ms; a run with progress clears it; a verdict is not run again.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import { callId } from './runtime-values.ts'
import { admitCall, auditQueues, startHarness, type StartOptions } from './start-values.ts'

afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

type Harness = ReturnType<typeof startHarness>

/** The schedules of `c1` the driver asked for so far. */
const schedulesOf = (harness: Harness) =>
  harness.host.scheduleAttempts.filter(call => call === callId('c1')).length

/** Advances the clock by `ms` and tells whether the driver asked to run `c1` meanwhile. */
async function scheduledWithin(harness: Harness, ms: number): Promise<boolean> {
  const before = schedulesOf(harness)
  await vi.advanceTimersByTimeAsync(ms)
  return schedulesOf(harness) > before
}

/** Runs what the host was asked to run, once, with the clock still. */
async function runScheduled(harness: Harness): Promise<void> {
  await harness.host.runScheduled()
}

/** A harness whose environment provider answers `unavailable` while `busy()` is true. */
function busyEnvironment(options: Partial<StartOptions> = {}) {
  let busy = true
  const harness = startHarness({
    ...options,
    environmentsPort: base => ({
      ...base,
      prepare: input =>
        busy
          ? Promise.resolve(
              fail<ToolFailure>({ kind: 'unavailable', dependency: 'env', diagnostic: 'busy' }),
            )
          : base.prepare(input),
    }),
  })
  return {
    harness,
    recover: () => {
      busy = false
    },
    fail: () => {
      busy = true
    },
  }
}

/** Asserts that the next later run of `c1` comes after exactly `ms`, then runs it. */
async function nextLaterRunAfter(harness: Harness, ms: number): Promise<void> {
  expect(await scheduledWithin(harness, ms - 1)).toBe(false)
  expect(await scheduledWithin(harness, 1)).toBe(true)
  await runScheduled(harness)
}

describe('the delay of a later run doubles, up to its cap', () => {
  it('after each run that ends unavailable: 100, 200, 400 ms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { harness } = busyEnvironment({ driverRetryDelayMs: 100 })
    await admitCall(harness, 'c1')
    await harness.runOnce('c1')
    await nextLaterRunAfter(harness, 100)
    await nextLaterRunAfter(harness, 200)
    await nextLaterRunAfter(harness, 400)
  })

  it('stops doubling at max(driverRetryDelayMs, 60000) ms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { harness } = busyEnvironment({ driverRetryDelayMs: 40_000 })
    await admitCall(harness, 'c1')
    await harness.runOnce('c1')
    await nextLaterRunAfter(harness, 40_000)
    await nextLaterRunAfter(harness, 60_000)
    await nextLaterRunAfter(harness, 60_000)
  })

  it('a run that makes progress clears the delay: the next failure waits the first delay again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let bindingFails = true
    const busy = busyEnvironment({
      driverRetryDelayMs: 100,
      bindingPort: base => ({
        ...base,
        start: (input, environment) => {
          if (!bindingFails) return base.start(input, environment)
          bindingFails = false
          return Promise.resolve(
            fail<ToolFailure>({ kind: 'unavailable', dependency: 'binding', diagnostic: 'busy' }),
          )
        },
      }),
    })
    const { harness } = busy
    await admitCall(harness, 'c1')
    await harness.runOnce('c1')
    await nextLaterRunAfter(harness, 100)
    await nextLaterRunAfter(harness, 200)
    // The provider answers again: the next run prepares the environment (progress), then meets a
    // binding that cannot answer. The progress clears the delay: it waits the first delay, not 400.
    busy.recover()
    await vi.advanceTimersByTimeAsync(400)
    await runScheduled(harness)
    expect((await harness.state('c1')).phase).toBe('starting')
    await nextLaterRunAfter(harness, 100)
    expect(await harness.state('c1')).toMatchObject({ phase: 'running' })
  })
})

describe('which stops are run again later', () => {
  it('a run blocked on a fact that no wake-up announces is run again after the delay', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const harness = startHarness({ driverRetryDelayMs: 100 })
    await admitCall(harness, 'c1')
    // The authority cannot tell whether the start was accepted: the run stops blocked.
    harness.authority.uncertain('c1')
    await harness.runOnce('c1')
    expect((await harness.state('c1')).phase).toBe('starting')
    await nextLaterRunAfter(harness, 100)
    await nextLaterRunAfter(harness, 200)
    // Once the authority can tell, the later run starts the call.
    harness.authority.reveal('c1')
    await vi.advanceTimersByTimeAsync(400)
    await runScheduled(harness)
    expect(await harness.state('c1')).toMatchObject({ phase: 'running' })
  })

  it('a verdict is not run again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const harness = startHarness({
      driverRetryDelayMs: 100,
      authorityPort: base => ({
        ...base,
        prepare: () => Promise.resolve(fail<ToolFailure>({ kind: 'denied', action: 'start' })),
      }),
    })
    await admitCall(harness, 'c1')
    await harness.runOnce('c1')
    expect(await scheduledWithin(harness, 120_000)).toBe(false)
  })
})
