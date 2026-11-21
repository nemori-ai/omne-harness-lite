import type { ContextCopies, ContextMoment, PortRead } from '@omne-harness/dispatch'
import { forkPointText } from '@omne-harness/session-contract'
import type { SessionCalls } from './ports.ts'
import { legalTenantOf } from './sources.ts'
import { UNAVAILABLE, read, sessionId } from './support.ts'

const NONE: PortRead<ContextMoment> = read({ kind: 'none' })

/** The moment of a spawn is the point Session names for the dispatching session now: the dispatching call
 * runs inside a step, so that point is what the model was given for the request that made the call. */
export function createContextCopies(calls: Pick<SessionCalls, 'forkPoint'>): ContextCopies {
  return {
    async moment(tenant, dispatcher): Promise<PortRead<ContextMoment>> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return NONE
      const point = await calls
        .forkPoint({ tenant: legal, session: sessionId(dispatcher) })
        .catch(() => UNAVAILABLE)
      if (point.kind !== 'read') return UNAVAILABLE
      if (point.value === null) return NONE
      return read({ kind: 'moment', moment: forkPointText(point.value) })
    },
  }
}
