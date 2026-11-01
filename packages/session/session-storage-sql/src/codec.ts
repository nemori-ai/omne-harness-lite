// The JSON form of Session values that cross the SQL boundary. legal-identity mints tenants and
// workspaces, so they travel as marked text and are parsed back by their own codecs. Every other
// value is already plain data. The Worker modules and the port adapter share this file.
import { createHash } from 'node:crypto'
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'

const TENANT = '$tenant'
const WORKSPACE = '$workspace'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Strict JSON of a Session value. `undefined` members are left out; a minted identity becomes text. */
export function encodeValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('a non-finite number is not JSON')
    return value
  }
  if (Array.isArray(value)) return value.map(item => encodeValue(item))
  if (!isRecord(value)) throw new TypeError(`a ${typeof value} is not JSON data`)
  if (value['name'] === 'TenantId') {
    const text = tenantCodec.encode(value as never)
    if (!text.ok) throw new TypeError('a tenant that legal-identity did not mint')
    return { [TENANT]: text.value }
  }
  if (value['name'] === 'WorkspaceId') {
    const text = workspaceCodec.encode(value as never)
    if (!text.ok) throw new TypeError('a workspace that legal-identity did not mint')
    return { [WORKSPACE]: text.value }
  }
  const out: Record<string, JsonValue> = {}
  for (const [key, member] of Object.entries(value)) {
    if (key === TENANT || key === WORKSPACE)
      throw new TypeError(`the member name ${key} is reserved`)
    if (member !== undefined) out[key] = encodeValue(member)
  }
  return out
}

/** The inverse of `encodeValue`: the marked texts are parsed back into minted identities. */
export function decodeValue(value: JsonValue): unknown {
  if (Array.isArray(value)) return value.map(item => decodeValue(item))
  if (!isRecord(value)) return value
  const keys = Object.keys(value)
  if (keys.length === 1 && keys[0] === TENANT) {
    const parsed = tenantCodec.parse(String(value[TENANT]))
    if (!parsed.ok) throw new TypeError('the tenant text does not parse')
    return parsed.value
  }
  if (keys.length === 1 && keys[0] === WORKSPACE) {
    const parsed = workspaceCodec.parse(String(value[WORKSPACE]))
    if (!parsed.ok) throw new TypeError('the workspace text does not parse')
    return parsed.value
  }
  const out: Record<string, unknown> = {}
  for (const [key, member] of Object.entries(value)) out[key] = decodeValue(member as JsonValue)
  return out
}

/** Keys in code-unit order, so equal values give equal text. */
export function canonicalText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => canonicalText(item)).join(',')}]`
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalText(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** The plain value of a json-text tree, as the Session entries store their payloads. */
export function plainOf(tree: unknown): unknown {
  if (!isRecord(tree)) return null
  switch (tree['kind']) {
    case 'boolean':
    case 'string':
      return tree['value']
    case 'number':
      return Number(tree['lexeme'])
    case 'array':
      return Array.isArray(tree['items']) ? tree['items'].map(item => plainOf(item)) : []
    case 'object': {
      const out: Record<string, unknown> = {}
      if (Array.isArray(tree['entries']))
        for (const entry of tree['entries'] as { key: string; value: unknown }[])
          out[entry.key] = plainOf(entry.value)
      return out
    }
    default:
      return null
  }
}
