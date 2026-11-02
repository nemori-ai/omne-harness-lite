import { afterEach, expect, it, vi } from 'vitest'
import { createHostFilesDomain } from '@omne-harness/execution-environment-host-local'
import { createHostFilesRuntime } from '../../../src/host-files.ts'

afterEach(() => vi.useRealTimers())

it('waits for maintenance before scheduling another interval and drains queued requests', async () => {
  vi.useFakeTimers()
  const first = Promise.withResolvers<Readonly<{ pending: number }>>()
  const maintain = vi.fn().mockResolvedValue({ pending: 0 }).mockReturnValueOnce(first.promise)
  const domain = { ...createHostFilesDomain(), maintain }
  const runtime = createHostFilesRuntime({ domain, diagnose: vi.fn() })
  runtime.start(25)
  await vi.advanceTimersByTimeAsync(25)
  expect(maintain).toHaveBeenCalledTimes(1)
  const queued = runtime.request()
  await vi.advanceTimersByTimeAsync(100)
  expect(maintain).toHaveBeenCalledTimes(1)
  runtime.stopPeriodic()
  const closed = runtime.close()
  let drained = false
  void closed.then(() => {
    drained = true
  })
  await Promise.resolve()
  expect(drained).toBe(false)
  first.resolve({ pending: 1 })
  await queued
  await closed
  expect(maintain).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(100)
  expect(maintain).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('redacts a maintenance failure and keeps the next cycle alive', async () => {
  vi.useFakeTimers()
  const maintain = vi
    .fn()
    .mockResolvedValue({ pending: 0 })
    .mockRejectedValueOnce(new Error('secret payload'))
  const domain = { ...createHostFilesDomain(), maintain }
  const diagnose = vi.fn()
  const runtime = createHostFilesRuntime({ domain, diagnose })
  runtime.start(17)
  await vi.advanceTimersByTimeAsync(17)
  expect(diagnose.mock.calls).toEqual([[{ kind: 'host-files-maintenance-failed' }]])
  await vi.advanceTimersByTimeAsync(16)
  expect(maintain).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(maintain).toHaveBeenCalledTimes(2)
  await runtime.close()
})

it('owns one timer across activations and refuses work after close', async () => {
  vi.useFakeTimers()
  const maintain = vi.fn().mockResolvedValue({ pending: 0 })
  const domain = { ...createHostFilesDomain(), maintain }
  const runtime = createHostFilesRuntime({ domain, diagnose: vi.fn() })
  runtime.start(9)
  runtime.start(9)
  await vi.advanceTimersByTimeAsync(9)
  expect(maintain).toHaveBeenCalledTimes(1)
  await runtime.close()
  runtime.start(9)
  expect(await runtime.request()).toEqual({ kind: 'unavailable' })
  await vi.advanceTimersByTimeAsync(90)
  expect(maintain).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('does not restart periodic work after stopping begins, but accepts retirement maintenance', async () => {
  vi.useFakeTimers()
  const maintain = vi.fn().mockResolvedValue({ pending: 3 })
  const runtime = createHostFilesRuntime({
    domain: { ...createHostFilesDomain(), maintain },
    diagnose: vi.fn(),
  })
  runtime.start(10)
  runtime.stopPeriodic()
  runtime.start(10)
  await vi.advanceTimersByTimeAsync(50)
  expect(maintain).not.toHaveBeenCalled()
  expect(await runtime.request()).toEqual({ kind: 'maintained', pending: 3 })
  await runtime.close()
})

it('does not shorten intervals above the native timer limit', async () => {
  vi.useFakeTimers()
  const maintain = vi.fn().mockResolvedValue({ pending: 0 })
  const runtime = createHostFilesRuntime({
    domain: { ...createHostFilesDomain(), maintain },
    diagnose: vi.fn(),
  })
  const timer = vi.spyOn(globalThis, 'setTimeout')
  runtime.start(2 ** 31 + 7)
  expect(timer.mock.calls[0]?.[1]).toBeLessThanOrEqual(2 ** 31 - 1)
  await vi.advanceTimersByTimeAsync(2 ** 31 - 1)
  expect(maintain).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(8)
  expect(maintain).toHaveBeenCalledTimes(1)
  await runtime.close()
  timer.mockRestore()
})
