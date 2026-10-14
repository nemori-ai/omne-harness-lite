import type { JsonLimits, JsonRead } from './types.ts'

/** Reads one strict JSON document from UTF-8 bytes within the caller's budgets. */
export function readJsonBytes(bytes: Uint8Array, limits: JsonLimits): JsonRead {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array')
  parseLimits(limits)
  return { kind: 'empty' }
}

/** Reads one strict JSON document from decoded text within the caller's budgets. */
export function readJsonText(text: string, limits: JsonLimits): JsonRead {
  if (typeof text !== 'string') throw new TypeError('text must be a string')
  parseLimits(limits)
  return { kind: 'empty' }
}

function parseLimits(limits: unknown): JsonLimits {
  if (typeof limits !== 'object' || limits === null) throw new TypeError('limits must be an object')
  const limit = (field: keyof JsonLimits): number => {
    const value: unknown = Reflect.get(limits, field)
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
      throw new TypeError(
        `limits.${field} must be an integer from 1 through Number.MAX_SAFE_INTEGER`,
      )
    return value
  }
  return {
    maxBytes: limit('maxBytes'),
    maxDepth: limit('maxDepth'),
    maxItems: limit('maxItems'),
    maxMembers: limit('maxMembers'),
    maxStringLength: limit('maxStringLength'),
    maxNumberLength: limit('maxNumberLength'),
  }
}
