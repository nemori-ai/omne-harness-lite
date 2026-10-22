import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ScopeRef, ContextBlockKey } from './shared.js'

export type ScopeRefRejection = Readonly<{
  path: readonly (string | number)[]
  reason: 'type' | 'missing-key' | 'unknown-key' | 'empty' | 'parent'
}>
export type ContextBlockKeyRejection = Readonly<{
  reason: 'type' | 'empty' | 'owner' | 'name' | 'character'
}>

function isScope(value: unknown, seen: Set<object>): value is ScopeRef {
  if (typeof value !== 'object' || value === null || seen.has(value)) return false
  seen.add(value)
  if (!('ref' in value) || typeof value.ref !== 'string' || value.ref.trim().length === 0)
    return false
  if (Object.keys(value).some(key => key !== 'ref' && key !== 'parent')) return false
  return !('parent' in value) || value.parent === undefined || isScope(value.parent, seen)
}
export function decodeScopeRef(value: unknown): Outcome<ScopeRef, ScopeRefRejection> {
  if (isScope(value, new Set())) return succeed(value)
  let current = value
  const path: string[] = []
  const seen = new Set<object>()
  while (typeof current === 'object' && current !== null) {
    if (seen.has(current)) return fail({ path, reason: 'parent' })
    seen.add(current)
    const unknown = Object.keys(current).find(key => key !== 'ref' && key !== 'parent')
    if (unknown) return fail({ path: [...path, unknown], reason: 'unknown-key' })
    if (!('ref' in current)) return fail({ path: [...path, 'ref'], reason: 'missing-key' })
    if (typeof current.ref !== 'string') return fail({ path: [...path, 'ref'], reason: 'type' })
    if (!current.ref.trim()) return fail({ path: [...path, 'ref'], reason: 'empty' })
    if (!('parent' in current)) break
    current = current.parent
    path.push('parent')
  }
  return fail({ path, reason: 'type' })
}
function isKey(value: string): value is ContextBlockKey {
  const dot = value.indexOf('.')
  return dot > 0 && dot < value.length - 1 && !/\s/.test(value)
}
export function decodeContextBlockKey(
  value: unknown,
): Outcome<ContextBlockKey, ContextBlockKeyRejection> {
  if (typeof value !== 'string') return fail({ reason: 'type' })
  if (value.length === 0) return fail({ reason: 'empty' })
  if (/\s/.test(value)) return fail({ reason: 'character' })
  if (isKey(value)) return succeed(value)
  return fail({ reason: value.startsWith('.') ? 'owner' : 'name' })
}
