import type { PortRead } from '@omne-harness/dispatch'
import type { SessionRef } from '@omne-harness/dispatch-contract'
import type { TenantId as LegalTenant } from '@omne-harness/legal-identity'
import type { Modes, SessionFailure, SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import type { Called, SessionCalls } from './ports.ts'

export const UNAVAILABLE = { kind: 'unavailable' } as const
type Unavailable = typeof UNAVAILABLE
export const read = <T>(value: T): PortRead<T> => ({ kind: 'read', value })
export const sessionId = (ref: SessionRef) => ref as unknown as SessionId

/** Results that say nothing of whether the call was committed: the same call is made again later. */
export const UNSETTLED = new Set<SessionFailure['kind']>([
  'commit-unknown',
  'unavailable',
  'quarantined',
])

export async function called<T>(call: () => Promise<Called<T>>): Promise<Called<T>> {
  try {
    return await call()
  } catch {
    return 'unknown'
  }
}

export const workOf = (
  calls: SessionCalls,
  tenant: LegalTenant,
  session: SessionRef,
): Promise<PortRead<WorkSnapshot | null> | Unavailable> =>
  calls.work({ tenant, session: sessionId(session) }).catch(() => UNAVAILABLE)

export const modesOf = (
  calls: SessionCalls,
  tenant: LegalTenant,
  session: SessionRef,
): Promise<PortRead<Modes> | Unavailable> =>
  calls.modes({ tenant, session: sessionId(session) }).catch(() => UNAVAILABLE)
