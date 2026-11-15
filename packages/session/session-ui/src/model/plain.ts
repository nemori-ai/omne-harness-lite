import type { ObserveSessionFrame } from '@omne-harness/session-protocol'

export type JsonTree = Extract<ObserveSessionFrame, { kind: 'snapshot' }>['value']

export type Plain =
  | null
  | boolean
  | number
  | string
  | readonly Plain[]
  | { readonly [key: string]: Plain }

export function toPlain(tree: JsonTree): Plain {
  switch (tree.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return tree.value
    case 'number':
      return Number(tree.lexeme)
    case 'array':
      return tree.items.map(toPlain)
    case 'object': {
      const result: Record<string, Plain> = {}
      for (const entry of tree.entries) result[entry.key] = toPlain(entry.value)
      return result
    }
  }
}

export function toTree(value: Plain): JsonTree {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: JSON.stringify(value) }
  if (Array.isArray(value)) return { kind: 'array', items: (value as readonly Plain[]).map(toTree) }
  return {
    kind: 'object',
    entries: Object.entries(value).map(([key, item]) => ({ key, value: toTree(item) })),
  }
}

export function isRecord(value: Plain | undefined): value is { readonly [key: string]: Plain } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function textOf(value: Plain | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function listOf(value: Plain | undefined): readonly Plain[] {
  return Array.isArray(value) ? (value as readonly Plain[]) : []
}

export function compareDecimal(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}
