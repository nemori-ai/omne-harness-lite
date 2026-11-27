import type { EndOf, FrameOf, FrameSource } from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { McpProtocol } from '@omne-harness/mcp-protocol'
import type { McpFaces, McpPrincipals } from './ports.ts'

type ObserveEndpoints = McpProtocol['observations']['observe-endpoints']
type Frame = FrameOf<ObserveEndpoints>

export type EndpointObservationInput = Readonly<{
  principals: McpPrincipals
  faces: () => McpFaces | undefined
}>

const ENDPOINTS: Frame = Object.freeze({ kind: 'changed', about: 'endpoints' })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })

type Admission = 'admitted' | 'denied' | 'unavailable'

const textOf = (tenant: TenantId): string | undefined => {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : undefined
}

/** The first frame comes at once: nothing is missed between the observer's last read and its subscription. */
export function createEndpointObservation(
  input: EndpointObservationInput,
): FrameSource<ObserveEndpoints> {
  return async (context, open) => {
    const tenantText = textOf(open.tenant)
    if (tenantText === undefined) return UNAVAILABLE

    /** Asked again before every frame: an observer that lost the tenant hears nothing more. */
    async function admission(): Promise<Admission> {
      try {
        const issued = await input.principals.actingFor(context.principal, tenantText as string)
        if ('ok' in issued) return 'admitted'
        return issued.refused === 'denied' ? 'denied' : 'unavailable'
      } catch {
        return 'unavailable'
      }
    }

    const admitted = await admission()
    if (admitted !== 'admitted') return admitted === 'denied' ? DENIED : UNAVAILABLE
    const status = input.faces()?.status
    if (status === undefined) return UNAVAILABLE

    let pending = true
    let closed = false
    let wake: (() => void) | undefined
    const rouse = (): void => {
      const resolve = wake
      wake = undefined
      resolve?.()
    }
    let unsubscribe: () => void
    try {
      unsubscribe = status.subscribe({
        changed(tenant) {
          if (textOf(tenant) !== tenantText) return
          pending = true
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

    async function* frames(): AsyncGenerator<Frame, EndOf<ObserveEndpoints>> {
      try {
        for (;;) {
          if (signal.aborted || closed) return 'unavailable'
          if (!pending) {
            await new Promise<void>(resolve => {
              wake = resolve
            })
            continue
          }
          const current = await admission()
          if (current !== 'admitted') return current
          pending = false
          yield ENDPOINTS
        }
      } finally {
        release()
      }
    }

    return { outcome: 'succeeded', frames: frames() }
  }
}
