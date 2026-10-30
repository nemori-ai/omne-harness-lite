// The shared mechanics of the structure judgments (SPEC "身份解码与结构判定"): the own data
// members of a plain object, the refusal shape, and the readers of one text member, one identity
// member and one unknown member. Internal to this package: identity.ts and judge-handoff.ts
// consume it; the entry exports none of it.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentIdentity, IdentityFailure, StructureFailure } from './identity.ts'

export type OwnMembers = Readonly<Record<string, unknown>>

function isPlainObject(value: unknown): value is object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** One own member as name and value, or `undefined` for a symbol key and for an accessor. */
function dataMember(value: object, key: string | symbol): [string, unknown] | undefined {
  if (typeof key !== 'string') return undefined
  const description = Object.getOwnPropertyDescriptor(value, key)
  if (description === undefined || !('value' in description)) return undefined
  return [key, description.value]
}

function readMembers(value: unknown): OwnMembers | undefined {
  if (!isPlainObject(value)) return undefined
  // No prototype, so an own member named `__proto__` stays a member and reaches the closed field
  // check, as in the copy of check.ts.
  const members: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    const member = dataMember(value, key)
    if (member === undefined) return undefined
    members[member[0]] = member[1]
  }
  return members
}

/**
 * The own data members of a plain object, or `undefined` for anything else: a primitive, an array,
 * an instance with another prototype, an accessor, a symbol key, or an object whose reflection
 * throws. An accessor is refused instead of read, so a judgment never runs the caller's code.
 */
export function ownMembers(value: unknown): OwnMembers | undefined {
  try {
    return readMembers(value)
  } catch {
    return undefined
  }
}

export const refusal = (field: string, reason: StructureFailure['reason']) =>
  fail<StructureFailure>({ field, reason })

/** A member that a structure requires, read through one rule for presence, type and emptiness. */
export function textMember(members: OwnMembers, name: string): Outcome<string, StructureFailure> {
  if (!Object.hasOwn(members, name)) return refusal(name, 'missing')
  const text = members[name]
  if (typeof text !== 'string') return refusal(name, 'type')
  if (text.length === 0) return refusal(name, 'empty')
  return succeed(text)
}

export function unknownMember(members: OwnMembers, known: readonly string[]): string | undefined {
  return Object.keys(members).find(key => !known.includes(key))
}

/** A member whose text an identity decoder judges. Any decoder failure is one `identity` refusal. */
export function identityMember<T extends AgentIdentity<string>>(
  members: OwnMembers,
  name: string,
  decode: (value: unknown) => Outcome<T, IdentityFailure>,
): Outcome<T, StructureFailure> {
  if (!Object.hasOwn(members, name)) return refusal(name, 'missing')
  const decoded = decode(members[name])
  return 'failure' in decoded ? refusal(name, 'identity') : decoded
}
