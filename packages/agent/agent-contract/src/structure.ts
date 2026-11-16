import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentIdentity, IdentityFailure, StructureFailure } from './identity.ts'

export type OwnMembers = Readonly<Record<string, unknown>>

function isPlainObject(value: unknown): value is object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function dataMember(value: object, key: string | symbol): [string, unknown] | undefined {
  if (typeof key !== 'string') return undefined
  const description = Object.getOwnPropertyDescriptor(value, key)
  if (description === undefined || !('value' in description)) return undefined
  return [key, description.value]
}

function readMembers(value: unknown): OwnMembers | undefined {
  if (!isPlainObject(value)) return undefined
  const members: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    const member = dataMember(value, key)
    if (member === undefined) return undefined
    members[member[0]] = member[1]
  }
  return members
}

export function ownMembers(value: unknown): OwnMembers | undefined {
  try {
    return readMembers(value)
  } catch {
    return undefined
  }
}

export const refusal = (field: string, reason: StructureFailure['reason']) =>
  fail<StructureFailure>({ field, reason })

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

export function identityMember<T extends AgentIdentity<string>>(
  members: OwnMembers,
  name: string,
  decode: (value: unknown) => Outcome<T, IdentityFailure>,
): Outcome<T, StructureFailure> {
  if (!Object.hasOwn(members, name)) return refusal(name, 'missing')
  const decoded = decode(members[name])
  return 'failure' in decoded ? refusal(name, 'identity') : decoded
}
