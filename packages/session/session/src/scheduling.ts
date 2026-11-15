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

export function sessionKey(ref: SessionRef): string {
  return `${tenantKey(ref.tenant)}\u0000${ref.session}`
}

export function tenantKey(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  return text.ok ? text.value : 'unminted'
}

export type Scheduling<P> = Readonly<{
  principal(actor: Actor, ref: SessionRef): Promise<Outcome<P, SessionFailure>>
  wait(milliseconds: number, stop?: AbortSignal): Promise<WaitResult>
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
