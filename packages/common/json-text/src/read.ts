import type { JsonLimits, JsonRead } from './types.ts'

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Reads one strict JSON document from UTF-8 bytes within the caller's budgets. */
export function readJsonBytes(bytes: Uint8Array, limits: JsonLimits): JsonRead {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array')
  const parsed = parseLimits(limits)
  let text: string
  try {
    text = utf8.decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) return { kind: 'utf8' }
    throw error
  }
  return readDecoded(text, bytes.length, parsed)
}

/** Reads one strict JSON document from decoded text within the caller's budgets. */
export function readJsonText(text: string, limits: JsonLimits): JsonRead {
  if (typeof text !== 'string') throw new TypeError('text must be a string')
  const parsed = parseLimits(limits)
  if (!text.isWellFormed()) throw new TypeError('text must not contain a lone surrogate')
  return readDecoded(text, utf8Length(text), parsed)
}

function readDecoded(text: string, byteLength: number, limits: JsonLimits): JsonRead {
  if (text.startsWith('\uFEFF')) return { kind: 'bom' }
  if (byteLength > limits.maxBytes) return { kind: 'budget', name: 'bytes' }
  return { kind: 'empty' }
}

function utf8Length(text: string): number {
  let length = 0
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    // The text is well formed, so each surrogate half is one half of a 4-byte code point.
    length += unit < 0x80 ? 1 : unit < 0x800 || (unit >= 0xd800 && unit <= 0xdfff) ? 2 : 3
  }
  return length
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
