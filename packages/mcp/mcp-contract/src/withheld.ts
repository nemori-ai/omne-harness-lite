// The `x-mcp-header` rule of SPEC T2 (SEP-2243): the tools a Streamable HTTP transport withholds
// from a page on a modern revision. One implementation for the scripted and the real transports.
import type { JsonValue } from '@omne-harness/json-text'
import { isObject, itemsOf, member, textOf } from './json.ts'
import type { ListingPage } from './transport.ts'
import type { Untrusted } from './values.ts'

const RFC9110_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u
const HEADER_TYPES: readonly string[] = ['string', 'integer', 'boolean']
/** Keywords whose subschemas a `properties` chain does not pass through (SEP-2243). */
const NON_REACHABLE: readonly string[] = [
  'items',
  'prefixItems',
  'contains',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'propertyNames',
  'patternProperties',
  'dependentSchemas',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  '$defs',
  'definitions',
]
const NAMED_SUBSCHEMAS: readonly string[] = [
  'patternProperties',
  'dependentSchemas',
  '$defs',
  'definitions',
]

/** True when a schema breaks an `x-mcp-header` constraint of SEP-2243. */
function headerDeclarationInvalid(
  node: JsonValue | undefined,
  reachable: boolean,
  depth: number,
  seen: Set<string>,
): boolean {
  if (!isObject(node)) return false
  const raw = member(node, 'x-mcp-header')
  if (raw !== undefined) {
    const name = textOf(raw)
    const type = textOf(member(node, 'type'))
    if (!reachable || depth === 0 || name === undefined || !RFC9110_TOKEN.test(name)) return true
    if (type === undefined || !HEADER_TYPES.includes(type)) return true
    const lower = name.toLowerCase()
    if (seen.has(lower)) return true
    seen.add(lower)
  }
  const properties = member(node, 'properties')
  if (isObject(properties))
    for (const entry of properties.entries)
      if (headerDeclarationInvalid(entry.value, reachable, depth + 1, seen)) return true
  for (const keyword of NON_REACHABLE) {
    const sub = member(node, keyword)
    if (sub === undefined) continue
    const branches =
      itemsOf(sub) ??
      (isObject(sub) && NAMED_SUBSCHEMAS.includes(keyword)
        ? sub.entries.map(entry => entry.value)
        : [sub])
    for (const branch of branches)
      if (headerDeclarationInvalid(branch, false, depth + 1, seen)) return true
  }
  return false
}

/**
 * The tools of a page without those whose `x-mcp-header` declaration is invalid (T2), and the
 * withheld ones by name. `withheld` is absent when nothing was withheld.
 */
export function withheldTools(
  tools: readonly JsonValue[],
): Pick<ListingPage, 'tools' | 'withheld'> {
  const kept: JsonValue[] = []
  const withheld: Readonly<{ name: Untrusted<string>; reason: 'header-invalid' }>[] = []
  for (const tool of tools) {
    const schema = isObject(tool) ? member(tool, 'inputSchema') : undefined
    if (headerDeclarationInvalid(schema, true, 0, new Set()))
      withheld.push({
        name: { untrusted: (isObject(tool) ? textOf(member(tool, 'name')) : undefined) ?? '' },
        reason: 'header-invalid',
      })
    else kept.push(tool)
  }
  return withheld.length === 0 ? { tools: kept } : { tools: kept, withheld }
}
