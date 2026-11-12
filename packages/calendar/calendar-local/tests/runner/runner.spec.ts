import {
  calendarIdSchema,
  calendarImportSeedResultSchema,
  calendarProbeResultSchema,
} from '@omne-harness/calendar-contract'
import { afterEach, expect, it, vi } from 'vitest'
import { createCalendarSupplyRunner, type CalendarRunnerEvent } from '../../src/runner/index.ts'
import { application, context } from './fixture.ts'

afterEach(() => vi.useRealTimers())
function setup(
  overrides: Partial<import('../../src/runner/index.ts').CalendarRunnerConfiguration> = {},
) {
  const supply = application()
  const events: CalendarRunnerEvent[] = []
  let sequence = 0
  const contextSupplier = vi.fn(async () => ({ ...context, requestId: `request-${++sequence}` }))
  const runner = createCalendarSupplyRunner({
    supply,
    contextSupplier,
    seed: {
      packRef: 'pack',
      packHash: 'a'.repeat(64),
      releaseRef: 'release',
      operationKey: 'seed-intent',
    },
    initializationOperationKey: 'initialize-intent',
    acknowledgementKey: 'ack-intent',
    intervalMs: 1000,
    drainTimeoutMs: 10,
    limit: 10,
    phases: { recover: true, runDue: true, deliverReactions: true },
    observer: {
      name: 'test-observer',
      observe: event => {
        events.push(event)
      },
    },
    ...overrides,
  })
  return { runner, supply, contextSupplier, events }
}

it('imports seed before plans, preserves unknown results and reuses acknowledgement intent', async () => {
  vi.useFakeTimers()
  const w = setup()
  await w.runner.start()
  expect(w.supply.importSeed.mock.invocationCallOrder[0]).toBeLessThan(
    w.supply.initialize.mock.invocationCallOrder[0]!,
  )
  expect(w.supply.initialize.mock.invocationCallOrder[0]).toBeLessThan(
    w.supply.recover.mock.invocationCallOrder[0]!,
  )
  expect(w.events).toContainEqual({
    kind: 'result',
    phase: 'recover',
    result: {
      kind: 'ok',
      value: [{ kind: 'ok', value: { kind: 'unknown', operationRef: 'original-run' } }],
    },
  })
  await vi.advanceTimersByTimeAsync(1000)
  expect(w.contextSupplier).toHaveBeenCalledTimes(2)
  expect(w.supply.deliverReactions.mock.calls.map(call => call[1].acknowledgementKey)).toEqual([
    'ack-intent',
    'ack-intent',
  ])
  expect(w.supply.importSeed).toHaveBeenCalledTimes(1)
  expect(await w.runner.stop()).toMatchObject({
    timer: 'cleared',
    inFlight: 'settled',
    durableRuns: 'retained',
  })
  await vi.advanceTimersByTimeAsync(10000)
  expect(w.contextSupplier).toHaveBeenCalledTimes(2)
})

it('reports missing seed, disabled phases, provider rejection and observer rejection without unhandled work', async () => {
  vi.useFakeTimers()
  const w = setup({ seed: null, phases: { recover: false, runDue: true, deliverReactions: false } })
  w.supply.runDue.mockRejectedValueOnce(new Error('network unavailable'))
  const first = await w.runner.start()
  expect(first.events).toContainEqual({ kind: 'seedSkipped', reason: 'notConfigured' })
  expect(first.events).toContainEqual({
    kind: 'failure',
    phase: 'runDue',
    message: 'Error: network unavailable',
  })
  expect(w.supply.importSeed).not.toHaveBeenCalled()
  expect(w.supply.recover).not.toHaveBeenCalled()
  expect(w.supply.deliverReactions).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  expect(w.supply.runDue).toHaveBeenCalledTimes(2)
  await w.runner.stop()
  const failedObserver = setup({
    observer: {
      name: 'rejecting-observer',
      async observe() {
        throw new Error('observer failed')
      },
    },
  })
  expect(await failedObserver.runner.start()).toMatchObject({
    observerFailure: 'rejecting-observer: Error: observer failed',
  })
  failedObserver.supply.stop.mockImplementation(() => {
    throw new Error('stop failed')
  })
  expect(await failedObserver.runner.stop()).toMatchObject({
    supplyStop: { kind: 'failed', message: 'Error: stop failed' },
    observerFailure: 'rejecting-observer: Error: observer failed',
  })
})

