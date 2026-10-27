// Value helpers that the public doubles share. Nothing here is exported from the entry.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { misuse } from './error.ts'

/** The tenant as its minted text; a tenant that is not a legal identity is a misuse. */
export function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw misuse('the tenant is not a legal identity')
  return encoded.value
}

/** A deep copy of `value` with every object in the copied tree frozen. */
export function frozenCopy<T>(value: T): T {
  const copy = structuredClone(value)
  freezeTree(copy)
  return copy
}

function freezeTree(value: unknown): void {
  if (value === null || typeof value !== 'object') return
  for (const child of Object.values(value)) freezeTree(child)
  Object.freeze(value)
}

/**
 * Structural equality of two value trees: object key order does not take part, array order,
 * variants and field presence do. A missing field and a field set to undefined differ.
 */
export function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const first = Object.entries(left)
  const second = new Map(Object.entries(right))
  return (
    first.length === second.size &&
    first.every(([key, value]) => second.has(key) && sameValue(value, second.get(key)))
  )
}

/** Whether decimal text `left` names a larger number than `right`; no conversion to number. */
export function laterDecimal(left: string, right: string): boolean {
  if (left.length !== right.length) return left.length > right.length
  return left > right
}
