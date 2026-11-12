// @module-tag slow
// Real worker threads and bounded waits verify interruption, replacement, and physical exit.
import { setTimeout as delay } from 'node:timers/promises'
import type { Worker } from 'node:worker_threads'
import { describe, expect, it, vi } from 'vitest'
import { enumerateScheduleRecurrence } from '@omne-harness/schedule'
import { createScheduleCalculationWorker } from '@omne-harness/schedule-local'
import { blockingInput, calculationInput } from './inputs.ts'

function observeThreads() {
  const threads: Worker[] = []
  const exited = new Set<Worker>()
  const onWorker = (worker: Worker) => {
    threads.push(worker)
    worker.once('exit', () => exited.add(worker))
  }
  process.on('worker', onWorker)
  return { threads, exited, stop: () => process.off('worker', onWorker) }
}

async function warm(calculator: ReturnType<typeof createScheduleCalculationWorker>['calculator']) {
  const input = calculationInput()
  await expect(calculator.enumerate(input, { timeoutMs: 5000 })).resolves.toEqual({
    kind: 'completed',
    value: enumerateScheduleRecurrence(input),
  })
}

async function observeBusy(worker: Worker) {
  const before = await worker.cpuUsage()
  await delay(50)
  const elapsed = await worker.cpuUsage(before)
  expect(elapsed.user + elapsed.system).toBeGreaterThan(0)
  return elapsed
}

