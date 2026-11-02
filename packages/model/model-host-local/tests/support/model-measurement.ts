import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { setTimeout } from 'node:timers/promises'
import type {
  ModelRequestPreparation,
  ModelSendBoundary,
  TransportFact,
} from '@omne-harness/model-contract/provider'

export type MonotonicReading = Readonly<{
  process: string
  clock: string
  generation: string
  atMs: number
}>

export type MeasuredNumber =
  | Readonly<{ state: 'measured'; value: number }>
  | Readonly<{
      state: 'unmeasured'
      reason: 'not-provided' | 'invalid-count' | 'clock-mismatch' | 'invalid-time'
    }>

export type MeasurementContext = Readonly<{
  runId: string
  round: number
  logCount?: number | undefined
  clock?: Readonly<{ read(): MonotonicReading }> | undefined
  emit(event: ModelMeasurementEvent): void
}>

type Interval = Readonly<{
  runId: string
  round: number
  start: MonotonicReading
  end: MonotonicReading
  elapsedMs: MeasuredNumber
  logCount: MeasuredNumber
  outcome: 'completed' | 'cancelled' | 'failed'
}>

export type ModelMeasurementEvent = Interval &
  (
    | Readonly<{ eventKind: 'stage-interval'; stage: 'model-request-preparation' }>
    | Readonly<{
        eventKind: 'external-wait-interval'
        stage: 'model-fixed-delay'
        provider: 'measured-fixed-delay-model'
        invocationId: string
        definedDelay: Readonly<{ value: number; unit: 'ms' }>
        actualStart: MonotonicReading
        actualEnd: MonotonicReading
      }>
  )

const generation = randomUUID()
const monotonicClock = {
  read: (): MonotonicReading => ({
    process: String(process.pid),
    clock: 'node:perf_hooks/performance.now',
    generation,
    atMs: performance.now(),
  }),
}

function sample(clock: NonNullable<MeasurementContext['clock']>): MonotonicReading {
  const { process, clock: source, generation, atMs } = clock.read()
  return { process, clock: source, generation, atMs }
}

function elapsed(start: MonotonicReading, end: MonotonicReading): MeasuredNumber {
  if (
    start.process !== end.process ||
    start.clock !== end.clock ||
    start.generation !== end.generation ||
    start.process === '' ||
    start.clock === '' ||
    start.generation === ''
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

function interval(
  measurement: MeasurementContext,
  start: MonotonicReading,
  end: MonotonicReading,
  outcome: Interval['outcome'],
): Interval {
  return {
    runId: measurement.runId,
    round: measurement.round,
    start,
    end,
    elapsedMs: elapsed(start, end),
    logCount: count(measurement.logCount),
    outcome,
  }
}

export async function measureModelPreparation<P>(
  options: Readonly<{
    preparation: ModelRequestPreparation<P>
    input: Parameters<ModelRequestPreparation<P>['prepare']>[0]
    measurement: MeasurementContext
  }>,
): ReturnType<ModelRequestPreparation<P>['prepare']> {
  const { preparation, input } = options
  const measurement = { ...options.measurement }
  const clock = measurement.clock ?? monotonicClock
  const start = sample(clock)
  let outcome: Interval['outcome'] = 'failed'
  try {
    const result = await preparation.prepare(input)
    outcome = 'ok' in result ? 'completed' : 'failed'
    return result
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') outcome = 'cancelled'
    throw error
  } finally {
    const end = sample(clock)
    measurement.emit({
      ...interval(measurement, start, end, outcome),
      eventKind: 'stage-interval',
      stage: 'model-request-preparation',
    })
  }
}

export type FixedDelayModelOptions = Readonly<{
  definedDelayMs: number
  measurement: MeasurementContext | (() => MeasurementContext)
  facts?: readonly TransportFact[]
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>
}>

async function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  await setTimeout(delayMs, undefined, { signal })
}

async function* factsOf(facts: readonly TransportFact[]): AsyncIterable<TransportFact> {
  for (const fact of facts) yield structuredClone(fact)
}

export function createMeasuredFixedDelayModel<P>(
  options: FixedDelayModelOptions,
): ModelSendBoundary<P> {
  const definedDelayMs = options.definedDelayMs
  if (!Number.isFinite(definedDelayMs) || definedDelayMs < 0 || definedDelayMs > 2_147_483_647)
    throw new RangeError('definedDelayMs must fit a nonnegative Node timer delay')
  const facts = structuredClone(
    options.facts ?? [{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }],
  )
  return {
    async send(_input, signal) {
      const measurement = {
        ...(typeof options.measurement === 'function'
          ? options.measurement()
          : options.measurement),
      }
      const clock = measurement.clock ?? monotonicClock
      const invocationId = randomUUID()
      const start = sample(clock)
      let outcome: Interval['outcome'] = 'failed'
      try {
        signal.throwIfAborted()
        await (options.wait ?? wait)(definedDelayMs, signal)
        signal.throwIfAborted()
        outcome = 'completed'
        return { kind: 'started', window: invocationId, facts: factsOf(facts) }
      } catch (error) {
        if (!signal.aborted) throw error
        outcome = 'cancelled'
        return {
          kind: 'not-started',
          failure: {
            kind: 'unavailable',
            dependency: 'measured-fixed-delay-model',
            diagnostic: 'cancelled-before-start',
          },
        }
      } finally {
        const end = sample(clock)
        measurement.emit({
          ...interval(measurement, start, end, outcome),
          eventKind: 'external-wait-interval',
          stage: 'model-fixed-delay',
          provider: 'measured-fixed-delay-model',
          invocationId,
          definedDelay: { value: definedDelayMs, unit: 'ms' },
          actualStart: start,
          actualEnd: end,
        })
      }
    },
  }
}
