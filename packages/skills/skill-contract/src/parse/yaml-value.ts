// Turns the YAML node tree of a frontmatter into plain immutable values, without changing any
// type. Every map key must be text, every scalar must be null, a boolean, a finite number or text,
// and the whole tree, aliases expanded, stays inside a node budget.
import { isAlias, isMap, isScalar, isSeq, type Document, type YAMLMap, type YAMLSeq } from 'yaml'
import type { ManifestValue } from '../values.ts'

/**
 * The frontmatter budget, the same as the declaration budget: at most 16 nested mappings and
 * sequences, the root mapping counted as the first, and at most 4096 nodes once aliases expand.
 */
const MAX_DEPTH = 16
const MAX_NODES = 4096

type Budget = { nodes: number }

/** Plain values, or `undefined` when the tree breaks a rule above. */
export function plainValue(document: Document, node: unknown): ManifestValue | undefined {
  return convert(document, node, 1, { nodes: 0 })
}

/** Alias expansion, the budget, the depth, and the dispatch to the four kinds of node. */
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
