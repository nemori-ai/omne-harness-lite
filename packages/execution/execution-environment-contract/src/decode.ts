import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { StandardTyped } from '@omne-harness/schema-provider'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  bindingKinds,
  type BindingKind,
  type EnvironmentBinding,
  type EnvironmentContinuity,
} from './binding.ts'
import type { FacilityKey } from './facility.ts'
import type { OriginRef } from './identity.ts'
import type { IsolationClaim } from './requirement.ts'

export type Path = readonly (string | number)[]
export type Issue = Readonly<{ message: string; path: Path }>
export type Decoded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] }
export type Decoder<T> = (value: unknown, path: Path) => Decoded<T>

export function accept<T>(value: T): Decoded<T> {
  return { ok: true, value }
}

export function refuse(path: Path, message: string): Decoded<never> {
  return { ok: false, issues: [{ message, path }] }
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Refuses a record with a missing required key or any key outside `required` and `optional`. */
export function exactKeys(
  record: Readonly<Record<string, unknown>>,
  path: Path,
  required: readonly string[],
  optional: readonly string[] = [],
): Decoded<true> {
  for (const key of required)
    if (!Object.hasOwn(record, key)) return refuse([...path, key], 'missing key')
  for (const key of Object.keys(record))
    if (!required.includes(key) && !optional.includes(key))
      return refuse([...path, key], 'unknown key')
  return accept(true)
}

export function decodeArray<T>(element: Decoder<T>): Decoder<readonly T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) return refuse(path, 'expected an array')
    const items: T[] = []
    for (const [index, item] of value.entries()) {
      const decoded = element(item, [...path, index])
      if (!decoded.ok) return decoded
      items.push(decoded.value)
    }
    return accept(Object.freeze(items))
  }
}

export function decodeString(value: unknown, path: Path): Decoded<string> {
  return typeof value === 'string' ? accept(value) : refuse(path, 'expected a string')
}

export function decodeNumber(value: unknown, path: Path): Decoded<number> {
  return typeof value === 'number' && Number.isFinite(value)
    ? accept(value)
    : refuse(path, 'expected a finite number')
}

// Facility keys and isolation claims are open vocabularies: any non-empty string is a claim of a
// key. Whether the key is registered is checked when an acquisition asks for it.
function isFacilityKeyText(text: string): text is FacilityKey {
  return text.length > 0
}

function isIsolationClaimText(text: string): text is IsolationClaim {
  return text.length > 0
}

function isOriginText(text: string): text is OriginRef {
  return text.length > 0
}

function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}

function isBindingKind(text: string): text is BindingKind {
  return bindingKinds.some(kind => kind === text)
}

export const decodeFacilityKey: Decoder<FacilityKey> = (value, path) =>
  typeof value === 'string' && isFacilityKeyText(value)
    ? accept(value)
    : refuse(path, 'expected a non-empty facility key')

export const decodeIsolationClaim: Decoder<IsolationClaim> = (value, path) =>
  typeof value === 'string' && isIsolationClaimText(value)
    ? accept(value)
    : refuse(path, 'expected a non-empty isolation claim')

export const decodeBindingKind: Decoder<BindingKind> = (value, path) =>
  typeof value === 'string' && isBindingKind(value)
    ? accept(value)
    : refuse(path, 'expected a binding layer kind')

export const decodeOrigin: Decoder<OriginRef> = (value, path) =>
  typeof value === 'string' && isOriginText(value)
    ? accept(value)
    : refuse(path, 'expected a non-empty origin reference')

export const decodeScope: Decoder<ScopeRef> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected a scope reference')
  const keys = exactKeys(value, path, ['ref'], ['parent'])
  if (!keys.ok) return keys
  const ref = value['ref']
  if (typeof ref !== 'string' || !isScopeText(ref))
    return refuse([...path, 'ref'], 'expected a non-empty scope reference')
  if (value['parent'] === undefined) return accept(Object.freeze({ ref }))
  const parent = decodeScope(value['parent'], [...path, 'parent'])
  if (!parent.ok) return parent
  return accept(Object.freeze({ ref, parent: parent.value }))
}

