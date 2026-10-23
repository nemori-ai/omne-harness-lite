import type { ModelDelivery, ModelDeliveryKey } from '@omne-harness/model-contract'
import { decodeModelInvocationRef } from '@omne-harness/model-contract'

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
function canonical(value: unknown): string | undefined {
  if (Array.isArray(value))
    return '[' + value.map(item => canonical(item) ?? 'null').join(',') + ']'
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const fields: string[] = []
    for (const [key, child] of entries) {
      const encoded = canonical(child)
      if (encoded !== undefined) fields.push(JSON.stringify(key) + ':' + encoded)
    }
    return '{' + fields.join(',') + '}'
  }
  return JSON.stringify(value)
}
export function deliveryBytes(delivery: ModelDelivery): number {
  return new TextEncoder().encode(canonical(delivery)).byteLength
}
export function deliveryIdentity(key: ModelDeliveryKey): string {
  const reference = decodeModelInvocationRef(key.reference)
  if ('failure' in reference) throw new TypeError('Invalid fixture invocation')
  return key.kind === 'result'
    ? JSON.stringify([key.kind, reference.ok, key.result])
    : JSON.stringify([key.kind, reference.ok, key.dispatch, key.revision])
}
export function attachmentLocations(delivery: ModelDelivery): readonly string[] {
  const locations = new Set<string>()
  if (delivery.kind === 'result') {
    for (const part of delivery.parts) {
      if (part.kind !== 'sealed') continue
      const block = part.block
      if ('ref' in block) locations.add(attachmentIdentity(block.ref))
      else if (block.kind === 'file') locations.add(attachmentIdentity(block))
    }
  }
  return [...locations]
}
export function attachmentIdentity(location: Readonly<{ storage: string; key: string }>): string {
  return JSON.stringify([location.storage, location.key])
}
