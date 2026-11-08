import { describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { monotonicClock } from '../../../src/shutdown.ts'
import { startMaterialMaintenanceRunner } from '../../../src/rows/tool-runtime/material-maintenance-runner.ts'

describe('material maintenance scheduling', () => {
  it('runs without a user read and cancels its timer on close', async () => {
    vi.useFakeTimers()
    try {
      const result = succeed({ calls: 1, failures: 0, roundComplete: true })
      const advance = vi.fn(async () => result)
      const close = vi.fn(async () => {})
      const report = vi.fn()
      const runner = startMaterialMaintenanceRunner({
        sweep: { advance, close },
        clock: monotonicClock,
        intervalMs: 100,
        report,
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(advance).toHaveBeenCalledTimes(1)
      expect(report).toHaveBeenCalledWith(result)
      await vi.advanceTimersByTimeAsync(100)
      expect(advance).toHaveBeenCalledTimes(2)
      await runner.close()
      await runner.done
      await vi.advanceTimersByTimeAsync(1000)
      expect(advance).toHaveBeenCalledTimes(2)
      expect(close).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not overlap a slow step and drains it before closing', async () => {
    vi.useFakeTimers()
    try {
      const pending =
        Promise.withResolvers<
          ReturnType<typeof succeed<{ calls: number; failures: number; roundComplete: boolean }>>
        >()
      const advance = vi.fn(() => pending.promise)
      const close = vi.fn(async () => {})
      const report = vi.fn()
      const runner = startMaterialMaintenanceRunner({
        sweep: { advance, close },
        clock: monotonicClock,
        intervalMs: 100,
        report,
      })
      await vi.advanceTimersByTimeAsync(10_000)
      expect(advance).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
      const closing = runner.close()
      expect(runner.close()).toBe(closing)
      expect(close).toHaveBeenCalledTimes(1)
      let drained = false
      void closing.then(() => {
        drained = true
      })
      await Promise.resolve()
      expect(drained).toBe(false)
      pending.resolve(succeed({ calls: 0, failures: 0, roundComplete: true }))
      await closing
      expect(report).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a dependency failure and retries on the next tick', async () => {
    vi.useFakeTimers()
    try {
      const failure = fail({
        kind: 'unavailable' as const,
        dependency: 'test',
        diagnostic: 'offline',
      })
      const advance = vi.fn(async () => failure)
      const report = vi.fn()
      const runner = startMaterialMaintenanceRunner({
        sweep: { advance, close: async () => {} },
        clock: monotonicClock,
        intervalMs: 100,
        report,
      })
      await vi.advanceTimersByTimeAsync(100)
      expect(advance).toHaveBeenCalledTimes(2)
      expect(report).toHaveBeenNthCalledWith(1, failure)
      expect(report).toHaveBeenNthCalledWith(2, failure)
      await runner.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('exposes an unexpected runner failure and still closes the sweep', async () => {
    const fault = new Error('observer failed')
    const close = vi.fn(async () => {})
    const runner = startMaterialMaintenanceRunner({
      sweep: {
        advance: async () => succeed({ calls: 0, failures: 0, roundComplete: true }),
        close,
      },
      clock: monotonicClock,
      intervalMs: 100,
      report: () => {
        throw fault
      },
    })
    await expect(runner.done).rejects.toBe(fault)
    await expect(runner.close()).rejects.toBe(fault)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('allows a reporting callback to close synchronously without scheduling another timer', async () => {
    vi.useFakeTimers()
    try {
      const runner = startMaterialMaintenanceRunner({
        sweep: {
          advance: async () => succeed({ calls: 0, failures: 0, roundComplete: true }),
          close: async () => {},
        },
        clock: monotonicClock,
        intervalMs: 100,
        report: () => {
          void runner.close()
        },
      })
      await runner.done
      await runner.close()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
