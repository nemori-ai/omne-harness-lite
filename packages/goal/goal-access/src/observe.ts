import type { EndOf, FrameOf, FrameSource } from '@omne-harness/access-cordis-contract'
import type { goalProtocol } from '@omne-harness/goal-protocol'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { GoalChangeFeed, GoalEntrance } from './ports.ts'

type ObserveGoal = (typeof goalProtocol)['observations']['observe-goal']

export type GoalObservationInput = Readonly<{
  entrance: GoalEntrance
  changes: () => GoalChangeFeed | undefined
}>

const CHANGED: FrameOf<ObserveGoal> = Object.freeze({ kind: 'changed' })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })

/** Frames that say only that the goal of one session may have changed: the first comes at once, and whoever reads them reads the goal again. */
export function createGoalObservation(input: GoalObservationInput): FrameSource<ObserveGoal> {
  const admitted = (context: Parameters<FrameSource<ObserveGoal>>[0], open: { tenant: never }) =>
    Promise.resolve()
      .then(() => input.entrance.admit(context.principal, open.tenant))
      .then(entry => entry.kind)
      .catch(() => 'basis-unavailable' as const)

  return async (context, open) => {
    const tenant = tenantCodec.encode(open.tenant)
    const entry = await admitted(context, open as never)
    if (entry === 'denied') return DENIED
    const changes = input.changes()
    if (entry !== 'admitted' || !tenant.ok || changes === undefined) return UNAVAILABLE

    const state = { pending: true, closed: false }
    let wake: (() => void) | undefined
    const rouse = (): void => {
      const resolve = wake
      wake = undefined
      resolve?.()
    }
    let unsubscribe: () => void
    try {
      unsubscribe = changes.subscribe(tenant.value, open.session, {
        changed() {
          state.pending = true
          rouse()
        },
        closed() {
          state.closed = true
          rouse()
        },
      })
    } catch {
      return UNAVAILABLE
    }
    const { signal } = context
    const release = (): void => {
      signal.removeEventListener('abort', onAbort)
      unsubscribe()
    }
    const onAbort = (): void => {
      release()
      rouse()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()

    async function* frames(): AsyncGenerator<FrameOf<ObserveGoal>, EndOf<ObserveGoal>> {
      try {
        for (;;) {
          if (signal.aborted || state.closed) return 'unavailable'
          if (!state.pending) {
            await new Promise<void>(resolve => {
              wake = resolve
            })
            continue
          }
          state.pending = false
          const current = await admitted(context, open as never)
          if (current !== 'admitted') return current === 'denied' ? 'denied' : 'unavailable'
          yield CHANGED
        }
      } finally {
        release()
      }
    }
    return { outcome: 'succeeded', frames: frames() }
  }
}
