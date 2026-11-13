import type { ObserveSessionFrame } from '@omne-harness/session-protocol'

/** The json-text tree the contract reads `json` values into (the `value` of a snapshot frame). */
export type JsonTree = Extract<ObserveSessionFrame, { kind: 'snapshot' }>['value']

/** A JSON value as plain data. Numbers keep only what `Number` reads; the view shows them as text. */
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

/**
 * Orders two decimal texts (session revisions, entry ids, output cursors) without turning them into
 * numbers: the shorter one is smaller, equal lengths compare as text. Non-decimal texts fall back
 * to the same rule, which is still a total order.
 */
export function compareDecimal(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}
