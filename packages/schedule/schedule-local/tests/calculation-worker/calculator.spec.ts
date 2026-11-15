import { getEventListeners } from 'node:events'
import { describe, expect, it } from 'vitest'
import { enumerateScheduleRecurrence } from '@omne-harness/schedule'
import { createScheduleCalculationWorker } from '@omne-harness/schedule-local'
import { calculationInput } from './inputs.ts'

describe('calculation worker public factory', () => {
  it.each([
    { maxConcurrent: 0, maxQueued: 0 },
    { maxConcurrent: -1, maxQueued: 0 },
    { maxConcurrent: 1.5, maxQueued: 0 },
    { maxConcurrent: Infinity, maxQueued: 0 },
    { maxConcurrent: 1, maxQueued: -1 },
    { maxConcurrent: 1, maxQueued: 0.5 },
    { maxConcurrent: 1, maxQueued: NaN },
    { maxConcurrent: 1, maxQueued: Number.MAX_SAFE_INTEGER },
  ])('rejects invalid capacity synchronously: %j', options => {
    expect(() => createScheduleCalculationWorker(options)).toThrow(TypeError)
  })

  it('rejects invalid timeout through the returned promise', async () => {
    const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 0 })
    try {
      for (const timeoutMs of [0, -1, 0.5, NaN, Infinity, 2147483648]) {
        const result = worker.calculator.enumerate(calculationInput(), { timeoutMs })
        await expect(result).rejects.toThrow(TypeError)
      }
    } finally {
      await worker.dispose()
    }
  })

  it('preserves the public enumeration and invalid result without modifying the input', async () => {
    const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 0 })
    const controller = new AbortController()
    try {
      for (const recurrence of [
        { kind: 'once', localAt: '2026-11-04T09:00:00' },
        {
          kind: 'rrule',
          rule: 'FREQ=DAILY;BYHOUR=9,17',
          begin: '2026-11-04T00:00:00',
          until: null,
        },
        { kind: 'cron', expression: '0 25 * * *', begin: '2026-11-04T00:00:00', until: null },
      ]) {
        const input = calculationInput(recurrence)
        const original = structuredClone(input)
        await expect(
          worker.calculator.enumerate(input, { timeoutMs: 5000, signal: controller.signal }),
        ).resolves.toEqual({ kind: 'completed', value: enumerateScheduleRecurrence(input) })
        expect(input).toEqual(original)
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
      }
      controller.abort()
    } finally {
      await worker.dispose()
    }
  })

  it('distinguishes pre-aborted calls from disposed calls', async () => {
    const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 0 })
    try {
      await expect(
        worker.calculator.enumerate(calculationInput(), {
          timeoutMs: 5000,
          signal: AbortSignal.abort(),
        }),
      ).resolves.toEqual({ kind: 'unavailable', reason: 'aborted' })
      await worker.dispose()
      await expect(
        worker.calculator.enumerate(calculationInput(), { timeoutMs: 5000 }),
      ).resolves.toEqual({ kind: 'unavailable', reason: 'disposed' })
    } finally {
      await worker.dispose()
    }
  })

  it('releases admission after a structured clone failure', async () => {
    const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 0 })
    try {
      const input = { ...calculationInput(), nonWireValue: () => 1 }
      await expect(worker.calculator.enumerate(input, { timeoutMs: 5000 })).resolves.toEqual({
        kind: 'unavailable',
        reason: 'workerFailure',
      })
      const valid = calculationInput()
      await expect(worker.calculator.enumerate(valid, { timeoutMs: 5000 })).resolves.toEqual({
        kind: 'completed',
        value: enumerateScheduleRecurrence(valid),
      })
    } finally {
      await worker.dispose()
    }
  })
})
