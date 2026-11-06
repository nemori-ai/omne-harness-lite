// The `x-mcp-header` rule of SPEC T2 (SEP-2243): the tools a Streamable HTTP transport withholds
// from a page on a modern revision. One implementation for the scripted and the real transports.
import type { JsonValue } from '@omne-harness/json-text'
import { isObject, itemsOf, member, textOf, type JsonObject } from './json.ts'
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

/** The `x-mcp-header` declaration on one schema node: the header name and the node's type, as written. */
function declaredHeaderOf(
  node: JsonObject,
): Readonly<{ name: string | undefined; type: string | undefined }> | undefined {
  const raw = member(node, 'x-mcp-header')
  if (raw === undefined) return undefined
  return { name: textOf(raw), type: textOf(member(node, 'type')) }
}

/** A declaration is well formed when its name is an RFC 9110 token and its type is one a header can carry. */
function wellFormed(name: string | undefined, type: string | undefined): boolean {
  return (
    name !== undefined &&
    RFC9110_TOKEN.test(name) &&
    type !== undefined &&
    HEADER_TYPES.includes(type)
  )
}

/**
 * True when the declaration on this node breaks a constraint of SEP-2243: it sits where a
 * `properties` chain cannot reach (the root included), it is not well formed, or its name was
 * declared before in the same schema. A well-formed name is recorded in `seen`.
 */
function declarationInvalid(
  node: JsonObject,
  reachable: boolean,
  depth: number,
  seen: Set<string>,
): boolean {
  const declared = declaredHeaderOf(node)
  if (declared === undefined) return false
  if (!reachable || depth === 0 || !wellFormed(declared.name, declared.type)) return true
  const lower = (declared.name ?? '').toLowerCase()
  if (seen.has(lower)) return true
  seen.add(lower)
  return false
}

/** The subschemas under one keyword that a `properties` chain does not pass through. */
function branchesOf(sub: JsonValue, keyword: string): readonly JsonValue[] {
  const items = itemsOf(sub)
  if (items !== undefined) return items
  if (isObject(sub) && NAMED_SUBSCHEMAS.includes(keyword))
    return sub.entries.map(entry => entry.value)
  return [sub]
}

/** True when a schema breaks an `x-mcp-header` constraint of SEP-2243, on this node or below it. */
function headerDeclarationInvalid(
  node: JsonValue | undefined,
  reachable: boolean,
  depth: number,
  seen: Set<string>,
): boolean {
  if (!isObject(node)) return false
  if (declarationInvalid(node, reachable, depth, seen)) return true
  const properties = member(node, 'properties')
  if (isObject(properties))
    for (const entry of properties.entries)
      if (headerDeclarationInvalid(entry.value, reachable, depth + 1, seen)) return true
  for (const keyword of NON_REACHABLE) {
    const sub = member(node, keyword)
    if (sub === undefined) continue
    for (const branch of branchesOf(sub, keyword))
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
