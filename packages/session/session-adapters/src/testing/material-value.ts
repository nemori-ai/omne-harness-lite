import type { Material } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
type Json = Extract<Material<ContentBlock>, { kind: 'facts' }>['value']
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
export function jsonTree(value: unknown): value is Json {
  if (!object(value)) return false
  switch (value.kind) {
    case 'null':
      return true
    case 'string':
      return typeof value.value === 'string'
    case 'boolean':
      return typeof value.value === 'boolean'
    case 'number':
      return (
        typeof value.lexeme === 'string' &&
        /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/u.test(value.lexeme)
      )
    case 'array':
      return Array.isArray(value.items) && value.items.every(jsonTree)
    case 'object':
      return (
        Array.isArray(value.entries) &&
        value.entries.every(e => object(e) && typeof e.key === 'string' && jsonTree(e.value)) &&
        new Set(value.entries.map(e => e.key)).size === value.entries.length
      )
    default:
      return false
  }
}