it('keeps the same seed intent after unknown and does not start network plans prematurely', async () => {
  vi.useFakeTimers()
  const w = setup()
  w.supply.importSeed.mockResolvedValueOnce({
    kind: 'ok',
    value: {
      releaseRef: 'release',
      results: [
        {
          calendarId: calendarIdSchema.parse('us-federal-holidays'),
          outcome: { kind: 'unknown', operationRef: 'seed-run' },
          warnings: [],
        },
      ],
    },
  })
  const first = await w.runner.start()
  expect(first.events.map(event => event.kind)).toEqual(['result'])
  expect(w.supply.initialize).not.toHaveBeenCalled()
  expect(w.supply.recover).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  expect(w.supply.importSeed.mock.calls.map(call => call[1].operationKey)).toEqual([
    'seed-intent',
    'seed-intent',
  ])
  expect(w.supply.initialize).toHaveBeenCalledOnce()
  await w.runner.stop()
})

it('labels initialization failures correctly and closes a pending seed before network planning', async () => {
  vi.useFakeTimers()
  const w = setup()
  w.supply.initialize.mockRejectedValueOnce(new Error('plan storage offline'))
  expect((await w.runner.start()).events).toContainEqual({
    kind: 'failure',
    phase: 'initialize',
    message: 'Error: plan storage offline',
  })
  expect(w.supply.runDue).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  expect(w.supply.importSeed).toHaveBeenCalledOnce()
  expect(w.supply.initialize).toHaveBeenCalledTimes(2)
  await w.runner.stop()
  const late = setup()
  const seed = Promise.withResolvers<Awaited<ReturnType<typeof late.supply.importSeed>>>()
  late.supply.importSeed.mockReturnValue(seed.promise)
  const started = late.runner.start()
  await vi.advanceTimersByTimeAsync(0)
  const stopping = late.runner.stop()
  const stopObserved = vi.fn()
  void stopping.then(stopObserved)
  await vi.advanceTimersByTimeAsync(10)
  expect(stopObserved).toHaveBeenCalledOnce()
  expect(await stopping).toMatchObject({ inFlight: 'retained' })
  seed.resolve({ kind: 'ok', value: { releaseRef: 'release', results: [] } })
  await started
  expect(late.supply.initialize).not.toHaveBeenCalled()
  expect(late.runner.inspect()).toMatchObject({ state: 'stopped', inFlight: 'settled' })
  expect(vi.getTimerCount()).toBe(0)
})

it('resets the scheduled wakeup after an explicit tick and skips repeated initialization', async () => {
  vi.useFakeTimers()
  const w = setup()
  await w.runner.start()
  await vi.advanceTimersByTimeAsync(400)
  expect(await w.runner.tick()).toMatchObject({ kind: 'settled' })
  expect(w.supply.recover).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(600)
  expect(w.supply.recover).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(400)
  expect(w.supply.recover).toHaveBeenCalledTimes(3)
  expect(w.supply.initialize).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(1)
  await w.runner.stop()
})

it('reports seed throws and error results without starting plans or changing the seed input', async () => {
  vi.useFakeTimers()
  const w = setup()
  const error = {
    kind: 'error',
    error: {
      code: 'provider_failure',
      message: 'seed store offline',
      requestId: context.requestId,
      retryable: true,
      details: {},
    },
  } as const
  w.supply.importSeed
    .mockRejectedValueOnce(new Error('seed read failed'))
    .mockResolvedValueOnce(error)
  expect((await w.runner.start()).events).toEqual([
    { kind: 'failure', phase: 'importSeed', message: 'Error: seed read failed' },
  ])
  expect((await w.runner.tick()).events).toEqual([
    { kind: 'result', phase: 'importSeed', result: error },
  ])
  expect(w.supply.initialize).not.toHaveBeenCalled()
  expect(w.supply.importSeed.mock.calls.map(call => call[1])).toEqual([
    {
      packRef: 'pack',
      packHash: 'a'.repeat(64),
      releaseRef: 'release',
      operationKey: 'seed-intent',
    },
    {
      packRef: 'pack',
      packHash: 'a'.repeat(64),
      releaseRef: 'release',
      operationKey: 'seed-intent',
    },
  ])
  await w.runner.stop()
})

