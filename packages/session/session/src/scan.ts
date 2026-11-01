// S3, the recovery scanner of one tenant (SPEC S3), in the subset this member hands work to: a
// session with pending inputs goes to S1, each unknown operation goes to S4. The startup scan reads
// the union of reasons; the periodic scan reads `inputs` and `unresolved`. The other reasons have
// no handler in this member yet (SPEC「实现现状」). The cursor is not persistent.
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  PendingReason,
  Reply,
  SessionFaces,
  SessionId,
  SessionInternalPrincipals,
} from '@omne-harness/session-contract'
import type { Advance } from './advance.ts'
import { OWNERS, unavailable } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import type { Resolution } from './resolution.ts'
import {
  sessionKey,
  tenantKey,
  type Scheduling,
  type SessionRef,
  type TenantId,
} from './scheduling.ts'

export type MaintenanceHandle = Readonly<{ release(): Promise<void> }>

export type Scan = Readonly<{
  maintain(tenant: TenantId): Reply<MaintenanceHandle>
  stopAll(): void
}>

const PERIODIC_REASONS: readonly PendingReason[] = ['inputs', 'unresolved']

export function createScan<P>(
  input: Readonly<{
    lifecycle: Lifecycle
    policy: SchedulingPolicy
    scheduling: Scheduling<P>
    principals: SessionInternalPrincipals<P>
    maintainer: SessionFaces<P>
    advance: Advance
    resolution: Resolution
  }>,
): Scan {
  const { lifecycle, policy, scheduling, principals, maintainer, advance, resolution } = input
  const scanners = new Map<string, Readonly<{ handle: MaintenanceHandle; stop: AbortController }>>()

  const page = (tenant: TenantId, after: string | null, reason?: PendingReason) =>
    maintainer.reconciliation.pending({
      principal: principals.maintainer,
      tenant,
      after,
      limit: policy.recoveryScan.pageSize,
      ...(reason === undefined ? {} : { reason }),
    })

  /** Hands one session to its handlers, by the reasons its snapshot decides. */
  const dispatch = async (ref: SessionRef): Promise<void> => {
    const principal = await scheduling.principal('maintainer', ref)
    if ('failure' in principal) return
    const snapshot = await maintainer.work.readWork({ principal: principal.ok, ...ref })
    if ('failure' in snapshot) return
    if (snapshot.ok.pending.length > 0) advance.trigger(ref)
    for (const operation of snapshot.ok.unresolved)
      resolution.watch(ref, operation, () => {
        advance.trigger(ref)
        return Promise.resolve()
      })
  }

  /** One round over all pages of one reading; each session is handed over once per round. */
  const round = async (
    tenant: TenantId,
    seen: Set<string>,
    first: readonly SessionId[],
    next: string | null,
    reason?: PendingReason,
  ): Promise<void> => {
    let sessions = first
    let cursor = next
    for (;;) {
      for (const session of sessions) {
        const ref = { tenant, session }
        const key = sessionKey(ref)
        if (seen.has(key)) continue
        seen.add(key)
        await dispatch(ref)
      }
      if (cursor === null || lifecycle.closed) return
      const more = await page(tenant, cursor, reason)
      if ('failure' in more) return
      sessions = more.ok.sessions
      cursor = more.ok.next
    }
  }

  return {
    maintain: async tenant => {
      if (lifecycle.closed)
        return fail(unavailable(OWNERS.session, 'the session instance is closed'))
      const key = tenantKey(tenant)
      const existing = scanners.get(key)
      if (existing !== undefined) return succeed(existing.handle)
      // The startup scan reads the union of reasons; its first page decides whether a scanner starts.
      const startup = await page(tenant, null)
      if ('failure' in startup) return fail(startup.failure)
      const raced = scanners.get(key)
      if (raced !== undefined) return succeed(raced.handle)
      const stop = new AbortController()
      const handle: MaintenanceHandle = Object.freeze({
        release: () => {
          stop.abort()
          if (scanners.get(key)?.stop === stop) scanners.delete(key)
          return Promise.resolve()
        },
      })
      scanners.set(key, { handle, stop })
      lifecycle.spawn(async () => {
        await round(tenant, new Set(), startup.ok.sessions, startup.ok.next)
        while (!stop.signal.aborted) {
          if (!(await scheduling.wait(policy.recoveryScan.periodMs, stop.signal))) return
          const seen = new Set<string>()
          for (const reason of PERIODIC_REASONS) {
            const first = await page(tenant, null, reason)
            if ('failure' in first) continue
            await round(tenant, seen, first.ok.sessions, first.ok.next, reason)
          }
        }
      })
      return succeed(handle)
    },
    stopAll: () => {
      for (const { stop } of scanners.values()) stop.abort()
      scanners.clear()
    },
  }
}
