// What the coordinators and schedulers of this member share: the per-session principal of each
// face operation (SPEC cp-access), clock waits that never fall back to system time (SPEC 时钟被拒),
// and the per-session serial lanes of SR-2.
import { fail, type Outcome } from '@omne-harness/operation-result'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  SessionClock,
  SessionFailure,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import type { SessionDependencies } from './dependencies.ts'
import { guarded, messageOf, OWNERS, unavailable } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'

export type TenantId = WorkSnapshot['tenant']
export type SessionRef = Readonly<{ tenant: TenantId; session: SessionId }>
export type Actor = 'coordinator' | 'maintainer'
export type WaitResult = 'elapsed' | 'cancelled' | 'refused'

function waitOnClock(
  clock: SessionClock,
  milliseconds: number,
  signal: AbortSignal,
): Promise<WaitResult> {
  if (signal.aborted) return Promise.resolve('cancelled')
  return new Promise(resolve => {
    const finish = (result: WaitResult): void => {
      signal.removeEventListener('abort', cancel)
      resolve(signal.aborted ? 'cancelled' : result)
    }
    const cancel = (): void => finish('cancelled')
    signal.addEventListener('abort', cancel, { once: true })
    const run = async (): Promise<WaitResult> => {
      const sample = await guarded(OWNERS.clock, 'clock.sample', () => clock.sample())
      if (signal.aborted) return 'cancelled'
      if ('failure' in sample) return 'refused'
      const instant = new Date(Date.parse(sample.ok.at) + milliseconds).toISOString()
      return clock.waitUntil(instant, signal)
    }
    void run().then(finish, () => finish('refused'))
  })
}

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
  wait(milliseconds: number, stop?: AbortSignal): Promise<WaitResult>
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
    wait: (milliseconds, stop) =>
      waitOnClock(
        dependencies.clock,
        milliseconds,
        stop === undefined ? lifecycle.signal : AbortSignal.any([lifecycle.signal, stop]),
      ),
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
