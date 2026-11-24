import type { EndOf, FrameOf, FrameSource } from '@omne-harness/access-cordis-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ScheduleFaces, SchedulePrincipals } from './ports.ts'

type ObserveJobs = ScheduleProtocol['observations']['observe-jobs']

const CHANGED: FrameOf<ObserveJobs> = Object.freeze({ kind: 'changed' })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })

async function admitted(principals: SchedulePrincipals, login: never, tenant: string) {
  try {
    const answer = await principals.actingFor(login, tenant)
    return 'ok' in answer ? 'admitted' : answer.refused
  } catch {
    return 'basis-unavailable'
  }
}

/** A frame only says the tenant's Jobs or history may have changed; the client reads again. */
export function createJobObservation(
  input: Readonly<{ principals: SchedulePrincipals; faces: () => ScheduleFaces | undefined }>,
): FrameSource<ObserveJobs> {
  return async (context, open) => {
    const encoded = tenantCodec.encode(open.tenant)
    if (!encoded.ok) return UNAVAILABLE
    const tenant = encoded.value
    const login = context.principal as never
    const first = await admitted(input.principals, login, tenant)
    if (first === 'denied') return DENIED
    if (first !== 'admitted') return UNAVAILABLE
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const state = { pending: true, closed: false }
    let wake: (() => void) | undefined
    const rouse = (): void => {
      const resolve = wake
      wake = undefined
      resolve?.()
    }
    let unwatch: () => void
    try {
      unwatch = faces.jobs.watch(tenant, {
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
      unwatch()
    }
    const onAbort = (): void => {
      release()
      rouse()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    async function* frames(): AsyncGenerator<FrameOf<ObserveJobs>, EndOf<ObserveJobs>> {
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
          const current = await admitted(input.principals, login, tenant)
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
