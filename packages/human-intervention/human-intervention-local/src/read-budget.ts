import { canonical } from './encoding.ts'
export const READ_BYTES = 8 << 20
const PAGE_ENVELOPE_BYTES = 4096
export const readLimited = {
  kind: 'limited',
  resource: 'read-result-bytes',
  limit: READ_BYTES,
} as const
export function itemBytes(value: unknown) {
  return Buffer.byteLength(canonical(value), 'utf8') + 1
}
export function pageBudget(header: unknown = null) {
  let bytes = PAGE_ENVELOPE_BYTES + itemBytes(header)
  return {
    fits: bytes <= READ_BYTES,
    accept(value: unknown) {
      const next = bytes + itemBytes(value)
      if (next > READ_BYTES) return false
      bytes = next
      return true
    },
  }
}
