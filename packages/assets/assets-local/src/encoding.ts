import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import type { DomainRef, JsonValue, SqlIdentity } from '@omne-harness/sql-contract'
export function canonical(value: unknown): string {
  const encoded = canonicalize(value)
  if (encoded === undefined) throw new TypeError('Expected JSON value')
  return encoded
}
export function json(value: unknown): JsonValue {
  return JSON.parse(canonical(value))
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
export function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}
export function identity(domain: DomainRef, operationId: string): SqlIdentity {
  return {
    ...domain,
    operation: 'assets.mutate',
    protocolVersion: '2',
    operationKey: digest(operationId),
  }
}
export function scopeRef(domain: DomainRef): string | null {
  return domain.scope.kind === 'tenant' ? domain.scope.tenant : null
}
export function withinBudget(value: unknown): boolean {
  const active = new Set<object>()
  let nodes = 0,
    bytes = 0
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 50000 || depth > 32) return false
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item)
      return bytes <= 1024 * 1024
    }
    if (item === null || typeof item === 'boolean') return true
    if (typeof item === 'number') return Number.isFinite(item)
    if (typeof item !== 'object' || active.has(item)) return false
    active.add(item)
    const valid = Object.entries(item).every(
      ([key, child]) => visit(key, depth + 1) && visit(child, depth + 1),
    )
    active.delete(item)
    return valid
  }
  return visit(value, 0) && Buffer.byteLength(canonical(value)) <= 1024 * 1024
}
