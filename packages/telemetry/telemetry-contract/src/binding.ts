import { actingScopeCodec, type ActingScope } from '@omne-harness/legal-identity'
import { decodeValue, type Carrier } from './carrier.ts'
import { isRef } from './fields.ts'
import {
  OK,
  TELEMETRY_LIMITS,
  dataMembers,
  invalid,
  isToken,
  type InvalidReason,
  type ValidationResult,
} from './limits.ts'

/** An opaque reference with the name of its owner. Telemetry does not decode it. */
export type OwnedRef = Readonly<{ owner: string; ref: string }>

/** Whom the recorded fact belongs to: one tenant's work, or the service process itself. */
export type TelemetryScope = ActingScope

/** The correlation of every record that one emitter makes. */
export type Binding = Readonly<{
  scope: TelemetryScope
  component: string
  instance: OwnedRef
  work?: OwnedRef
  attempt?: OwnedRef
  call?: OwnedRef
  adopted?: readonly OwnedRef[]
  links?: readonly Carrier[]
}>

function isOwnedRef(value: unknown): boolean {
  const read = dataMembers(value)
  if (read.kind !== 'members' || read.members.size !== 2) return false
  return (
    isToken(read.members.get('owner'), TELEMETRY_LIMITS.ownerMaxLength) &&
    isRef(read.members.get('ref'), TELEMETRY_LIMITS.refMaxBytes)
  )
}

function isBoundedList(value: unknown, max: number, item: (value: unknown) => boolean): boolean {
  return Array.isArray(value) && value.length <= max && value.every(item)
}

function isScope(value: unknown): boolean {
  // The codec is the minting check: it encodes only a scope that legal-identity minted, and
  // answers a failure for any other value, whatever its type.
  return actingScopeCodec.encode(value as ActingScope).ok
}

function optional(check: (value: unknown) => boolean): (value: unknown) => boolean {
  return value => value === undefined || check(value)
}

type MemberCheck = readonly [(value: unknown) => boolean, InvalidReason]

/** Every member a binding may have, the check of its value and the reason when the check fails. */
const MEMBERS: ReadonlyMap<PropertyKey, MemberCheck> = new Map<PropertyKey, MemberCheck>([
  ['scope', [isScope, 'scope']],
  ['component', [value => isToken(value, TELEMETRY_LIMITS.componentMaxLength), 'component']],
  ['instance', [isOwnedRef, 'owned-ref']],
  ['work', [optional(isOwnedRef), 'owned-ref']],
  ['attempt', [optional(isOwnedRef), 'owned-ref']],
  ['call', [optional(isOwnedRef), 'owned-ref']],
  [
    'adopted',
    [optional(value => isBoundedList(value, TELEMETRY_LIMITS.maxAdopted, isOwnedRef)), 'adopted'],
  ],
  [
    'links',
    [
      optional(value =>
        isBoundedList(value, TELEMETRY_LIMITS.maxLinks, link => decodeValue(link).kind === 'ok'),
      ),
      'links',
    ],
  ],
])

function check(binding: unknown): ValidationResult {
  const read = dataMembers(binding)
  if (read.kind === 'not-object') return invalid('not-object')
  if (read.kind === 'accessor') return invalid('malformed')
  for (const key of read.members.keys()) if (!MEMBERS.has(key)) return invalid('undeclared-key')
  for (const [key, [isValid, reason]] of MEMBERS)
    if (!isValid(read.members.get(key))) return invalid(reason)
  return OK
}

/**
 * Checks a binding. The scope must be minted by legal-identity; a value of the same shape is not
 * enough. Never throws: an input that throws while it is read is `malformed`.
 */
export function validateBinding(binding: Binding): ValidationResult {
  try {
    return check(binding)
  } catch {
    return invalid('malformed')
  }
}
