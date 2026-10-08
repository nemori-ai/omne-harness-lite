import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  Access,
  CoordinationAuthority,
  OperationRef,
} from '@omne-harness-lite/session-runtime'
import type { LogAuthority, LogAuthorityOperations } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { AdmissionGuard } from './admission-types.ts'
import type { RuntimeOptions } from './runtime-types.ts'
import { originalGrant } from './coordination-store.ts'

/** Tokens are issued here; only active original G28 callbacks grant participant access. */
export function runtimeAuthority(options: RuntimeOptions) {
  const access = Object.freeze({}) as Access,
    coordination = Object.freeze({}) as CoordinationAuthority,
    logAccess = Object.freeze({}) as LogAuthority,
    guards = new WeakMap<StorageUnit, AdmissionGuard>(),
    runs = new WeakMap<StorageUnit, SessionScope>(),
    originalReads = new WeakMap<StorageUnit, SessionScope>()
  function allowed(unit: StorageUnit, scope: SessionScope) {
    const guard = guards.get(unit)
    const run = runs.get(unit)
    return (
      tenantIdEquals(scope.tenant, options.tenant) &&
      ((guard !== undefined &&
        options.admission.authorizeIn(unit, guard, options.source, scope.tenant)) ||
        (run !== undefined &&
          run.session === scope.session &&
          tenantIdEquals(run.tenant, scope.tenant)))
    )
  }
  const log: LogAuthorityOperations = {
    storage: options.storage,
    authorize: async (unit, candidate, scope, operation) => {
      const read = originalReads.get(unit)
      const heldRead =
        operation === 'read' &&
        read?.session === scope.session &&
        tenantIdEquals(read.tenant, scope.tenant)
      return {
        kind:
          candidate === logAccess && (allowed(unit, scope) || heldRead) ? 'authorized' : 'denied',
      }
    },
    authorizeEnumeration: async () => ({ kind: 'denied' }),
  }
  return Object.freeze({
    access,
    coordination,
    logAccess,
    log,
    state: {
      authorize: async (
        unit: StorageUnit,
        candidate: CoordinationAuthority,
        scope: SessionScope,
      ) =>
        candidate === coordination && allowed(unit, scope)
          ? { kind: 'authorized' as const }
          : { failure: 'denied' as const },
    },
    receipts: {
      authorize: async (
        unit: StorageUnit,
        candidate: CoordinationAuthority,
        operation: OperationRef,
      ) =>
        candidate === coordination &&
        operation.principal === options.principal &&
        tenantIdEquals(operation.tenant, options.tenant) &&
        guards.has(unit) &&
        options.admission.authorizeIn(unit, guards.get(unit)!, options.source, operation.tenant)
          ? { kind: 'authorized' as const }
          : { failure: 'denied' as const },
    },
    /** Only the bound original-owner reader uses this after checking its persisted issued source. */
    async withinOriginalRead<T>(
      unit: StorageUnit,
      scope: SessionScope,
      read: () => Promise<T>,
    ): Promise<T> {
      unit.assertStorage(options.storage)
      if (!tenantIdEquals(scope.tenant, options.tenant) || originalReads.has(unit))
        throw new Error('invalid original log read scope')
      originalReads.set(unit, scope)
      try {
        return await unit.run(read)
      } finally {
        originalReads.delete(unit)
      }
    },
    async withinRun<T>(
      unit: StorageUnit,
      scope: SessionScope,
      run: string,
      action: () => Promise<T>,
    ): Promise<T> {
      unit.assertStorage(options.storage)
      if (!tenantIdEquals(scope.tenant, options.tenant))
        throw new Error('foreign original Run scope')
      if (guards.has(unit) || runs.has(unit))
        throw new Error('Session authority callback already active')
      await originalGrant(unit, scope, run, options)
      runs.set(unit, scope)
      try {
        return await unit.run(action)
      } finally {
        runs.delete(unit)
      }
    },
    async within<T>(
      unit: StorageUnit,
      guard: AdmissionGuard,
      action: () => Promise<T>,
    ): Promise<T> {
      unit.assertStorage(options.storage)
      if (guards.has(unit)) throw new Error('Session authority callback already active')
      guards.set(unit, guard)
      try {
        return await unit.run(action)
      } finally {
        guards.delete(unit)
      }
    },
  })
}
