import type { RuntimeCloseResult } from '@omne-harness-lite/model-request-runtime'
import { tenantIdEquals, type TenantId } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'
import type { SettlementLogBinding } from './settlement-types.ts'
import type { RuntimeConstruction } from './service-types.ts'
import type { PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'

export interface PlanReuseScopeLease {
  readonly reuseScope?: object
  readonly release: () => void
}
export type PlanScopeBinding = Pick<SettlementLogBinding, 'tenant' | 'session' | 'generation'>
export interface PlanReuseScopes {
  /** The caller has already validated this binding through RuntimeSessionAccess.bind. */
  readonly acquire: (
    binding: PlanScopeBinding,
  ) => { readonly lease: PlanReuseScopeLease } | { readonly unavailable: true }
  readonly close: () => RuntimeCloseResult
}
interface Entry {
  readonly tenant: TenantId
  readonly session: SessionRef
  readonly generation: object
  readonly scope: object
  active: number
  failed: boolean
  pending: Promise<void> | undefined
}

/** One bounded process owner; provider caches remain behind the acquired cleanup capability. */
export function createPlanReuseScopes<P extends PlannedSemantics, R>(
  input: Pick<RuntimeConstruction<P, R>, 'maxScopes' | 'transport' | 'policy'>,
): PlanReuseScopes {
  if (!Number.isSafeInteger(input.maxScopes) || input.maxScopes <= 0)
    throw new TypeError('maxScopes must be a positive safe integer')
  if (typeof input.transport?.clearReuseScope !== 'function')
    throw new TypeError('clearReuseScope capability required')
  const clear = input.transport.clearReuseScope.bind(input.transport)
  const maxScopes = input.maxScopes
  // Each opaque scope owns its distinct provider cache; this map only bounds ownership and LRU.
  const entries = new Map<object, Entry>()
  let closed = false
  let diagnosticsEnabled = true
  function report(): void {
    if (!diagnosticsEnabled) return
    try {
      const returned: unknown = input.policy.diagnostic({
        kind: 'model_runtime.scope_cleanup_failed',
        detail: { retainedScopes: entries.size },
      })
      if (drainDiagnosticThenable(returned)) diagnosticsEnabled = false
    } catch {
      diagnosticsEnabled = false
    }
  }
  function cleanup(entry: Entry): boolean {
    if (entry.active !== 0 || entry.pending !== undefined) return false
    let returned: unknown
    try {
      returned = clear(entry.scope)
    } catch {
      entry.failed = true
      report()
      return false
    }
    if (returned === undefined) {
      entries.delete(entry.scope)
      return true
    }
    entry.failed = true
    report()
    try {
      if ((typeof returned === 'object' && returned !== null) || typeof returned === 'function') {
        const then: unknown = Reflect.get(returned, 'then')
        if (typeof then === 'function') {
          // A protocol violation stays owned, even after its rejection/completion is observed.
          entry.pending = new Promise<void>(resolve => {
            const done = () => resolve()
            try {
              Reflect.apply(then, returned, [done, done])
            } catch {
              resolve()
            }
          }).then(() => {
            entry.pending = undefined
          })
        }
      }
    } catch {
      /* A throwing then getter is also a failed synchronous cleanup. */
    }
    return false
  }
  function borrow(entry: Entry): PlanReuseScopeLease {
    entry.active++
    entries.delete(entry.scope)
    entries.set(entry.scope, entry)
    let released = false
    return Object.freeze({
      reuseScope: entry.scope,
      release() {
        if (released) return
        released = true
        entry.active--
        entries.delete(entry.scope)
        entries.set(entry.scope, entry)
      },
    })
  }
  return Object.freeze<PlanReuseScopes>({
    acquire(binding) {
      if (closed) return { unavailable: true }
      for (const entry of entries.values()) {
        if (
          !entry.failed &&
          entry.session === binding.session &&
          entry.generation === binding.generation &&
          tenantIdEquals(entry.tenant, binding.tenant)
        )
          return { lease: borrow(entry) }
      }
      if (entries.size >= maxScopes) {
        const idle = [...entries.values()].find(entry => entry.active === 0 && !entry.failed)
        if (idle === undefined) return { lease: Object.freeze({ release() {} }) }
        if (!cleanup(idle)) return { unavailable: true }
      }
      const scope = Object.freeze({})
      const entry: Entry = {
        tenant: Object.freeze({ ...binding.tenant }),
        session: binding.session,
        generation: binding.generation,
        scope,
        active: 0,
        failed: false,
        pending: undefined,
      }
      entries.set(scope, entry)
      return { lease: borrow(entry) }
    },
    close() {
      closed = true
      for (const entry of [...entries.values()]) cleanup(entry)
      return entries.size === 0 ? { released: true } : { unavailable: true }
    },
  })
}
