// 一次观察 (RFC-0015 §8, §13): the only exit of frames. It runs the locate axis, asks the refresh
// budget when to locate again, and tears down its own reads, notices and waits on abort. It never
// cancels a Model call and writes nothing.
//
// Block 1 of #1248: the locate never asks the Model, so the stream axis stays「没有目标」and `phase`
// and `target` stay null. Block 2 adds the stream subscription.
import type { SessionAccess } from '@omne-harness/session-contract'
import {
  FrameTranslator,
  type SessionObservationEnd,
  type SessionObservationFrame,
  type StateFields,
} from './frames.ts'
import { Locator, LOCATE_KINDS, type Located } from './locate.ts'
import type { SessionObservationPorts } from './ports.ts'
import { RefreshBudget } from './refresh-budget.ts'

export type SessionObservationOpen =
  | Readonly<{
      kind: 'opened'
      frames: AsyncGenerator<SessionObservationFrame, SessionObservationEnd | undefined>
    }>
  /** The log read was refused, the session does not exist, or its identity is not valid: one answer. */
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

export interface SessionObservation<P> {
  open(
    input: Readonly<{ access: SessionAccess<P>; signal: AbortSignal }>,
  ): Promise<SessionObservationOpen>
}

function fieldsOf(view: Located): StateFields {
  return { run: view.run, revision: view.revision, phase: null, target: null }
}

/** Session observation over its ports. */
export function createSessionObservation<P>(
  ports: SessionObservationPorts<P>,
): SessionObservation<P> {
  const wakers = new Set([...LOCATE_KINDS, ...ports.historyKinds])
  return {
    async open({ access, signal }) {
      const locator = new Locator(access, ports)
      let wake: AbortController | undefined
      const unsubscribe = ports.notices(
        { tenant: access.tenant, session: access.session },
        kinds => {
          if (!kinds.some(kind => wakers.has(kind))) return
          locator.note()
          wake?.abort()
        },
      )
      let closed = false
      const teardown = (): void => {
        if (closed) return
        closed = true
        signal.removeEventListener('abort', teardown)
        unsubscribe()
        wake?.abort()
      }
      signal.addEventListener('abort', teardown)
      const first = await locator.open()
      if (first.kind !== 'located' || signal.aborted) {
        teardown()
        return first.kind === 'located' ? { kind: 'unavailable' } : first
      }
      const opened = first.view
      const budget = new RefreshBudget(ports.policy, ports.diagnose)
      async function* frames(): AsyncGenerator<
        SessionObservationFrame,
        SessionObservationEnd | undefined
      > {
        const translator = new FrameTranslator()
        try {
          yield translator.state(fieldsOf(opened)) as SessionObservationFrame
          for (;;) {
            if (signal.aborted) return undefined
            let interval = false
            if (!locator.take()) {
              if (budget.exhausted()) return 'refresh-exhausted'
              wake = new AbortController()
              const waited = await ports.wait(budget.delay(), wake.signal)
              wake = undefined
              if (signal.aborted) return undefined
              interval = !locator.take()
              if (interval && waited === 'elapsed') budget.waited()
            }
            const result = await locator.locate()
            if (signal.aborted) return undefined
            if (result.kind !== 'located') return result.kind
            const state = translator.state(fieldsOf(result.view))
            if (state !== null) yield state
            if (interval) {
              yield { kind: 'refreshing' }
              budget.tick()
            }
          }
        } finally {
          teardown()
        }
      }
      return { kind: 'opened', frames: frames() }
    },
  }
}