it('keeps a late trusted context from starting work and reports the stopped cycle', async () => {
  vi.useFakeTimers()
  const contextReply = Promise.withResolvers<typeof context>()
  const w = setup({ contextSupplier: () => contextReply.promise })
  const first = w.runner.start()
  await vi.advanceTimersByTimeAsync(0)
  const stopping = w.runner.stop()
  const observed = vi.fn()
  void stopping.then(observed)
  await vi.advanceTimersByTimeAsync(10)
  expect(observed).toHaveBeenCalledOnce()
  contextReply.resolve(context)
  expect(await first).toEqual({ kind: 'stopped', events: [], observerFailure: null })
  expect(w.supply.importSeed).not.toHaveBeenCalled()
  expect(w.supply.initialize).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('joins overlapping ticks, stops within the drain bound and never continues a late cycle', async () => {
  vi.useFakeTimers()
  const w = setup()
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof w.supply.runDue>>>()
  w.supply.runDue.mockReturnValue(pending.promise)
  const first = w.runner.start()
  await vi.advanceTimersByTimeAsync(0)
  const second = w.runner.tick()
  await vi.advanceTimersByTimeAsync(5000)
  expect(w.supply.runDue).toHaveBeenCalledTimes(1)
  const stopped = w.runner.stop()
  const stopObserved = vi.fn()
  void stopped.then(stopObserved)
  await vi.advanceTimersByTimeAsync(10)
  expect(stopObserved).toHaveBeenCalledOnce()
  expect(await stopped).toMatchObject({ inFlight: 'retained', durableRuns: 'retained' })
  pending.resolve({ kind: 'ok', value: [] })
  for (const result of await Promise.all([first, second]))
    expect(result).toMatchObject({ kind: 'stopped' })
  expect(w.supply.deliverReactions).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(10000)
  expect(w.supply.runDue).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['published', 'noChange'] as const)(
  'waits for seed %s and retries a failed plan with its original intent',
  async disposition => {
    vi.useFakeTimers()
    const w = setup()
    function seeded(disposition: 'published' | 'noChange' | 'rejected') {
      return calendarImportSeedResultSchema.parse({
        kind: 'ok',
        value: {
          releaseRef: 'release',
          results: [
            {
              calendarId: 'us-federal-holidays',
              warnings: [],
              outcome: {
                kind: 'recorded',
                replayed: false,
                receipt: {
                  operationRef: 'seed-run',
                  address: {
                    protocol: 'omne.calendar-schedule/1',
                    systemScopeRef: 'test-system',
                    calendarId: 'us-federal-holidays',
                    operation: 'importSeed',
                    operationKey: 'seed-intent',
                  },
                  fingerprint: 'a'.repeat(64),
                  candidateRef: 'seed-candidate',
                  disposition,
                  current: null,
                  outboxId: null,
                },
              },
            },
          ],
        },
      })
    }
    w.supply.importSeed
      .mockResolvedValueOnce(seeded('rejected'))
      .mockResolvedValue(seeded(disposition))
    const error = {
      kind: 'error',
      error: {
        code: 'authority_unavailable',
        message: 'offline',
        requestId: context.requestId,
        retryable: true,
        details: {},
      },
    } as const
    w.supply.initialize.mockResolvedValueOnce(error)
    const first = await w.runner.start()
    expect(first.events).toContainEqual({
      kind: 'result',
      phase: 'importSeed',
      result: seeded('rejected'),
    })
    expect(w.supply.initialize).not.toHaveBeenCalled()
    const second = await w.runner.tick()
    expect(second.events).toContainEqual({
      kind: 'result',
      phase: 'importSeed',
      result: seeded(disposition),
    })
    expect(second.events).toContainEqual({ kind: 'result', phase: 'initialize', result: error })
    expect(w.supply.runDue).not.toHaveBeenCalled()
    await w.runner.tick()
    expect(w.supply.initialize.mock.calls.map(call => call[1])).toEqual([
      { operationKey: 'initialize-intent' },
      { operationKey: 'initialize-intent' },
    ])
    expect(w.supply.importSeed).toHaveBeenCalledTimes(2)
    expect(w.supply.recover.mock.calls[0]?.[1]).toEqual({ limit: 10 })
    expect(w.supply.runDue.mock.calls[0]?.[1]).toEqual({ limit: 10 })
    const stopped = w.runner.stop()
    expect(w.runner.stop()).toBe(stopped)
    expect(await stopped).toMatchObject({
      supplyStop: {
        kind: 'returned',
        value: { kind: 'admissionStopped', durableRuns: 'retained' },
      },
    })
    expect(w.supply.stop).toHaveBeenCalledOnce()
  },
)

it('does not mint a context after stop and reports context failure without calling the application', async () => {
  vi.useFakeTimers()
  const w = setup()
  expect(await w.runner.tick()).toMatchObject({ kind: 'stopped', events: [] })
  const started = w.runner.start()
  const stopped = w.runner.stop()
  expect(await started).toEqual({ kind: 'stopped', events: [], observerFailure: null })
  await stopped
  expect(w.contextSupplier).not.toHaveBeenCalled()
  expect(await w.runner.start()).toEqual({ kind: 'stopped', events: [], observerFailure: null })
  const failed = setup({
    contextSupplier: async () => {
      throw new Error('identity unavailable')
    },
  })
  expect((await failed.runner.start()).events).toEqual([
    { kind: 'failure', phase: 'context', message: 'Error: identity unavailable' },
  ])
  expect(failed.supply.importSeed).not.toHaveBeenCalled()
  await failed.runner.stop()
})

it('bounds an observer that never settles and exposes its retained diagnostic', async () => {
  vi.useFakeTimers()
  const observed = Promise.withResolvers<void>()
  const w = setup({ observer: { name: 'stalled-observer', observe: () => observed.promise } })
  const first = w.runner.start()
  await vi.advanceTimersByTimeAsync(0)
  const stop = w.runner.stop()
  const stopObserved = vi.fn()
  void stop.then(stopObserved)
  await vi.advanceTimersByTimeAsync(20)
  expect(stopObserved).toHaveBeenCalledOnce()
  expect(await stop).toMatchObject({
    inFlight: 'retained',
    observerFailure: 'stalled-observer: stop observation retained',
  })
  expect(w.runner.inspect().observerFailure).toBe('stalled-observer: stop observation retained')
  observed.resolve()
  await first
  expect(w.supply.initialize).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it.each([1, 2])(
  'retries initialization after %i source plans fail without repeating the seed',
  async failedCount => {
    vi.useFakeTimers()
    const w = setup()
    const planned = calendarProbeResultSchema.parse({
      kind: 'ok',
      value: {
        sourceId: 'source',
        observation: {
          sourceId: 'source',
          observedAt: '2026-11-03T00:00:00.000Z',
          kind: 'failed',
          marker: null,
          authorityCoverageEnd: null,
          reason: 'Network unavailable; retry is scheduled',
        },
        nextDue: '2026-11-04T00:00:00.000Z',
        consecutiveFailures: 1,
        lastSuccess: null,
      },
    })
    const failed = calendarProbeResultSchema.parse({
      kind: 'error',
      error: {
        code: 'provider_failure',
        message: 'Probe journal unavailable',
        requestId: context.requestId,
        retryable: true,
        details: {},
      },
    })
    const inputs = ['first', 'second'].map(sourceId => ({
      calendarId: calendarIdSchema.parse('us-federal-holidays'),
      policyVersion: 'policy',
      sourceId,
      operationKey: `initialize-${sourceId}`,
    }))
    const partial = {
      kind: 'ok',
      value: inputs.map((input, index) => ({
        input,
        result: index < failedCount ? failed : planned,
      })),
    } as const
    w.supply.initialize.mockResolvedValueOnce(partial).mockResolvedValue({
      kind: 'ok',
      value: inputs.map(input => ({ input, result: planned })),
    })
    const first = await w.runner.start()
    expect(first.events).toContainEqual({ kind: 'result', phase: 'initialize', result: partial })
    expect(w.supply.runDue).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(w.supply.initialize.mock.calls.map(call => call[1])).toEqual([
      { operationKey: 'initialize-intent' },
      { operationKey: 'initialize-intent' },
    ])
    expect(w.supply.importSeed).toHaveBeenCalledOnce()
    expect(w.supply.runDue).toHaveBeenCalledOnce()
    await w.runner.tick()
    expect(w.supply.initialize).toHaveBeenCalledTimes(2)
    expect(w.supply.runDue).toHaveBeenCalledTimes(2)
    await w.runner.stop()
  },
)
