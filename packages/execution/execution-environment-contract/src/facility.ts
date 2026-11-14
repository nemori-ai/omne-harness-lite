import type { EnvironmentBinding } from './binding.ts'
import type { Access, OriginRef } from './identity.ts'

export interface EnvironmentFacilities {}

export type FacilityKey = keyof EnvironmentFacilities & string

export type FacilityOperation<K extends FacilityKey> = Exclude<
  keyof EnvironmentFacilities[K],
  K extends 'command' ? 'retention' | 'containment' : K extends 'terminal' ? 'retention' : never
> &
  string

export interface FacilityDescriptor<K extends FacilityKey> {
  readonly key: K
  readonly operations: readonly FacilityOperation<K>[]
  readonly guarded: readonly FacilityOperation<K>[]
}

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

export type FacilityResult<T> =
  | { readonly kind: 'done'; readonly requestId: string; readonly value: T }
  | { readonly kind: 'unresolved'; readonly requestId: string }
  | { readonly kind: 'rejected'; readonly requestId: string; readonly reason: FacilityReason }
  | { readonly kind: 'unknown'; readonly requestId: string }

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
