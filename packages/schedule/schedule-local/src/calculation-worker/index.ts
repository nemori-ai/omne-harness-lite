import type { Worker } from 'node:worker_threads'
import { Piscina } from 'piscina'
import type {
  ScheduleCalculationRunResult,
  ScheduleEnumerationInput,
  ScheduleEnumerationResult,
  ScheduleRecurrenceCalculator,
} from '@omne-harness/schedule'

type UnavailableReason = Extract<ScheduleCalculationRunResult, { kind: 'unavailable' }>['reason']
type RunOptions = Parameters<ScheduleRecurrenceCalculator['enumerate']>[1]

const monotonicMs = () =>
  /* wall-clock: operation-timing -- Bound queued and running calculation time. */ performance.now()

export function createScheduleCalculationWorker(options: {
  maxConcurrent: number
  maxQueued: number
}): { calculator: ScheduleRecurrenceCalculator; dispose(): Promise<void> } {
  const capacity = calculationCapacity(options)
  const pool = new Piscina<ScheduleEnumerationInput, ScheduleEnumerationResult>({
    // Both source and compiled imports start this package's compiled entry.
    filename: new URL('../../dist/calculation-worker/entry.js', import.meta.url).href,
    minThreads: options.maxConcurrent,
    maxThreads: options.maxConcurrent,
    maxQueue: capacity,
    concurrentTasksPerWorker: 1,
    recordTiming: false,
  })
  const pending = new Set<(reason: UnavailableReason) => void>()
  const exits = new Map<Worker, Promise<void>>()
  let shutdown: Promise<void> | undefined

  function observeThreads(): void {
    for (const thread of pool.threads) {
      if (exits.has(thread)) continue
      exits.set(
        thread,
        new Promise(resolve => {
          thread.once('exit', () => {
            exits.delete(thread)
            resolve()
          })
        }),
      )
    }
  }

  pool.on('workerCreate', observeThreads)
  pool.on('error', () => {
    observeThreads()
    for (const stop of pending) stop('workerFailure')
  })
  observeThreads()

  function run(input: ScheduleEnumerationInput, options: RunOptions, deadline: number) {
    return new Promise<ScheduleCalculationRunResult>(resolve => {
      const controller = new AbortController()
      let settled = false
      const onAbort = () => stop('aborted')
      const timer = setTimeout(
        () => stop('deadline'),
        Math.max(1, Math.ceil(deadline - monotonicMs())),
      )

      function settle(result: ScheduleCalculationRunResult): boolean {
        if (settled) return false
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        pending.delete(stop)
        resolve(result)
        return true
      }

      function stop(reason: UnavailableReason): void {
        if (
          !settle({
            kind: 'unavailable',
            reason: monotonicMs() >= deadline ? 'deadline' : reason,
          })
        )
          return
        if (reason !== 'disposed') {
          controller.abort()
          observeThreads()
        }
      }

      pending.add(stop)
      options.signal?.addEventListener('abort', onAbort, { once: true })
      try {
        const result = pool.run(input, { signal: controller.signal })
        observeThreads()
        result.then(
          value => {
            if (monotonicMs() >= deadline) stop('deadline')
            else settle({ kind: 'completed', value })
          },
          () => stop('workerFailure'),
        )
      } catch {
        stop('workerFailure')
      }
    })
  }

  const calculator: ScheduleRecurrenceCalculator = {
    async enumerate(input, options) {
      const deadline = monotonicMs() + options.timeoutMs
      if (
        !Number.isInteger(options.timeoutMs) ||
        options.timeoutMs < 1 ||
        options.timeoutMs > 2147483647
      )
        throw new TypeError('timeoutMs must be an integer from 1 to 2147483647')
      if (options.signal?.aborted) return { kind: 'unavailable', reason: 'aborted' }
      if (shutdown) return { kind: 'unavailable', reason: 'disposed' }
      if (pending.size >= capacity) return { kind: 'unavailable', reason: 'capacity' }
      return run(input, options, deadline)
    },
  }

  function dispose(): Promise<void> {
    if (shutdown) return shutdown
    const completion = Promise.withResolvers<void>()
    shutdown = completion.promise
    for (const stop of pending) stop('disposed')
    // Aborted threads leave Piscina's pool before their physical exit.
    const stopped = [...exits.values()]
    Promise.all([pool.destroy(), ...stopped]).then(() => completion.resolve(), completion.reject)
    return shutdown
  }

  return { calculator, dispose }
}

function calculationCapacity(options: { maxConcurrent: number; maxQueued: number }): number {
  const capacity = options.maxConcurrent + options.maxQueued
  if (
    !Number.isSafeInteger(options.maxConcurrent) ||
    options.maxConcurrent < 1 ||
    !Number.isSafeInteger(options.maxQueued) ||
    options.maxQueued < 0 ||
    !Number.isSafeInteger(capacity)
  )
    throw new TypeError(
      'maxConcurrent must be positive and maxQueued nonnegative, with a safe integer total',
    )
  return capacity
}
