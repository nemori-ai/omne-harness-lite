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
  ended: Promise<void>
}>

export type Scan = Readonly<{
  maintain(tenant: TenantId): Reply<MaintenanceHandle>
  stopAll(): void
}>

const PERIODIC_REASONS: readonly PendingReason[] = ['inputs', 'unresolved', 'controls', 'run']

type Outcome = 'found' | 'empty' | 'incomplete'

type Scanner = {
  readonly handle: MaintenanceHandle
  readonly stop: AbortController
  readonly settle: () => void
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

  const end = (key: string, scanner: Scanner): void => {
    scanner.stop.abort()
    if (scanners.get(key) === scanner) scanners.delete(key)
    scanner.settle()
  }

  // Each return ends the scanner in the same synchronous step as the decision, so a maintain either arrived before the decision or finds no scanner.
  const run = async (key: string, tenant: TenantId, scanner: Scanner): Promise<void> => {
    const { signal } = scanner.stop
    const { periodMs, startupRetryDelaysMs: delays } = policy.recoveryScan
    const idle = (outcome: Outcome): boolean => outcome === 'empty' && !scanner.demand
    try {
      for (let attempt = 0; ; attempt += 1) {
        scanner.demand = false
        const outcome = await read(tenant, new Set(), signal)
        if (signal.aborted || idle(outcome)) return
        if (outcome !== 'incomplete') break
        const delay = delays[attempt] ?? delays.reduce((_, last) => last)
        if ((await scheduling.wait(delay, signal)) !== 'elapsed') return
      }
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