function isIdentityPart(value: unknown, name: string): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    value['name'] === name &&
    typeof value['text'] === 'string'
  )
}

function isTenantId(value: unknown): value is TenantId {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    value['name'] === 'TenantId' &&
    isIdentityPart(value['organization'], 'OrganizationId') &&
    isIdentityPart(value['account'], 'AccountId')
  )
}

/** Keeps the original tenant object, so identity equality of minted tenants still holds. */
export const decodeTenant: Decoder<TenantId> = (value, path) =>
  isTenantId(value) ? accept(value) : refuse(path, 'expected a tenant identity')

export const decodeBinding: Decoder<EnvironmentBinding> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected a binding')
  const kind = decodeBindingKind(value['kind'], [...path, 'kind'])
  if (!kind.ok) return kind
  switch (kind.value) {
    case 'host_machine': {
      const keys = exactKeys(value, path, ['kind'])
      return keys.ok ? accept(Object.freeze({ kind: kind.value })) : keys
    }
    case 'stateless_sandbox': {
      const keys = exactKeys(value, path, ['kind', 'scope', 'origin'])
      if (!keys.ok) return keys
      const scope = decodeScope(value['scope'], [...path, 'scope'])
      if (!scope.ok) return scope
      const origin = decodeOrigin(value['origin'], [...path, 'origin'])
      if (!origin.ok) return origin
      return accept(Object.freeze({ kind: kind.value, scope: scope.value, origin: origin.value }))
    }
    case 'session_sandbox': {
      const keys = exactKeys(value, path, ['kind', 'scope'])
      if (!keys.ok) return keys
      const scope = decodeScope(value['scope'], [...path, 'scope'])
      if (!scope.ok) return scope
      return accept(Object.freeze({ kind: kind.value, scope: scope.value }))
    }
    case 'tenant_sandbox': {
      const keys = exactKeys(value, path, ['kind', 'tenant'])
      if (!keys.ok) return keys
      const tenant = decodeTenant(value['tenant'], [...path, 'tenant'])
      if (!tenant.ok) return tenant
      return accept(Object.freeze({ kind: kind.value, tenant: tenant.value }))
    }
    default: {
      const exhaustive: never = kind.value
      return exhaustive
    }
  }
}

export const decodeContinuity: Decoder<EnvironmentContinuity> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected a continuity')
  switch (value['kind']) {
    case 'not_guaranteed': {
      const keys = exactKeys(value, path, ['kind'])
      return keys.ok ? accept(Object.freeze({ kind: 'not_guaranteed' })) : keys
    }
    case 'continuous': {
      const keys = exactKeys(value, path, ['kind', 'data', 'revision'])
      if (!keys.ok) return keys
      const data = decodeString(value['data'], [...path, 'data'])
      if (!data.ok) return data
      const revision = decodeString(value['revision'], [...path, 'revision'])
      if (!revision.ok) return revision
      return accept(
        Object.freeze({ kind: 'continuous', data: data.value, revision: revision.value }),
      )
    }
    case 'lost': {
      const keys = exactKeys(value, path, ['kind', 'previous'])
      if (!keys.ok) return keys
      const previous = decodeString(value['previous'], [...path, 'previous'])
      if (!previous.ok) return previous
      return accept(Object.freeze({ kind: 'lost', previous: previous.value }))
    }
    default:
      return refuse([...path, 'kind'], 'expected a continuity kind')
  }
}

/** Wraps a decoder as a synchronous Standard Schema that schema-provider also accepts. */
export function standardSchema<T>(
  decode: Decoder<T>,
): StandardSchemaV1<unknown, T> & StandardTyped<T> {
  return Object.freeze({
    '~standard': Object.freeze({
      version: 1,
      vendor: 'omne-harness',
      validate(value: unknown): StandardSchemaV1.Result<T> {
        const decoded = decode(value, [])
        return decoded.ok ? { value: decoded.value } : { issues: decoded.issues }
      },
    }),
  })
}
