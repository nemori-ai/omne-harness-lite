import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { setTimeout } from 'node:timers/promises'
import type { ToolExecutor } from '@omne-harness/tool-contract/provider'

export type MonotonicReading = Readonly<{
  process: string
  clock: string
  generation: string
  atMs: number
}>

type MeasuredNumber =
  | Readonly<{ state: 'measured'; value: number }>
  | Readonly<{
      state: 'unmeasured'
      reason: 'not-provided' | 'invalid-count' | 'clock-mismatch' | 'invalid-time'
    }>

export type ToolMeasurementEvent = Readonly<{
  runId: string
  round: number
  eventKind: 'external-wait-interval'
  stage: 'tool-fixed-delay'
  provider: 'measured-fixed-delay-tool'
  invocationId: string
  definedDelay: Readonly<{ value: number; unit: 'ms' }>
  start: MonotonicReading
  end: MonotonicReading
  actualStart: MonotonicReading
  actualEnd: MonotonicReading
  elapsedMs: MeasuredNumber
  logCount: MeasuredNumber
  outcome: 'completed' | 'cancelled' | 'failed'
}>

export type ToolMeasurementContext = Readonly<{
  runId: string
  round: number
  logCount?: number
  clock?: Readonly<{ read(): MonotonicReading }>
  emit(event: ToolMeasurementEvent): void
}>

const generation = randomUUID()
const monotonicClock = {
  read: (): MonotonicReading => ({
    process: String(process.pid),
    clock: 'node:perf_hooks/performance.now',
    generation,
    atMs: performance.now(),
  }),
}

function elapsed(start: MonotonicReading, end: MonotonicReading): MeasuredNumber {
  if (
    start.process === '' ||
    start.clock === '' ||
    start.generation === '' ||
    start.process !== end.process ||
    start.clock !== end.clock ||
    start.generation !== end.generation
  )
    return { state: 'unmeasured', reason: 'clock-mismatch' }
  if (
    !Number.isFinite(start.atMs) ||
    !Number.isFinite(end.atMs) ||
    start.atMs < 0 ||
    end.atMs < start.atMs
  )
    return { state: 'unmeasured', reason: 'invalid-time' }
  return { state: 'measured', value: end.atMs - start.atMs }
}

function count(value: number | undefined): MeasuredNumber {
  if (value === undefined) return { state: 'unmeasured', reason: 'not-provided' }
  return Number.isSafeInteger(value) && value >= 0
    ? { state: 'measured', value }
    : { state: 'unmeasured', reason: 'invalid-count' }
}

/** Test/assembly instrumentation only. It measures this invocation, not Tool admission or delivery. */
export function createMeasuredFixedDelayTool<A, R, E>(
  options: Readonly<{
    definedDelayMs: number
    result: R
    measurement: ToolMeasurementContext | (() => ToolMeasurementContext)
    wait?: (delayMs: number, signal: AbortSignal) => Promise<void>
  }>,
): ToolExecutor<A, R, E> {
  const { definedDelayMs } = options
  if (!Number.isFinite(definedDelayMs) || definedDelayMs < 0 || definedDelayMs > 2_147_483_647)
    throw new RangeError('definedDelayMs must fit a nonnegative Node timer delay')
  return {
    async execute(_arguments, _environment, execution) {
      const measurement = {
        ...(typeof options.measurement === 'function'
          ? options.measurement()
          : options.measurement),
      }
      const clock = measurement.clock ?? monotonicClock
      const invocationId = randomUUID()
      const start = { ...clock.read() }
      let outcome: ToolMeasurementEvent['outcome'] = 'failed'
      try {
        execution.signal.throwIfAborted()
        if (options.wait) await options.wait(definedDelayMs, execution.signal)
        else await setTimeout(definedDelayMs, undefined, { signal: execution.signal })
        execution.signal.throwIfAborted()
        outcome = 'completed'
        return options.result
      } catch (error) {
        if (execution.signal.aborted) outcome = 'cancelled'
        throw error
      } finally {
        const end = { ...clock.read() }
        measurement.emit({
          runId: measurement.runId,
          round: measurement.round,
          eventKind: 'external-wait-interval',
          stage: 'tool-fixed-delay',
          provider: 'measured-fixed-delay-tool',
          invocationId,
          definedDelay: { value: definedDelayMs, unit: 'ms' },
          start,
          end,
          actualStart: start,
          actualEnd: end,
          elapsedMs: elapsed(start, end),
          logCount: count(measurement.logCount),
          outcome,
        })
      }
    },
  }
}
