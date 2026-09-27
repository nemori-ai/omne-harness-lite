import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { isAbsolute, normalize, sep } from 'node:path'
import { OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS } from '@omne-harness-lite/identity-values'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type CapabilityId,
} from '@omne-harness-lite/content-blocks'
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import type { WorkspaceKey } from './types.ts'

const whitespace = new Set<number>(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS)
export function isCapabilityName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('/') &&
    ![...value].some(character => whitespace.has(character.codePointAt(0) ?? -1))
  )
}
export function isAssetCategory(value: unknown): value is CapabilityId['category'] {
  return (
    typeof value === 'string' &&
    contentSchema.$defs.CapabilityId.properties.category.enum.some(category => category === value)
  )
}
export function capabilityCanonicalString(id: CapabilityId): string {
  if (!isAssetCategory(id.category) || !isCapabilityName(id.name))
    throw new TypeError('invalid capability identifier')
  return `${id.category}/${id.name}`
}
export function parseCapabilityCanonicalString(
  value: string,
):
  | { readonly ok: CapabilityId }
  | { readonly rejected: 'category_unknown' | 'name_invalid' | 'malformed' } {
  const separator = value.indexOf('/')
  if (separator < 0) return Object.freeze({ rejected: 'malformed' } as const)
  const category = value.slice(0, separator)
  const name = value.slice(separator + 1)
  if (!isAssetCategory(category)) return Object.freeze({ rejected: 'category_unknown' } as const)
  if (!isCapabilityName(name)) return Object.freeze({ rejected: 'name_invalid' } as const)
  return Object.freeze({ ok: Object.freeze({ category, name }) })
}
export function normalizeWorkspaceDirectory(directory: string): string {
  if (!isAbsolute(directory)) throw new TypeError('workspace directory must be absolute')
  const normalized = normalize(directory)
  return normalized.length > 1 && normalized.endsWith(sep) ? normalized.slice(0, -1) : normalized
}
export function carrierRecordId(workspace: WorkspaceKey, capability: CapabilityId): string {
  if (normalizeWorkspaceDirectory(workspace.directory) !== workspace.directory)
    throw new TypeError('workspace directory must be canonical')
  capabilityCanonicalString(capability)
  const tuple = [
    workspace.tenant.organization,
    workspace.tenant.account,
    workspace.directory,
    capability.category,
    capability.name,
  ]
  return `wsc1.${Buffer.from(writeJsonLossless(tuple), 'utf8').toString('base64url')}`
}
export function contentFingerprint(content: unknown): string {
  const parsed = readJsonStrict(writeJsonLossless(content))
  if ('failed' in parsed) throw new Error('lossless writer produced invalid JSON')
  return createHash('sha256').update(canonicalJson(parsed.ok), 'utf8').digest('hex')
}
function codePointCompare(left: string, right: string): number {
  const a = [...left].map(character => character.codePointAt(0) ?? -1)
  const b = [...right].map(character => character.codePointAt(0) ?? -1)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const first = a[index]
    const second = b[index]
    if (first !== undefined && second !== undefined && first !== second) return first - second
  }
  return a.length - b.length
}
/** Build text directly: JS objects reorder integer keys, even after a sorted insertion. */
function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object' && !LosslessNumber.is(value)) {
    return `{${Object.entries(value)
      .sort(([a], [b]) => codePointCompare(a, b))
      .map(([key, item]) => `${writeJsonLossless(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return writeJsonLossless(value)
}
