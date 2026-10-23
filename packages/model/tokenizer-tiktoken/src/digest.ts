import { createHash } from 'node:crypto'
import type { TiktokenRanks } from './resources.ts'

/** A string, a non-negative safe integer, or an object of these. Resources have no other value. */
type ResourceValue = string | number | Readonly<{ [key: string]: ResourceValue }>

/** Thrown when a resource holds a value that has no canonical JSON form here. */
export class ResourceShapeError extends Error {
  override readonly name = 'ResourceShapeError'
}

function canonicalText(value: ResourceValue, path: string): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new ResourceShapeError(`${path} is not a non-negative safe integer`)
    return String(value)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ResourceShapeError(`${path} is not a string, an integer or an object`)
  const members = Object.keys(value)
    .toSorted()
    .map(key => {
      const member = value[key]
      if (member === undefined) throw new ResourceShapeError(`${path}.${key} is undefined`)
      return `${JSON.stringify(key)}:${canonicalText(member, `${path}.${key}`)}`
    })
  return `{${members.join(',')}}`
}

/**
 * The canonical JSON text of a resource: no white space, object keys sorted by UTF-16 code units,
 * strings as `JSON.stringify` writes them, integers in plain decimal. For these values the text
 * is the same as RFC 8785 (JCS).
 */
function canonicalJson(value: ResourceValue): string {
  return canonicalText(value, '$')
}

/** The SHA-256 of the UTF-8 bytes of the canonical JSON text, as 64 lower-case hex digits. */
export function resourceDigest(value: ResourceValue): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

/** The digest that `vocabulary.digest` must equal. */
export function ranksDigest(ranks: TiktokenRanks): string {
  return resourceDigest({
    patStr: ranks.patStr,
    specialTokens: ranks.specialTokens,
    bpeRanks: ranks.bpeRanks,
  })
}
