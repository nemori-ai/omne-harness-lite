// What the coordinators and schedulers of this member share: the per-session principal of each
// face operation (SPEC cp-access), clock waits that never fall back to system time (SPEC 时钟被拒),
// and the per-session serial lanes of SR-2.
import { fail, type Outcome } from '@omne-harness/operation-result'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionFailure, SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import type { SessionDependencies } from './dependencies.ts'
import { guarded, messageOf, OWNERS, unavailable } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'

export type TenantId = WorkSnapshot['tenant']
export type SessionRef = Readonly<{ tenant: TenantId; session: SessionId }>
export type Actor = 'coordinator' | 'maintainer'

/** A key unique per tenant and session: a SessionId is unique only within its tenant. */
export function sessionKey(ref: SessionRef): string {
  return `${tenantKey(ref.tenant)}\u0000${ref.session}`
}

/** The canonical text of a tenant; a value that legal-identity did not mint has none. */
export function tenantKey(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  return text.ok ? text.value : 'unminted'
}

export type Scheduling<P> = Readonly<{
  /** The principal of one face operation on an established session. A throw is `unavailable`. */
  principal(actor: Actor, ref: SessionRef): Promise<Outcome<P, SessionFailure>>
  /**
   * Waits `milliseconds` on the clock. False when the clock refuses, the instance closes or
   * `stop` aborts; the wait never falls back to system time.
   */
  wait(milliseconds: number, stop?: AbortSignal): Promise<boolean>
  /** Runs `work` for `key` after the work already queued for it: one actor per session at a time. */
  serial(key: string, work: () => Promise<void>): Promise<void>
}>

export function createScheduling<P>(
  dependencies: SessionDependencies<P>,
  lifecycle: Lifecycle,
): Scheduling<P> {
  const lanes = new Map<string, Promise<void>>()
  return {
    principal: async (actor, ref) => {
      try {
        return await dependencies.workPrincipals.forSession({
          actor,
          tenant: ref.tenant,
          session: ref.session,
        })
      } catch (error) {
        return fail(unavailable(OWNERS.workPrincipals, `forSession threw: ${messageOf(error)}`))
      }
    },
    wait: async (milliseconds, stop) => {
      if (lifecycle.closed || stop?.aborted === true) return false
      const sample = await guarded(OWNERS.clock, 'clock.sample', () => dependencies.clock.sample())
      if ('failure' in sample) return false
      const instant = new Date(Date.parse(sample.ok.at) + milliseconds).toISOString()
      const signal =
        stop === undefined ? lifecycle.signal : AbortSignal.any([lifecycle.signal, stop])
      try {
        return (await dependencies.clock.waitUntil(instant, signal)) === 'elapsed'
      } catch {
        return false
      }
    },
    serial: (key, work) => {
      const previous = lanes.get(key) ?? Promise.resolve()
      const next = previous.then(work, work)
      const settled = next.then(
        () => undefined,
        () => undefined,
      )
      lanes.set(key, settled)
      void settled.then(() => {
        if (lanes.get(key) === settled) lanes.delete(key)
      })
      return next
    },
  }
}
