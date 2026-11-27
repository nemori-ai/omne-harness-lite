import type { LiveSession, ModelClock, SendDemand } from '@omne-harness/model-contract/provider'
import type { LiveBodies } from './registry.ts'
import { LiveRunner, type LiveDeadlines, type LiveEventPort } from './runner.ts'

/** Where the events of a live call go, how many it holds, and its deadlines. */
export type LiveHosting = Readonly<{
  events: LiveEventPort
  capacity: number
  deadlines: LiveDeadlines
}>
/** Starts the body of a live call whose session opened, and holds it where its three entries find it. */
export type DriverLive<P> = Readonly<{
  run(demand: SendDemand<P>, session: LiveSession): LiveRunner
}>

const LIVE_DEADLINES = ['openMs', 'closeMs', 'drainMs', 'redeliverMs'] as const
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
export function validLive(live: unknown): boolean {
  if (!record(live) || !record(live.events) || !record(live.deadlines)) return false
  const { deliver, exited } = live.events
  if (typeof deliver !== 'function' || typeof exited !== 'function') return false
  if (!Number.isSafeInteger(live.capacity) || Number(live.capacity) < 1) return false
  const { deadlines } = live
  return LIVE_DEADLINES.every(
    field => Number.isSafeInteger(deadlines[field]) && Number(deadlines[field]) >= 0,
  )
}

export function liveStarter<P>(
  hosting: LiveHosting,
  clock: ModelClock,
  bodies: LiveBodies,
  refuse: (demand: SendDemand<P>) => Promise<void>,
): DriverLive<P> {
  return {
    run(demand, session) {
      const { tenant, call, request } = demand
      const runner = new LiveRunner({
        tenant,
        call,
        consumer: demand.consumer,
        session,
        capacity: hosting.capacity,
        takes: request.kind === 'live' ? request.input : [],
        deadlines: hosting.deadlines,
        clock,
        port: hosting.events,
        refuse: () => refuse(demand),
      })
      bodies.hold(demand, runner)
      void runner.exited.then(() => hosting.events.exited({ tenant, call }))
      return runner
    },
  }
}
