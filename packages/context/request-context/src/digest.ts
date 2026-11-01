// Canonical encoding and digest of strategy parameters. Keys are sorted recursively; arrays keep
// their order. The digest tells a plan whether the strategy it was made with is still in force.
import { createHash } from 'node:crypto'

export function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(',')}}`
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('base64url')
}
