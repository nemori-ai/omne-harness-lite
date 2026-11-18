import type { EndOf, FrameOf, FrameSource } from '@omne-harness/access-cordis-contract'
import type { NotificationProtocol } from '@omne-harness/notification-protocol'
import type { NotificationChangeFeed, NotificationPrincipals } from './ports.ts'
import { tenantTextOf } from './projection.ts'

type ObserveChanges = NotificationProtocol['observations']['observe-changes']
type Frame = FrameOf<ObserveChanges>
type About = Frame['about']

export type ChangeObservationInput = Readonly<{
  principals: NotificationPrincipals
  changes: () => NotificationChangeFeed | undefined
}>

const ABOUT: readonly About[] = ['inbox', 'catalog']
const FRAMES: Readonly<Record<About, Frame>> = {
  inbox: Object.freeze({ kind: 'changed', about: 'inbox' }),
  catalog: Object.freeze({ kind: 'changed', about: 'catalog' }),
}
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })

type Admission = 'admitted' | 'denied' | 'unavailable'

/** The first frames come at once: nothing is missed between the observer's last read and its subscription. */
export function createChangeObservation(
  input: ChangeObservationInput,
): FrameSource<ObserveChanges> {
  return async (context, open) => {
    const tenantText = tenantTextOf(open.tenant)

    /** Asked again before every frame: an observer that lost the tenant hears nothing more. */
    async function admission(): Promise<Admission> {
      try {
        const issued = await input.principals.actingFor(context.principal, tenantText)
        if ('ok' in issued) return 'admitted'
        return issued.refused === 'denied' ? 'denied' : 'unavailable'
      } catch {
        return 'unavailable'
      }
    }

    const admitted = await admission()
    if (admitted !== 'admitted') return admitted === 'denied' ? DENIED : UNAVAILABLE
    const changes = input.changes()
    if (changes === undefined) return UNAVAILABLE

    const pending = new Set<About>(ABOUT)
    let closed = false
    let wake: (() => void) | undefined
    const rouse = (): void => {
      const resolve = wake
      wake = undefined
      resolve?.()
    }
    let unsubscribe: () => void
    try {
      unsubscribe = changes.subscribe({
        changed(change) {
          if (change.kind === 'inbox' && change.tenant !== tenantText) return
          pending.add(change.kind)
          rouse()
        },
        closed() {
          closed = true
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
    signal.addEventListener('abort', onAbort)
    if (signal.aborted) onAbort()

    async function* frames(): AsyncGenerator<Frame, EndOf<ObserveChanges>> {
      try {
        for (;;) {
          if (signal.aborted || closed) return 'unavailable'
          if (pending.size === 0) {
            await new Promise<void>(resolve => {
              wake = resolve
            })
            continue
          }
          const current = await admission()
          if (current !== 'admitted') return current
          for (const about of ABOUT) if (pending.delete(about)) yield FRAMES[about]
        }
      } finally {
        release()
      }
    }

    return { outcome: 'succeeded', frames: frames() }
  }
}
