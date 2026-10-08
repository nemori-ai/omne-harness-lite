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

/** Tokens are issued here; only active original G28 callbacks grant participant access. */
export function runtimeAuthority(options: RuntimeOptions) {
  const access = Object.freeze({}) as Access,
    coordination = Object.freeze({}) as CoordinationAuthority,
    logAccess = Object.freeze({}) as LogAuthority,
    guards = new WeakMap<StorageUnit, AdmissionGuard>()
  function allowed(unit: StorageUnit, tenant: SessionScope['tenant']) {
    const guard = guards.get(unit)
    return (
      guard !== undefined &&
      tenantIdEquals(tenant, options.tenant) &&
      options.admission.authorizeIn(unit, guard, options.source, tenant)
    )
  }
  const log: LogAuthorityOperations = {
    storage: options.storage,
    authorize: async (unit, candidate, scope) => ({
      kind: candidate === logAccess && allowed(unit, scope.tenant) ? 'authorized' : 'denied',
    }),
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
        candidate === coordination && allowed(unit, scope.tenant)
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
        allowed(unit, operation.tenant)
          ? { kind: 'authorized' as const }
          : { failure: 'denied' as const },
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
