import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  CommandRetentionOperation,
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
  OriginRef,
  TerminalRetentionOperation,
} from '@omne-harness/execution-environment-contract'
import { sameBinding } from './compare.ts'

export type StoredDescriptor = Readonly<{
  key: FacilityKey
  operations: readonly string[]
  guarded: readonly string[]
}>

export type LeaseViewHooks = Readonly<{
  tenant: TenantId
  origin: OriginRef
  placement: Placement
  ledgerClosed: AbortSignal
  retentionEnabled: boolean
  processRetentionEnabled: boolean
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

function requiresRetention(key: FacilityKey, operation: string, request: unknown): boolean {
  if (key !== 'terminal') return false
  if (operation === 'attach' || operation === 'detach') return true
  return operation === 'create' && isRecord(request) && request['retain'] === 'session'
}

type Presence = 'required' | 'optional'
const byPresence = (operations: Readonly<Record<string, Presence>>, presence: Presence) =>
  Object.keys(operations).filter(operation => operations[operation] === presence)

const retentionPresence = {
  terminal: { attach: 'required', detach: 'required' } satisfies Record<
    TerminalRetentionOperation,
    Presence
  >,
  command: { list: 'required', stop: 'optional', output: 'optional' } satisfies Record<
    CommandRetentionOperation,
    Presence
  >,
} satisfies Partial<Record<FacilityKey, Readonly<Record<string, Presence>>>>
type RetainingKey = keyof typeof retentionPresence
const retentionOperations: Readonly<
  Record<RetainingKey, Readonly<{ required: readonly string[]; optional: readonly string[] }>>
> = {
  terminal: {
    required: byPresence(retentionPresence.terminal, 'required'),
    optional: byPresence(retentionPresence.terminal, 'optional'),
  },
  command: {
    required: byPresence(retentionPresence.command, 'required'),
    optional: byPresence(retentionPresence.command, 'optional'),
  },
}

function isRetainingKey(key: FacilityKey): key is RetainingKey {
  return Object.hasOwn(retentionOperations, key)
}

function supportsRetention(key: RetainingKey, facility: object, enabled: boolean): boolean {
  const retention: unknown = Reflect.get(facility, 'retention')
  return (
    enabled &&
    isRecord(retention) &&
    retentionOperations[key].required.every(operation => typeof retention[operation] === 'function')
  )
}

function handedOperations(
  key: RetainingKey,
  extension: Readonly<Record<string, unknown>>,
): readonly string[] {
  const { required, optional } = retentionOperations[key]
  return [...required, ...optional.filter(operation => typeof extension[operation] === 'function')]
}

export function createLeaseView<P>(
  raw: EnvironmentLease,
  guard: FacilityGuard<P>,
  hooks: LeaseViewHooks,
): LeaseView {
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
  raw.invalidated.then(
    value => invalidate({ source: 'provider', reason: value.reason }),
    () => invalidate({ source: 'registry', reason: 'providerInvalidated' }),
  )

  const allowed = new Set<FacilityKey>(hooks.placement.requirement.facilities)
  const accepting = () => admitting && !hooks.ledgerClosed.aborted

  const gate = async (
    key: FacilityKey,
    operation: string,
    request: unknown,
    retention = false,
  ): Promise<FacilityResult<never> | 'pass'> => {
    if (!isFacilityRequest<P>(request)) return refused(requestIdOf(request), 'invalidInput')
    if (!accepting()) return refused(request.requestId, 'closed')
    const descriptor = hooks.descriptor(key)
    if (descriptor === undefined || (!retention && !descriptor.operations.includes(operation)))
      return refused(request.requestId, 'unsupported')
    if (!tenantEquals(request.access.tenant, hooks.tenant))
      return refused(request.requestId, 'notAuthorized')
    if (request.origin !== hooks.origin) return refused(request.requestId, 'invalidInput')
    if (!sameBinding(hooks.placement.binding, request.binding))
      return refused(request.requestId, 'invalidInput')
    if (!retention && !descriptor.guarded.includes(operation)) return 'pass'
    let decision: 'authorized' | 'notAuthorized' | 'unavailable'
    try {
      decision = await guard.authorize(key, operation, request)
    } catch {
      decision = 'unavailable'
    }
    if (decision !== 'authorized') return refused(request.requestId, decision)
    if (!accepting()) return refused(request.requestId, 'closed')
    return 'pass'
  }

  const retentionEnabledBy: Readonly<Record<RetainingKey, () => boolean>> = {
    terminal: () => hooks.retentionEnabled,
    command: () => hooks.processRetentionEnabled,
  }
  const retentionEnabled = (key: RetainingKey) => retentionEnabledBy[key]()

  function retentionMethod(
    key: RetainingKey,
    target: object,
    extension: Readonly<Record<string, unknown>>,
    operation: string,
  ) {
    return async (request: unknown): Promise<unknown> => {
      const decision = await gate(key, operation, request, true)
      if (decision !== 'pass') return decision
      const method = extension[operation]
      if (typeof method !== 'function' || !supportsRetention(key, target, retentionEnabled(key)))
        return refused(requestIdOf(request), 'unavailable')
      return Reflect.apply(method, extension, [request])
    }
  }

  function guardedFacility<F extends FacilityKey>(
    key: F,
    original: EnvironmentFacilities[F] & object,
    operations: readonly string[],
  ): EnvironmentFacilities[F] & object {
    return new Proxy(original, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver)
        if (isRetainingKey(key) && property === 'retention') {
          if (!isRecord(value) || !supportsRetention(key, target, retentionEnabled(key)))
            return undefined
          return Object.freeze(
            Object.fromEntries(
              handedOperations(key, value).map(operation => [
                operation,
                retentionMethod(key, target, value, operation),
              ]),
            ),
          )
        }
        if (typeof property !== 'string' || !operations.includes(property)) return value
        return async (request: unknown) => {
          const decision = await gate(key, property, request)
          if (decision !== 'pass') return decision
          if (
            typeof value !== 'function' ||
            (requiresRetention(key, property, request) &&
              !supportsRetention('terminal', target, hooks.retentionEnabled))
          )
            return refused(requestIdOf(request), 'unsupported')
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
