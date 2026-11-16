import type { EndOf, FrameOf, FrameSource } from '@omne-harness/access-cordis-contract'
import type { HumanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { tenantTextOf } from './derivation.ts'
import type { CardChanges, LoginTenants } from './ports.ts'

type ObserveCards = HumanInterventionProtocol['observations']['observe-cards']
type Login = Parameters<LoginTenants['admits']>[0]
type Admission = Awaited<ReturnType<LoginTenants['admits']>>

export type CardObservationInput = Readonly<{
  logins: LoginTenants
  changes: () => CardChanges | undefined
}>

const CHANGED: FrameOf<ObserveCards> = Object.freeze({ kind: 'changed' })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })

export async function loginAdmission(
  logins: LoginTenants,
  login: Login,
  tenant: string,
): Promise<Admission> {
  try {
    const answer = await logins.admits(login, tenant)
    return answer === 'admitted' || answer === 'denied' ? answer : 'basis-unavailable'
  } catch {
    return 'basis-unavailable'
  }
}

export function createCardObservation(input: CardObservationInput): FrameSource<ObserveCards> {
  return async (context, open) => {
    const tenantText = tenantTextOf(open.tenant)
    const admitted = await loginAdmission(input.logins, context.principal, tenantText)
    if (admitted === 'denied') return DENIED
    if (admitted !== 'admitted') return UNAVAILABLE
    const changes = input.changes()
    if (changes === undefined) return UNAVAILABLE

    const state = { pending: true, closed: false }
    let wake: (() => void) | undefined
    const rouse = (): void => {
      const resolve = wake
      wake = undefined
      resolve?.()
    }
    let unsubscribe: () => void
    try {
      unsubscribe = changes.subscribe(tenantText, {
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

    async function* frames(): AsyncGenerator<FrameOf<ObserveCards>, EndOf<ObserveCards>> {
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
          const current = await loginAdmission(input.logins, context.principal, tenantText)
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