describe('real calculation lifecycle', () => {
  it(
    'runs at the configured parallelism without admitting beyond total capacity',
    { timeout: 15000 },
    async () => {
      const observed = observeThreads()
      const worker = createScheduleCalculationWorker({ maxConcurrent: 2, maxQueued: 0 })
      const controller = new AbortController()
      try {
        await warm(worker.calculator)
        const running = [1, 2].map(() =>
          worker.calculator.enumerate(blockingInput(), {
            timeoutMs: 10000,
            signal: controller.signal,
          }),
        )
        await expect(
          worker.calculator.enumerate(calculationInput(), { timeoutMs: 5000 }),
        ).resolves.toEqual({ kind: 'unavailable', reason: 'capacity' })
        await Promise.all(observed.threads.map(observeBusy))
        expect(observed.threads).toHaveLength(2)
        controller.abort()
        await expect(Promise.all(running)).resolves.toEqual([
          { kind: 'unavailable', reason: 'aborted' },
          { kind: 'unavailable', reason: 'aborted' },
        ])
      } finally {
        await worker.dispose()
        observed.stop()
      }
    },
  )

  it(
    'bounds admission and cancels queued work without cancelling the running task',
    { timeout: 15000 },
    async () => {
      const observed = observeThreads()
      const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 1 })
      const runningController = new AbortController()
      const queuedController = new AbortController()
      try {
        await warm(worker.calculator)
        const thread = observed.threads[0]
        if (!thread) throw new Error('The calculation worker was not created')
        let runningSettled = false
        const running = worker.calculator
          .enumerate(blockingInput(), {
            timeoutMs: 10000,
            signal: runningController.signal,
          })
          .then(result => {
            runningSettled = true
            return result
          })
        await observeBusy(thread)
        const queued = worker.calculator.enumerate(calculationInput(), {
          timeoutMs: 5000,
          signal: queuedController.signal,
        })
        await expect(
          worker.calculator.enumerate(calculationInput(), { timeoutMs: 5000 }),
        ).resolves.toEqual({ kind: 'unavailable', reason: 'capacity' })
        queuedController.abort()
        await expect(queued).resolves.toEqual({ kind: 'unavailable', reason: 'aborted' })
        await expect(
          worker.calculator.enumerate(calculationInput(), { timeoutMs: 30 }),
        ).resolves.toEqual({ kind: 'unavailable', reason: 'deadline' })
        expect(runningSettled).toBe(false)
        expect(observed.exited.has(thread)).toBe(false)
        runningController.abort()
        await expect(running).resolves.toEqual({ kind: 'unavailable', reason: 'aborted' })
        await warm(worker.calculator)
        await expect.poll(() => observed.exited.has(thread), { timeout: 5000 }).toBe(true)
        expect(observed.threads.length).toBeGreaterThan(1)
      } finally {
        await worker.dispose()
        observed.stop()
      }
    },
  )

  it(
    'terminates a running deadline while the main event loop remains responsive',
    { timeout: 15000 },
    async () => {
      const observed = observeThreads()
      const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 0 })
      try {
        await warm(worker.calculator)
        const thread = observed.threads[0]
        if (!thread) throw new Error('The calculation worker was not created')
        let settled = false
        const startedAt = performance.now()
        const running = worker.calculator
          .enumerate(blockingInput(), { timeoutMs: 500 })
          .then(result => {
            settled = true
            return result
          })
        const cpu = await observeBusy(thread)
        expect(settled).toBe(false)
        await expect(running).resolves.toEqual({ kind: 'unavailable', reason: 'deadline' })
        await expect.poll(() => observed.exited.has(thread), { timeout: 5000 }).toBe(true)
        await warm(worker.calculator)
        console.info(
          JSON.stringify({
            observation: 'deadline-exit-and-recovery',
            cpuDuringMainLoopWait: cpu,
            elapsedThroughRecoveryMs: performance.now() - startedAt,
            oldThreadExited: observed.exited.has(thread),
            threadsCreated: observed.threads.length,
          }),
        )
      } finally {
        await worker.dispose()
        observed.stop()
      }
    },
  )

  it(
    'disposes running and queued calls once and waits for every thread exit',
    { timeout: 15000 },
    async () => {
      const observed = observeThreads()
      const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 1 })
      try {
        await warm(worker.calculator)
        const thread = observed.threads[0]
        if (!thread) throw new Error('The calculation worker was not created')
        const running = worker.calculator.enumerate(blockingInput(), { timeoutMs: 10000 })
        await observeBusy(thread)
        const queued = worker.calculator.enumerate(calculationInput(), { timeoutMs: 10000 })
        const disposal = worker.dispose()
        expect(worker.dispose()).toBe(disposal)
        await expect(running).resolves.toEqual({ kind: 'unavailable', reason: 'disposed' })
        await expect(queued).resolves.toEqual({ kind: 'unavailable', reason: 'disposed' })
        await disposal
        expect(observed.exited.size).toBe(observed.threads.length)
        await expect(
          worker.calculator.enumerate(calculationInput(), { timeoutMs: 5000 }),
        ).resolves.toEqual({ kind: 'unavailable', reason: 'disposed' })
      } finally {
        await worker.dispose()
        observed.stop()
      }
    },
  )

  it(
    'waits for a just-aborted worker when dispose follows before its physical exit',
    { timeout: 15000 },
    async () => {
      const observed = observeThreads()
      const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 0 })
      const controller = new AbortController()
      try {
        await warm(worker.calculator)
        const thread = observed.threads[0]
        if (!thread) throw new Error('The calculation worker was not created')
        const running = worker.calculator.enumerate(blockingInput(), {
          timeoutMs: 10000,
          signal: controller.signal,
        })
        await observeBusy(thread)
        controller.abort()
        const disposal = worker.dispose()
        await expect(running).resolves.toEqual({ kind: 'unavailable', reason: 'aborted' })
        await disposal
        expect(observed.exited.size).toBe(observed.threads.length)
      } finally {
        await worker.dispose()
        observed.stop()
      }
    },
  )

  it(
    'does not replace an aborted worker after its replacement has exited during disposal',
    { timeout: 15000 },
    async () => {
      const observed = observeThreads()
      const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 0 })
      const exitGate = Promise.withResolvers<void>()
      const controller = new AbortController()
      let terminateSpy: ReturnType<typeof vi.spyOn> | undefined
      try {
        await warm(worker.calculator)
        const thread = observed.threads[0]
        if (!thread) throw new Error('The calculation worker was not created')
        const terminate = thread.terminate.bind(thread)
        terminateSpy = vi.spyOn(thread, 'terminate').mockImplementation(async () => {
          await exitGate.promise
          return terminate()
        })
        const running = worker.calculator.enumerate(blockingInput(), {
          timeoutMs: 10000,
          signal: controller.signal,
        })
        await observeBusy(thread)
        controller.abort()
        await expect(running).resolves.toEqual({ kind: 'unavailable', reason: 'aborted' })
        await expect
          .poll(() => observed.threads.length, { timeout: 5000 })
          .toBeGreaterThanOrEqual(2)
        const replacement = observed.threads[1]
        if (!replacement) throw new Error('The replacement worker was not created')
        const disposal = worker.dispose()
        await replacement.terminate()
        await delay(10)
        exitGate.resolve()
        await disposal
        expect(observed.exited.size).toBe(observed.threads.length)
        const count = observed.threads.length
        await delay(20)
        expect(observed.threads).toHaveLength(count)
      } finally {
        exitGate.resolve()
        terminateSpy?.mockRestore()
        await worker.dispose()
        observed.stop()
      }
    },
  )

  it(
    'reports a terminated worker as failure and admits work on its replacement',
    { timeout: 15000 },
    async () => {
      const observed = observeThreads()
      const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 0 })
      try {
        await warm(worker.calculator)
        const thread = observed.threads[0]
        if (!thread) throw new Error('The calculation worker was not created')
        const running = worker.calculator.enumerate(blockingInput(), { timeoutMs: 10000 })
        await observeBusy(thread)
        await thread.terminate()
        await expect(running).resolves.toEqual({ kind: 'unavailable', reason: 'workerFailure' })
        await warm(worker.calculator)
        expect(observed.threads.length).toBeGreaterThan(1)
      } finally {
        await worker.dispose()
        observed.stop()
      }
    },
  )
})
