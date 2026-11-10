import type { GuardCommand } from '@omne-harness/session-contract'
type Facts = GuardCommand['facts']

export function jsonOf(plain: unknown): Facts {
  if (plain === null || plain === undefined) return { kind: 'null' }
  if (typeof plain === 'string') return { kind: 'string', value: plain }
  if (typeof plain === 'boolean') return { kind: 'boolean', value: plain }
  if (typeof plain === 'number') return { kind: 'number', lexeme: String(plain) }
  if (Array.isArray(plain)) return { kind: 'array', items: plain.map(jsonOf) }
  const entries = Object.entries(plain as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: jsonOf(value) }))
  return { kind: 'object', entries }
}
