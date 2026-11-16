import { isAlias, isMap, isScalar, isSeq, type Document, type YAMLMap, type YAMLSeq } from 'yaml'
import type { ManifestValue } from '../values.ts'

const MAX_DEPTH = 16
const MAX_NODES = 4096

type Budget = { nodes: number }

export function plainValue(document: Document, node: unknown): ManifestValue | undefined {
  return convert(document, node, 1, { nodes: 0 })
}

function convert(
  document: Document,
  node: unknown,
  depth: number,
  budget: Budget,
): ManifestValue | undefined {
  if (isAlias(node)) return convert(document, node.resolve(document), depth, budget)
  budget.nodes += 1
  if (budget.nodes > MAX_NODES) return undefined
  if (isScalar(node)) return scalar(node.value)
  if (node === null) return null
  if (depth > MAX_DEPTH) return undefined
  if (isSeq(node)) return sequence(document, node, depth, budget)
  if (isMap(node)) return mapping(document, node, depth, budget)
  return undefined
}

function sequence(
  document: Document,
  node: YAMLSeq,
  depth: number,
  budget: Budget,
): ManifestValue | undefined {
  const items: ManifestValue[] = []
  for (const item of node.items) {
    const value = convert(document, item, depth + 1, budget)
    if (value === undefined) return undefined
    items.push(value)
  }
  return Object.freeze(items)
}

function mapping(
  document: Document,
  node: YAMLMap,
  depth: number,
  budget: Budget,
): ManifestValue | undefined {
  const fields: [string, ManifestValue][] = []
  for (const pair of node.items) {
    const key = textKey(pair.key)
    const value = convert(document, pair.value, depth + 1, budget)
    if (key === undefined || value === undefined) return undefined
    fields.push([key, value])
  }
  return Object.freeze(Object.fromEntries(fields))
}

function scalar(value: unknown): ManifestValue | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

/** A map key must be a text scalar: a key such as `1` would collide with `"1"` once read. */
export function textKey(key: unknown): string | undefined {
  return isScalar(key) && typeof key.value === 'string' ? key.value : undefined
}
