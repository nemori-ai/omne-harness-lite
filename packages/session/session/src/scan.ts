// S3, the recovery scanner of one tenant (SPEC S3), in the subset this member hands work to: a
// session with pending inputs goes to S1, each unknown operation goes to S4, a control that
// propagates goes to C3, and an active Run goes to the recovery of C2. The startup scan reads the
// union of reasons; the periodic scan reads `inputs`, `unresolved`, `controls` and `run`. The other
// reasons have no handler in this member yet (SPEC「实现现状」). The cursor is not persistent.
//
// A scanner stays only while its tenant has work (SPEC「扫描者的生灭」): a round that read every page,
// listed no session and saw no `maintain` since it began stops it. `maintain` is the demand signal
// of each commit notice; it starts a scanner again after one stopped.
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  PendingReason,
  Reply,
  SessionFaces,
  SessionInternalPrincipals,
} from '@omne-harness/session-contract'
import type { Advance } from './advance.ts'
import type { ControlPropagation } from './control.ts'
import { OWNERS, unavailable } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import type { Recovery } from './recover.ts'
import type { Resolution } from './resolution.ts'
import {
  sessionKey,
  tenantKey,
  type Scheduling,
  type SessionRef,
  type TenantId,
} from './scheduling.ts'

export type MaintenanceHandle = Readonly<{
  release(): Promise<void>
  /** Settles once the scanner stopped: released, closed, or stopped because its tenant had no work. */
  ended: Promise<void>
}>

export type Scan = Readonly<{
  maintain(tenant: TenantId): Reply<MaintenanceHandle>
  stopAll(): void
}>

const PERIODIC_REASONS: readonly PendingReason[] = ['inputs', 'unresolved', 'controls', 'run']

/** The outcome of one round (SPEC「扫描者的生灭」): it read every page, and listed a session or none. */
type Outcome = 'found' | 'empty' | 'incomplete'

type Scanner = {
  readonly handle: MaintenanceHandle
  readonly stop: AbortController
  readonly settle: () => void
  /** A `maintain` arrived since the current round began (SPEC「有需求」). */
  demand: boolean
}

export function createScan<P>(
  input: Readonly<{
    lifecycle: Lifecycle
    policy: SchedulingPolicy
    scheduling: Scheduling<P>
    principals: SessionInternalPrincipals<P>
    maintainer: SessionFaces<P>
    advance: Advance
    resolution: Resolution
    controls: ControlPropagation
    recovery: Recovery
  }>,
): Scan {
  const { lifecycle, policy, scheduling, principals, maintainer } = input
  const { advance, resolution, controls, recovery } = input
  const scanners = new Map<string, Scanner>()

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
    if (snapshot.ok.controls.some(control => control.state === 'propagating')) controls.trigger(ref)
    if (snapshot.ok.pending.length > 0) advance.trigger(ref)
    if (snapshot.ok.run.kind === 'active') recovery.trigger(ref)
    for (const operation of snapshot.ok.unresolved)
      resolution.watch(ref, operation, () => {
        advance.trigger(ref)
        return Promise.resolve()
      })
  }

  /**
   * All pages of one reading; each session is handed over once per round. A page that answered is
   * handed over even after a stop; a stop only keeps the next page from being read.
   */
  const read = async (
    tenant: TenantId,
    seen: Set<string>,
    stop: AbortSignal,
    reason?: PendingReason,
  ): Promise<Outcome> => {
    let found = false
    let cursor: string | null = null
    do {
      const answer = await page(tenant, cursor, reason)
      if ('failure' in answer) return 'incomplete'
      found ||= answer.ok.sessions.length > 0
      for (const session of answer.ok.sessions) {
        const ref = { tenant, session }
        const key = sessionKey(ref)
        if (seen.has(key)) continue
        seen.add(key)
        await dispatch(ref)
      }
      cursor = answer.ok.next
    } while (cursor !== null && !stop.aborted && !lifecycle.closed)
    return cursor === null ? (found ? 'found' : 'empty') : 'incomplete'
  }

  /** One periodic round: every reason is read even after one fails; the round then did not finish. */
  const periodic = async (tenant: TenantId, stop: AbortSignal): Promise<Outcome> => {
    const seen = new Set<string>()
    const outcomes: Outcome[] = []
    for (const reason of PERIODIC_REASONS) {
      if (stop.aborted) return 'incomplete'
      outcomes.push(await read(tenant, seen, stop, reason))
    }
    if (outcomes.includes('incomplete')) return 'incomplete'
    return outcomes.includes('found') ? 'found' : 'empty'
  }

  /** Stops `scanner`: out of the table, its handle ended. A second call changes nothing. */
  const end = (key: string, scanner: Scanner): void => {
    scanner.stop.abort()
    if (scanners.get(key) === scanner) scanners.delete(key)
    scanner.settle()
  }

  /**
   * The life of one scanner (SPEC「扫描者的生灭」). Each return ends it in the same synchronous step
   * as the decision, so a `maintain` either arrived before the decision or finds no scanner.
   */
  const run = async (key: string, tenant: TenantId, scanner: Scanner): Promise<void> => {
    const { signal } = scanner.stop
    const { periodMs, startupRetryDelaysMs: delays } = policy.recoveryScan
    /** Whether the scanner stops after a round: its tenant had no work and sent no notice. */
    const idle = (outcome: Outcome): boolean => outcome === 'empty' && !scanner.demand
    try {
      // Starting, and backing off while the startup scan did not finish.
      for (let attempt = 0; ; attempt += 1) {
        scanner.demand = false
        const outcome = await read(tenant, new Set(), signal)
        if (signal.aborted || idle(outcome)) return
        if (outcome !== 'incomplete') break
        const delay = delays[attempt] ?? delays.reduce((_, last) => last)
        if ((await scheduling.wait(delay, signal)) !== 'elapsed') return
      }
      // Running: a wait for the period, then a periodic round.
      for (;;) {
        if ((await scheduling.wait(periodMs, signal)) !== 'elapsed') return
        scanner.demand = false
        const outcome = await periodic(tenant, signal)
        if (signal.aborted || idle(outcome)) return
      }
    } finally {
      end(key, scanner)
    }
  }

  const start = (tenant: TenantId, key: string): Scanner => {
    let settle!: () => void
    const ended = new Promise<void>(resolve => {
      settle = resolve
    })
    const scanner: Scanner = {
      handle: Object.freeze({
        release: () => {
          end(key, scanner)
          return Promise.resolve()
        },
        ended,
      }),
      stop: new AbortController(),
      settle,
      demand: false,
    }
    scanners.set(key, scanner)
    lifecycle.spawn(() => run(key, tenant, scanner))
    return scanner
  }

  return {
    maintain: tenant => {
      if (lifecycle.closed)
        return Promise.resolve(fail(unavailable(OWNERS.session, 'the session instance is closed')))
      const key = tenantKey(tenant)
      const existing = scanners.get(key)
      if (existing !== undefined) existing.demand = true
      return Promise.resolve(succeed((existing ?? start(tenant, key)).handle))
    },
    stopAll: () => {
      for (const [key, scanner] of scanners) end(key, scanner)
    },
  }
}
