// A controllable `AgentClock`. Time moves only when the test moves it, so a wait never depends on the
// wall clock. A wait resolves `elapsed` when the test moves the clock to or past its instant, and
// `cancelled` when its signal aborts first.
import type { AgentClock, AgentInstant, Failure } from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export type ManualAgentClock = Readonly<{
  port: AgentClock
  /** The current instant of the clock. */
  now(): AgentInstant
  /**
   * Moves the clock to `instant` and resolves every wait whose instant is not later. Returns
   * `invalid` for a text that is not an RFC 3339 UTC instant, and for an instant before the current
   * one: the clock never goes back.
   */
  advanceTo(instant: AgentInstant): Outcome<number, Failure>
  /** The instants of the waits that are still open, in the order they started. */
  pending(): readonly AgentInstant[]
}>

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u

/** The milliseconds of an RFC 3339 UTC instant, or `undefined` for any other text. */
function millisecondsOf(instant: AgentInstant): number | undefined {
  if (!UTC_INSTANT.test(instant)) return undefined
  const value = Date.parse(instant)
  return Number.isNaN(value) ? undefined : value
}

type OpenWait = {
  instant: AgentInstant
  at: number
  settle(value: 'elapsed' | 'cancelled'): void
}

/** Creates a clock at `start`, by default `1970-01-01T00:00:00Z`. */
export function createManualAgentClock(
  start: AgentInstant = '1970-01-01T00:00:00Z',
): ManualAgentClock {
  const startAt = millisecondsOf(start)
  if (startAt === undefined)
    throw new TypeError(`clock start ${start} is not an RFC 3339 UTC instant`)
  let current = start
  let currentAt = startAt
  const open = new Set<OpenWait>()

  const port: AgentClock = {
    waitUntil(instant, signal) {
      const at = millisecondsOf(instant)
      if (at === undefined) {
        return Promise.resolve(
          fail<Failure>({
            kind: 'invalid',
            field: 'instant',
            reason: 'not an RFC 3339 UTC instant',
          }),
        )
      }
      if (signal.aborted) return Promise.resolve(succeed('cancelled' as const))
      if (at <= currentAt) return Promise.resolve(succeed('elapsed' as const))
      return new Promise(resolve => {
        const wait: OpenWait = {
          instant,
          at,
          settle(value) {
            open.delete(wait)
            signal.removeEventListener('abort', onAbort)
            resolve(succeed(value))
          },
        }
        const onAbort = () => wait.settle('cancelled')
        signal.addEventListener('abort', onAbort, { once: true })
        open.add(wait)
      })
    },
  }

  return {
    port,
    now: () => current,
    advanceTo(instant) {
      const at = millisecondsOf(instant)
      if (at === undefined) {
        return fail({ kind: 'invalid', field: 'instant', reason: 'not an RFC 3339 UTC instant' })
      }
      if (at < currentAt) {
        return fail({ kind: 'invalid', field: 'instant', reason: 'the clock does not go back' })
      }
      current = instant
      currentAt = at
      const due = [...open].filter(wait => wait.at <= at)
      for (const wait of due) wait.settle('elapsed')
      return succeed(due.length)
    },
    pending: () => [...open].map(wait => wait.instant),
  }
}
