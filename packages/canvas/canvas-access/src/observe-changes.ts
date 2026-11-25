import { createChangeObservation, type FrameOf } from '@omne-harness/access-cordis-contract'
import { tenantIdSchema } from '@omne-harness/canvas-contract'
import type { CanvasProtocol } from '@omne-harness/canvas-protocol'
import type { CanvasChanges, CanvasPrincipals } from './ports.ts'
import { tenantTextOf } from './projection.ts'

type ObserveChanges = CanvasProtocol['observations']['observe-changes']

export type CanvasObservationInput = Readonly<{
  principals: CanvasPrincipals
  changes: () => CanvasChanges | undefined
}>

const CHANGED: FrameOf<ObserveChanges> = Object.freeze({ kind: 'changed' })

/** One frame on opening, one per run of changes of this tenant, each after the login acts for it again. */
export function createCanvasObservation(input: CanvasObservationInput) {
  return createChangeObservation<ObserveChanges>({
    async admits(login, open) {
      const issued = await input.principals.actingFor(login, tenantTextOf(open.tenant))
      if ('ok' in issued) return 'admitted'
      return issued.refused === 'denied' ? 'denied' : 'basis-unavailable'
    },
    subscribe(open, listener) {
      const changes = input.changes()
      if (changes === undefined) return undefined
      const tenant = tenantIdSchema.parse(tenantTextOf(open.tenant))
      return changes.subscribe(tenant, {
        changed: () => listener.changed(),
        closed: () => listener.closed(),
      })
    },
    frame: CHANGED,
  })
}
