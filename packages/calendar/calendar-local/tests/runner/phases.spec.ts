import { afterEach, expect, it, vi } from 'vitest'
import { createCalendarSupplyRunner } from '../../src/index.ts'
import { application, context } from './fixture.ts'

afterEach(() => vi.useRealTimers())

it('passes the same trusted context and configured budget to each phase and preserves their exact results', async () => {
  vi.useFakeTimers()
  const supply = application()
  const runner = createCalendarSupplyRunner({
    supply,
    contextSupplier: async () => context,
    seed: null,
    initializationOperationKey: 'original-init',
    acknowledgementKey: 'original-ack',
    intervalMs: 1000,
    drainTimeoutMs: 10,
    limit: 7,
    phases: { recover: true, runDue: true, deliverReactions: true },
    observer: { name: 'phases', observe: () => undefined },
  })
  const cycle = await runner.start()
  expect(supply.recover).toHaveBeenCalledWith(context, { limit: 7 })
  expect(supply.runDue).toHaveBeenCalledWith(context, { limit: 7 })
  expect(supply.deliverReactions).toHaveBeenCalledWith(context, {
    limit: 7,
    acknowledgementKey: 'original-ack',
  })
  expect(cycle.events).toEqual([
    { kind: 'seedSkipped', reason: 'notConfigured' },
    { kind: 'result', phase: 'initialize', result: await supply.initialize.mock.results[0]?.value },
    { kind: 'result', phase: 'recover', result: await supply.recover.mock.results[0]?.value },
    { kind: 'result', phase: 'runDue', result: await supply.runDue.mock.results[0]?.value },
    {
      kind: 'result',
      phase: 'deliverReactions',
      result: await supply.deliverReactions.mock.results[0]?.value,
    },
  ])
  expect(await runner.stop()).toEqual({
    kind: 'stopped',
    timer: 'cleared',
    inFlight: 'settled',
    durableRuns: 'retained',
    supplyStop: { kind: 'returned', value: { kind: 'admissionStopped', durableRuns: 'retained' } },
    observerFailure: null,
  })
})
