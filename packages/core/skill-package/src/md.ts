import { isAlias, isMap, isNode, isScalar, isSeq, parseDocument, visit } from 'yaml'
import type { Document } from 'yaml'
import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import { copyJson, object } from './json.ts'
import { validate } from './schema.ts'
import type { SkillManifest, SkillMdReadResult, UnknownSkillKey } from './types.ts'

const coreKeys = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']
const externalKeys = [
  'tools',
  'user-invocable',
  'user_invocable',
  'disable-model-invocation',
  'model',
  'argument-hint',
  'arguments',
  'disallowed-tools',
  'effort',
  'context',
  'agent',
  'background',
  'hooks',
  'paths',
  'shell',
]
function rejected(): SkillMdReadResult {
  return Object.freeze({ rejected: 'malformed', malformed: 'M16' } as const)
}
function resolve(node: unknown, doc: Document): unknown {
  return isAlias(node) ? node.resolve(doc) : node
}
/** The exact adopted parser's public schema supplies tag resolution, not a handwritten YAML subset. */
function tagOf(node: unknown, doc: Document): string {
  if (node === null || node === undefined) return 'tag:yaml.org,2002:null'
  if (!isNode(node)) throw new Error('unexpected YAML key node')
  if (node.tag !== undefined && node.tag !== '!') return node.tag
  if (isMap(node)) return 'tag:yaml.org,2002:map'
  if (isSeq(node)) return 'tag:yaml.org,2002:seq'
  if (isScalar(node)) {
    if (node.tag === '!' || node.type !== 'PLAIN') return 'tag:yaml.org,2002:str'
    const source = node.source ?? ''
    return (
      doc.schema.tags.find(tag => tag.default === true && tag.test?.test(source))?.tag ??
      'tag:yaml.org,2002:str'
    )
  }
  throw new Error('unresolved YAML key alias')
}
/** Preserve finite float key identity beyond binary Number rounding. Source is already parsed. */
function canonicalFloat(source: string): string {
  const lower = source.toLowerCase()
  if (lower === '.nan') return '.nan'
  if (['.inf', '+.inf'].includes(lower)) return '.inf'
  if (lower === '-.inf') return '-.inf'
  const negative = source.startsWith('-')
  const [mantissa = '', exponent = '0'] = source.replace(/^[-+]/u, '').split(/[eE]/u)
  const fraction = mantissa.split('.')[1]?.length ?? 0
  const digits = mantissa.replace('.', '').replace(/^0+/u, '')
  if (digits.length === 0) return '0@0'
  const significant = digits.replace(/0+$/u, '')
  return `${negative ? '-' : ''}${significant}@${BigInt(exponent) - BigInt(fraction) + BigInt(digits.length - significant.length)}`
}
function scalarIdentity(node: unknown, doc: Document): unknown {
  if (!isScalar(node)) return null
  const tag = tagOf(node, doc)
  if (tag === 'tag:yaml.org,2002:float') return canonicalFloat(node.source ?? String(node.value))
  return node.value
}
function forkComparisons(compared: Map<object, Set<object>>): Map<object, Set<object>> {
  return new Map([...compared].map(([key, values]) => [key, new Set(values)]))
}
type Equality = boolean | ReadonlySet<string>
function conjunction(results: readonly Equality[]): Equality {
  if (results.includes(false)) return false
  const tags = new Set(results.flatMap(result => (typeof result === 'boolean' ? [] : [...result])))
  return tags.size === 0 ? true : tags
}
/** Find a one-to-one pairing; a single uncertain edge cannot conceal a definite full matching. */
function matching(
  edges: readonly (readonly Equality[])[],
  exact: boolean,
): readonly number[] | undefined {
  const assigned: number[] = []
  function assign(left: number, seen: Set<number>): boolean {
    const row = edges[left]
    if (row === undefined) return false
    for (const [right, edge] of row.entries()) {
      if ((exact ? edge !== true : edge === false) || seen.has(right)) continue
      seen.add(right)
      const previous = assigned[right]
      if (previous === undefined || assign(previous, seen)) {
        assigned[right] = left
        return true
      }
    }
    return false
  }
  for (const left of edges.keys()) if (!assign(left, new Set())) return undefined
  return assigned
}
/** Core canonical equality; unresolved scalar tags stay unknown. Cycles use coinduction. */
function keyEqual(
  left: unknown,
  right: unknown,
  doc: Document,
  compared: Map<object, Set<object>> = new Map(),
): Equality {
  const a = resolve(left, doc)
  const b = resolve(right, doc)
  if (a === b) return true
  const tag = tagOf(a, doc)
  if (tag !== tagOf(b, doc)) return false
  if (isScalar(a) && isScalar(b)) {
    if (!doc.schema.tags.some(known => known.tag === tag)) return new Set([tag])
    const first = scalarIdentity(a, doc)
    const second = scalarIdentity(b, doc)
    return Object.is(first, second) || first === second
  }
  if (a === null && isScalar(b) && b.value === null) return true
  if (b === null && isScalar(a) && a.value === null) return true
  if (!isNode(a) || !isNode(b)) return false
  if (isMap(a) !== isMap(b) || isSeq(a) !== isSeq(b)) return false
  const seen = compared.get(a)
  if (seen?.has(b)) return true
  if (seen === undefined) compared.set(a, new Set([b]))
  else seen.add(b)
  if (isSeq(a) && isSeq(b)) {
    if (a.items.length !== b.items.length) return false
    return conjunction(
      a.items.map((item, index) => keyEqual(item, b.items[index], doc, forkComparisons(compared))),
    )
  }
  if (isMap(a) && isMap(b)) {
    if (a.items.length !== b.items.length) return false
    const edges = a.items.map(pair =>
      b.items.map(other =>
        conjunction([
          keyEqual(pair.key, other.key, doc, forkComparisons(compared)),
          keyEqual(pair.value, other.value, doc, forkComparisons(compared)),
        ]),
      ),
    )
    if (matching(edges, true) !== undefined) return true
    const possible = matching(edges, false)
    if (possible === undefined) return false
    return conjunction(
      possible.map((left, right) => {
        const edge = edges[left]?.[right]
        if (edge === undefined) throw new Error('inconsistent YAML mapping matching')
        return edge
      }),
    )
  }
  return false
}
function keyValidity(doc: Document): {
  readonly invalid: boolean
  readonly tags: ReadonlySet<string>
} {
  let invalid = false
  const tags = new Set<string>()
  visit(doc, {
    Alias(_key, node) {
      if (node.resolve(doc) === undefined) invalid = true
    },
    Map(_key, node) {
      for (const [index, pair] of node.items.entries())
        for (const previous of node.items.slice(0, index)) {
          const equality = keyEqual(pair.key, previous.key, doc)
          if (equality === true) invalid = true
          else if (equality !== false) for (const tag of equality) tags.add(tag)
        }
    },
  })
  return { invalid, tags }
}
function stringValue(node: unknown, doc: Document): string | undefined {
  const resolved = resolve(node, doc)
  return isScalar(resolved) &&
    typeof resolved.value === 'string' &&
    (resolved.tag === undefined || resolved.tag === '!' || resolved.tag === 'tag:yaml.org,2002:str')
    ? resolved.value
    : undefined
}
function manifestOf(value: JsonValue): value is JsonObject & SkillManifest {
  return object(value) && validate('SkillManifest', value).valid
}
function closingLine(
  text: string,
): { readonly frontmatter: string; readonly body: string } | undefined {
  const openingEnd = text.indexOf('\n')
  if (openingEnd < 0 || text.slice(0, openingEnd).replace(/\r$/u, '') !== '---') return undefined
  let start = openingEnd + 1
  const frontmatterStart = start
  while (start <= text.length) {
    const newline = text.indexOf('\n', start)
    const end = newline < 0 ? text.length : newline
    const line = text.slice(start, end)
    const content = newline < 0 ? line : line.replace(/\r$/u, '')
    if (content === '---')
      return {
        frontmatter: text.slice(frontmatterStart, start),
        body: text.slice(newline < 0 ? end : newline + 1),
      }
    if (newline < 0) return undefined
    start = newline + 1
  }
  return undefined
}
export function readSkillMd(text: string): SkillMdReadResult {
  if (typeof text !== 'string') return rejected()
  const parts = closingLine(text)
  if (parts === undefined) return rejected()
  const doc = parseDocument(parts.frontmatter, {
    version: '1.2',
    schema: 'core',
    uniqueKeys: false,
    intAsBigInt: true,
  })
  if (doc.errors.length !== 0 || !isMap(doc.contents)) return rejected()
  const keys = keyValidity(doc)
  if (keys.invalid) return rejected()
  const manifest: Record<string, JsonValue> = {}
  const unknownKeys: UnknownSkillKey[] = []
  for (const pair of doc.contents.items) {
    const key = stringValue(pair.key, doc)
    if (key === undefined || !coreKeys.includes(key)) {
      const range = isNode(pair.key) ? pair.key.range : undefined
      const keySource =
        range === undefined || range === null ? '' : parts.frontmatter.slice(range[0], range[1])
      unknownKeys.push(
        Object.freeze({
          keySource,
          ...(key === undefined ? {} : { key }),
          category:
            key !== undefined && externalKeys.includes(key) ? 'external_attribute' : 'unknown',
        }),
      )
      continue
    }
    let value: JsonValue
    if (key === 'metadata') {
      const metadata = resolve(pair.value, doc)
      if (
        !isMap(metadata) ||
        (metadata.tag !== undefined &&
          metadata.tag !== '!' &&
          metadata.tag !== 'tag:yaml.org,2002:map')
      )
        return rejected()
      const values: Record<string, string> = {}
      for (const entry of metadata.items) {
        const metadataKey = stringValue(entry.key, doc)
        const metadataValue = stringValue(entry.value, doc)
        if (metadataKey === undefined || metadataValue === undefined) return rejected()
        Object.defineProperty(values, metadataKey, { value: metadataValue, enumerable: true })
      }
      value = Object.freeze(values)
    } else {
      const scalar = stringValue(pair.value, doc)
      if (scalar === undefined) return rejected()
      value = scalar
    }
    Object.defineProperty(manifest, key, { value, enumerable: true })
  }
  const copied = copyJson(manifest)
  if (copied === undefined || !manifestOf(copied)) return rejected()
  if (keys.tags.size !== 0)
    return Object.freeze({
      undetermined: Object.freeze({
        reason: 'yaml_key_tag',
        tags: Object.freeze([...keys.tags].sort()),
      }),
    })
  return Object.freeze({
    ok: Object.freeze({
      manifest: copied,
      body: parts.body,
      unknownKeys: Object.freeze(unknownKeys),
    }),
  })
}
