import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  EnvironmentFacilities,
  EnvironmentLease,
  FacilityGuard,
  FacilityKey,
  FacilityReason,
  FacilityRequest,
  FacilityResult,
  LeaseInvalidation,
  LeaseRelease,
  Placement,
} from '@omne-harness/execution-environment-contract'
import { sameBinding } from './compare.ts'

/** The registry's stored form of a facility descriptor. */
export type StoredDescriptor = Readonly<{
  key: FacilityKey
  operations: readonly string[]
  guarded: readonly string[]
}>

export type LeaseViewHooks = Readonly<{
  tenant: TenantId
  placement: Placement
  /** Read on every operation, so a removed declaration refuses operations on objects already handed out. */
  descriptor: (key: FacilityKey) => StoredDescriptor | undefined
  invalidated: (invalidation: LeaseInvalidation) => void
  releasing: () => void
  released: (result: LeaseRelease) => void
}>

export type LeaseView = Readonly<{
  lease: EnvironmentLease
  invalidate: (invalidation: LeaseInvalidation) => void
}>

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function requestIdOf(value: unknown): string {
  return isRecord(value) && typeof value['requestId'] === 'string' ? value['requestId'] : ''
}

// The principal is opaque to the environment: it is passed on to the guard and never interpreted,
// so the check covers the parts the environment itself reads.
function isFacilityRequest<P>(value: unknown): value is FacilityRequest<P> {
  if (!isRecord(value)) return false
  const access = value['access']
  const binding = value['binding']
  return (
    typeof value['requestId'] === 'string' &&
    value['requestId'] !== '' &&
    typeof value['origin'] === 'string' &&
    value['origin'] !== '' &&
    isRecord(access) &&
    isRecord(access['tenant']) &&
    isRecord(binding) &&
    typeof binding['kind'] === 'string'
  )
}

function refused(requestId: string, reason: FacilityReason): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason }
}

/**
 * Wraps a provider lease. Only keys of the requirement resolve. Every operation of the facility
 * descriptor first checks that the lease still admits operations, that the declaration is still
 * registered, that the request belongs to the acquiring tenant and names the lease's binding; a
 * guarded operation then asks the `FacilityGuard` before the provider facility runs.
 */
export function createLeaseView<P>(
  raw: EnvironmentLease,
  guard: FacilityGuard<P>,
  hooks: LeaseViewHooks,
): LeaseView {
  // `admitting` closes the entry for new operations; `valid` records the one invalidation.
  let admitting = true
  let valid = true
  let settleInvalidated: (value: LeaseInvalidation) => void = () => undefined
  const invalidated = new Promise<LeaseInvalidation>(resolve => {
    settleInvalidated = resolve
  })
  const invalidate = (invalidation: LeaseInvalidation) => {
    admitting = false
    if (!valid) return
    valid = false
    hooks.invalidated(invalidation)
    settleInvalidated(invalidation)
  }
  // A provider cannot speak for the registry: whatever it reports is recorded as its own reason.
  raw.invalidated.then(
    value => invalidate({ source: 'provider', reason: value.reason }),
    () => invalidate({ source: 'registry', reason: 'providerInvalidated' }),
  )

  const allowed = new Set<FacilityKey>(hooks.placement.requirement.facilities)

  const gate = async (
    key: FacilityKey,
    operation: string,
    request: unknown,
  ): Promise<FacilityResult<never> | 'pass'> => {
    if (!isFacilityRequest<P>(request)) return refused(requestIdOf(request), 'invalidInput')
    if (!admitting) return refused(request.requestId, 'closed')
    const descriptor = hooks.descriptor(key)
    if (descriptor === undefined || !descriptor.operations.includes(operation))
      return refused(request.requestId, 'unsupported')
    if (!tenantEquals(request.access.tenant, hooks.tenant))
      return refused(request.requestId, 'notAuthorized')
    if (!sameBinding(hooks.placement.binding, request.binding))
      return refused(request.requestId, 'invalidInput')
    if (!descriptor.guarded.includes(operation)) return 'pass'
    let decision: 'authorized' | 'notAuthorized' | 'unavailable'
    try {
      decision = await guard.authorize(key, operation, request)
    } catch {
      decision = 'unavailable'
    }
    if (decision !== 'authorized') return refused(request.requestId, decision)
    if (!admitting) return refused(request.requestId, 'closed')
    return 'pass'
  }

  function guardedFacility<F extends FacilityKey>(
    key: F,
    original: EnvironmentFacilities[F] & object,
    operations: readonly string[],
  ): EnvironmentFacilities[F] & object {
    return new Proxy(original, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver)
        if (
          typeof property !== 'string' ||
          typeof value !== 'function' ||
          !operations.includes(property)
        )
          return value
        return async (request: unknown) => {
          const decision = await gate(key, property, request)
          if (decision !== 'pass') return decision
          const result: unknown = await Reflect.apply(value, target, [request])
          return result
        }
      },
    })
  }

  let releasing: Promise<LeaseRelease> | undefined
  let releasedOnce = false

  const lease: EnvironmentLease = {
    placement: hooks.placement,
    instance: raw.instance,
    continuity: raw.continuity,
    invalidated,
    facility<F extends FacilityKey>(key: F): EnvironmentFacilities[F] | undefined {
      if (!allowed.has(key)) return undefined
      const descriptor = hooks.descriptor(key)
      if (descriptor === undefined) return undefined
      const original = raw.facility(key)
      if (typeof original !== 'object' || original === null) return undefined
      return guardedFacility(key, original, descriptor.operations)
    },
    release() {
      if (releasedOnce) return Promise.resolve({ kind: 'released' })
      // Releasing closes the entry first: whether the release ends released, pending or is still
      // running, no new operation starts on this lease.
      admitting = false
      releasing ??= (async (): Promise<LeaseRelease> => {
        hooks.releasing()
        let result: LeaseRelease
        try {
          result = await raw.release()
        } catch {
          result = { kind: 'pending', resources: [] }
        }
        if (result.kind === 'released') {
          releasedOnce = true
          invalidate({ source: 'registry', reason: 'released' })
        }
        hooks.released(result)
        releasing = undefined
        return result
      })()
      return releasing
    },
  }
  return Object.freeze({ lease: Object.freeze(lease), invalidate })
}
