import type { HistoryEntry } from '@omne-harness/session-contract'

export type Payload = HistoryEntry['payload']

const MAX_DEPTH = 64

export function payloadOf(value: unknown, depth = 0): Payload {
  if (depth > MAX_DEPTH) throw new TypeError('the value is nested too deeply')
  if (value === null) return { kind: 'null' }
  switch (typeof value) {
    case 'string':
      return { kind: 'string', value }
    case 'boolean':
      return { kind: 'boolean', value }
    case 'number':
      if (!Number.isFinite(value))
        throw new TypeError('the value holds a number that is not finite')
      return { kind: 'number', lexeme: String(value) }
    case 'object': {
      if (Array.isArray(value))
        return { kind: 'array', items: value.map(item => payloadOf(item, depth + 1)) }
      const entries = Object.entries(value)
        .filter(([, member]) => member !== undefined)
        .map(([key, member]) => ({ key, value: payloadOf(member, depth + 1) }))
      return { kind: 'object', entries }
    }
    default:
      throw new TypeError('the value is not plain data')
  }
}

export function payloadBytes(payload: Payload): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8')
}
