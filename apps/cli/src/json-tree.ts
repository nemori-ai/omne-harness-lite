/** The protocol carries a JSON value as a tagged tree; the command line gives it as JSON text. */
export type JsonTree =
  | { readonly kind: 'null' }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly lexeme: string }
  | { readonly kind: 'array'; readonly items: readonly JsonTree[] }
  | {
      readonly kind: 'object'
      readonly entries: readonly { readonly key: string; readonly value: JsonTree }[]
    }

export function treeOf(value: unknown): JsonTree {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: JSON.stringify(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(treeOf) }
  return {
    kind: 'object',
    entries: Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({
      key,
      value: treeOf(entry),
    })),
  }
}
