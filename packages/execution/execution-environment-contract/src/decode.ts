import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
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
import type { Access, AcquisitionRef, OriginRef } from './identity.ts'
import type { EnvironmentRequirement, IsolationClaim } from './requirement.ts'

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

function isAcquisitionText(text: string): text is AcquisitionRef {
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

export const decodeAcquisition: Decoder<AcquisitionRef> = (value, path) =>
  typeof value === 'string' && isAcquisitionText(value)
    ? accept(value)
    : refuse(path, 'expected a non-empty acquisition reference')

export function decodeNonEmpty(value: unknown, path: Path): Decoded<string> {
  return typeof value === 'string' && value.length > 0
    ? accept(value)
    : refuse(path, 'expected a non-empty string')
}

/** Accepts exactly one of `literals`; the message names them all. */
export function decodeLiteral<const L extends string>(literals: readonly L[]): Decoder<L> {
  return (value, path) => {
    const found = literals.find(literal => literal === value)
    return found === undefined ? refuse(path, `expected ${literals.join(', ')}`) : accept(found)
  }
}

/**
 * Checks that a runtime member is a function and returns the record unchanged. Runtime objects
 * (providers, leases, ports) are checked by structure only: the caller must get back the very
 * object it handed in, not a copy.
 */
export function hasFunctions(
  record: Readonly<Record<string, unknown>>,
  path: Path,
  names: readonly string[],
): Decoded<true> {
  for (const name of names)
    if (typeof record[name] !== 'function') return refuse([...path, name], 'expected a function')
  return accept(true)
}

/**
 * A JSON value is the closed tree of json-text, judged by `judgeJsonValue`. Its refusal becomes one
 * issue whose path continues into the tree.
 */
export const decodeJsonValue: Decoder<JsonValue> = (value, path) => {
  const judged = judgeJsonValue(value)
  return 'ok' in judged
    ? accept(judged.ok)
    : refuse([...path, ...judged.path], `expected a JSON value (${judged.rejected})`)
}

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

type IdentityPart<N extends string> = Readonly<{ name: N; text: string }>

type TenantShape = Readonly<{
  name: 'TenantId'
  organization: IdentityPart<'OrganizationId'>
  account: IdentityPart<'AccountId'>
}>

function isIdentityPart<N extends string>(value: unknown, name: N): value is IdentityPart<N> {
  return isRecord(value) && value['name'] === name && typeof value['text'] === 'string'
}

// Checks the shape only. Whether legal-identity minted the value is asked of its own codec below.
function hasTenantShape(value: unknown): value is TenantShape {
  return (
    isRecord(value) &&
    value['name'] === 'TenantId' &&
    isIdentityPart(value['organization'], 'OrganizationId') &&
    isIdentityPart(value['account'], 'AccountId')
  )
}

/**
 * The wire form of a tenant belongs to legal-identity: the tenant text of `tenantCodec`, parsed and
 * minted by that codec. A tenant minted in this process passes unchanged when `tenantCodec` can
 * encode it. Any other object, even one shaped like a tenant, is refused.
 */
export const decodeTenant: Decoder<TenantId> = (value, path) => {
  if (typeof value === 'string') {
    const parsed = tenantCodec.parse(value)
    return parsed.ok
      ? accept(parsed.value)
      : refuse(path, `expected tenant text (${parsed.error.code})`)
  }
  if (hasTenantShape(value) && tenantCodec.encode(value).ok) return accept(value)
  return refuse(path, 'expected tenant text or a minted tenant identity')
}

/**
 * An access identity. The principal is opaque to the environment: its key must be present, its
 * value is passed on as it is. The tenant follows `decodeTenant`.
 */
export const decodeAccess: Decoder<Access<unknown>> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected an access identity')
  const keys = exactKeys(value, path, ['principal', 'tenant'])
  if (!keys.ok) return keys
  const tenant = decodeTenant(value['tenant'], [...path, 'tenant'])
  if (!tenant.ok) return tenant
  return accept(Object.freeze({ principal: value['principal'], tenant: tenant.value }))
}

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

export const decodeRequirement: Decoder<EnvironmentRequirement> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected an environment requirement')
  const keys = exactKeys(value, path, ['allowedBindings', 'facilities', 'isolation'])
  if (!keys.ok) return keys
  const allowedBindings = decodeArray(decodeBinding)(value['allowedBindings'], [
    ...path,
    'allowedBindings',
  ])
  if (!allowedBindings.ok) return allowedBindings
  const facilities = decodeArray(decodeFacilityKey)(value['facilities'], [...path, 'facilities'])
  if (!facilities.ok) return facilities
  const isolation = decodeArray(decodeIsolationClaim)(value['isolation'], [...path, 'isolation'])
  if (!isolation.ok) return isolation
  return accept(
    Object.freeze({
      allowedBindings: allowedBindings.value,
      facilities: facilities.value,
      isolation: isolation.value,
    }),
  )
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
