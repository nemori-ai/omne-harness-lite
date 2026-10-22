import type { EnvironmentBinding } from './binding.ts'
import type { Access, OriginRef } from './identity.ts'

/**
 * Facility key to facility interface. Each facility owner adds its key with `declare module`.
 * An augmentation only adds vocabulary: it neither installs nor authorizes the facility.
 */
export interface EnvironmentFacilities {}

export type FacilityKey = keyof EnvironmentFacilities & string

/** Operation names of one facility. */
export type FacilityOperation<K extends FacilityKey> = keyof EnvironmentFacilities[K] & string

/**
 * Facility declaration registered with the environment. `guarded` names the operations that must
 * pass the `FacilityGuard` before the facility is called.
 */
export interface FacilityDescriptor<K extends FacilityKey> {
  readonly key: K
  readonly operations: readonly FacilityOperation<K>[]
  readonly guarded: readonly FacilityOperation<K>[]
}

/** One facility request. Each `requestId` gets exactly one confirmation. */
export interface FacilityRequest<P> {
  readonly requestId: string
  readonly access: Access<P>
  readonly origin: OriginRef
  readonly binding: EnvironmentBinding
}

export type FacilityReason =
  | 'invalidInput'
  | 'notAuthorized'
  | 'notFound'
  | 'conflict'
  | 'busy'
  | 'capacity'
  | 'unsupported'
  | 'closed'
  | 'unavailable'
  | 'effectUnknown'

/** `done` confirms only the one item this request names. */
export type FacilityResult<T> =
  | { readonly kind: 'done'; readonly requestId: string; readonly value: T }
  | { readonly kind: 'unresolved'; readonly requestId: string }
  | { readonly kind: 'rejected'; readonly requestId: string; readonly reason: FacilityReason }
  | { readonly kind: 'unknown'; readonly requestId: string }

/** Builds a descriptor whose operation list is complete: every operation must have an entry. */
export function describeFacility<K extends FacilityKey>(
  key: K,
  operations: { readonly [O in FacilityOperation<K>]: 'guarded' | 'open' },
): FacilityDescriptor<K> {
  const isOperation = (name: string): name is FacilityOperation<K> =>
    Object.hasOwn(operations, name)
  const names = Object.keys(operations).filter(isOperation)
  return Object.freeze({
    key,
    operations: Object.freeze(names),
    guarded: Object.freeze(names.filter(name => operations[name] === 'guarded')),
  })
}
