import type { CalendarCallContext } from '@omne-harness/calendar-contract'
import {
  calendarRunnerConfigurationSchema,
  type CalendarSupplyRunnerOptions,
} from './configuration.ts'
import { drain } from './drain.ts'
import type {
  CalendarRunnerCycle,
  CalendarRunnerEvent,
  CalendarRunnerPhase,
  CalendarRunnerStop,
} from './events.ts'

export type { CalendarRunnerConfiguration, CalendarSupplyRunnerOptions } from './configuration.ts'
export type {
  CalendarRunnerCycle,
  CalendarRunnerEvent,
  CalendarRunnerPhase,
  CalendarRunnerStop,
} from './events.ts'

export function createCalendarSupplyRunner(options: CalendarSupplyRunnerOptions) {
  const { supply, ...configuration } = options
  const config = calendarRunnerConfigurationSchema.parse(configuration)
  let state: 'idle' | 'running' | 'stopped' = 'idle'
  let initialized = false
  let seeded = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<CalendarRunnerCycle> | undefined
  let stopping: Promise<CalendarRunnerStop> | undefined
  let observerFailure: string | null = null

  async function observe(event: CalendarRunnerEvent) {
    try {
      await config.observer.observe(event)
    } catch (error) {
      observerFailure = `${config.observer.name}: ${String(error)}`
    }
  }

  async function initialize(
    context: CalendarCallContext,
    report: (event: CalendarRunnerEvent) => Promise<void>,
  ) {
    let phase: CalendarRunnerPhase = 'importSeed'
    try {
      if (!seeded) {
        if (config.seed === null) await report({ kind: 'seedSkipped', reason: 'notConfigured' })
        else {
          const result = await supply.importSeed(context, config.seed)
          await report({ kind: 'result', phase: 'importSeed', result })
          if (
            result.kind !== 'ok' ||
            result.value.results.some(
              item =>
                item.outcome.kind !== 'recorded' ||
                !['published', 'noChange'].includes(item.outcome.receipt.disposition),
            )
          )
            return
        }
        seeded = true
      }
      if (state !== 'running') return
      phase = 'initialize'
      const result = await supply.initialize(context, {
        operationKey: config.initializationOperationKey,
      })
      await report({ kind: 'result', phase: 'initialize', result })
      initialized = result.kind === 'ok'
    } catch (error) {
      await report({ kind: 'failure', phase, message: String(error) })
    }
  }

  async function runPhases(
    context: CalendarCallContext,
    report: (event: CalendarRunnerEvent) => Promise<void>,
  ) {
    for (const phase of ['recover', 'runDue', 'deliverReactions'] as const) {
      if (state !== 'running') break
      if (!config.phases[phase]) continue
      try {
        if (phase === 'deliverReactions')
          await report({
            kind: 'result',
            phase,
            result: await supply.deliverReactions(context, {
              limit: config.limit,
              acknowledgementKey: config.acknowledgementKey,
            }),
          })
        else if (phase === 'recover')
          await report({
            kind: 'result',
            phase,
            result: await supply.recover(context, { limit: config.limit }),
          })
        else
          await report({
            kind: 'result',
            phase,
            result: await supply.runDue(context, { limit: config.limit }),
          })
      } catch (error) {
        await report({ kind: 'failure', phase, message: String(error) })
        break
      }
    }
  }

  async function cycle(): Promise<CalendarRunnerCycle> {
    const events: CalendarRunnerEvent[] = []
    const report = async (event: CalendarRunnerEvent) => {
      events.push(event)
      await observe(event)
    }
    try {
      if (state !== 'running') return { kind: 'stopped', events, observerFailure }
      const context = await config.contextSupplier()
      if (state !== 'running') return { kind: 'stopped', events, observerFailure }
      if (!initialized) await initialize(context, report)
      if (initialized) await runPhases(context, report)
    } catch (error) {
      await report({ kind: 'failure', phase: 'context', message: String(error) })
    }
    return { kind: state === 'stopped' ? 'stopped' : 'settled', events, observerFailure }
  }

  function tick(): Promise<CalendarRunnerCycle> {
    if (state !== 'running')
      return Promise.resolve({ kind: 'stopped', events: [], observerFailure })
    if (pending) return pending
    clearTimeout(timer)
    pending = Promise.resolve()
      .then(cycle)
      .finally(() => {
        pending = undefined
        if (state === 'running')
          timer = setTimeout(() => {
            void tick()
          }, config.intervalMs)
      })
    return pending
  }

  function stop(): Promise<CalendarRunnerStop> {
    if (stopping) return stopping
    state = 'stopped'
    clearTimeout(timer)
    let supplyStop: CalendarRunnerStop['supplyStop']
    try {
      supplyStop = { kind: 'returned', value: supply.stop() }
    } catch (error) {
      supplyStop = { kind: 'failed', message: String(error) }
    }
    stopping = (async () => {
      const inFlight = await drain(pending ?? Promise.resolve(), config.drainTimeoutMs)
      const report: CalendarRunnerStop = {
        kind: 'stopped',
        timer: 'cleared',
        inFlight,
        durableRuns: 'retained',
        supplyStop,
        observerFailure,
      }
      // Observer completion is part of the bounded drain, never an unbounded disposer wait.
      const notification = observe(report)
      const notificationState = await drain(notification, config.drainTimeoutMs)
      if (notificationState === 'retained')
        observerFailure = `${config.observer.name}: stop observation retained`
      return { ...report, observerFailure }
    })()
    return stopping
  }

  return {
    start() {
      if (state === 'idle') state = 'running'
      return tick()
    },
    tick,
    stop,
    inspect: () => ({
      state,
      inFlight: pending ? ('pending' as const) : ('settled' as const),
      observerFailure,
    }),
  }
}

export type CalendarSupplyRunner = ReturnType<typeof createCalendarSupplyRunner>
