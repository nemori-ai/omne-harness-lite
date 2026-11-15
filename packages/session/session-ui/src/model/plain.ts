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

export function plainOfTree(value: Plain): Plain | undefined {
  if (!isRecord(value)) return undefined
  switch (value['kind']) {
    case 'null':
      return null
    case 'boolean':
      return typeof value['value'] === 'boolean' ? value['value'] : undefined
    case 'string':
      return textOf(value['value'])
    case 'number':
      return numberOf(value['lexeme'])
    case 'array':
      return itemsOf(value['items'])
    case 'object':
      return entriesOf(value['entries'])
    default:
      return undefined
  }
}

function numberOf(lexeme: Plain | undefined): number | undefined {
  const number = typeof lexeme === 'string' ? Number(lexeme) : Number.NaN
  return Number.isFinite(number) ? number : undefined
}

function itemsOf(items: Plain | undefined): Plain | undefined {
  if (!Array.isArray(items)) return undefined
  const plain = (items as readonly Plain[]).map(plainOfTree)
  return plain.every(item => item !== undefined) ? (plain as Plain[]) : undefined
}

function entriesOf(entries: Plain | undefined): Plain | undefined {
  if (!Array.isArray(entries)) return undefined
  const result: Record<string, Plain> = {}
  for (const entry of entries as readonly Plain[]) {
    const key = isRecord(entry) ? textOf(entry['key']) : undefined
    const value = isRecord(entry) ? plainOfTree(entry['value'] ?? null) : undefined
    if (key === undefined || value === undefined) return undefined
    result[key] = value
  }
  return result
}
