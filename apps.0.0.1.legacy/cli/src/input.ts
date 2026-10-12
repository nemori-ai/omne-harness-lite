import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { InputFailure } from './diagnostic.ts'

export async function readInputFile(
  path: string,
  limit: number,
  secret: boolean,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new InputFailure('input-cancelled')
  let file
  try {
    file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | constants.O_NOCTTY,
    )
  } catch {
    throw new InputFailure(secret ? 'secret-source' : 'input-unavailable')
  }
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new InputFailure(secret ? 'secret-source' : 'input-unavailable')
    if (secret && (stat.uid !== process.geteuid!() || (stat.mode & 0o077) !== 0))
      throw new InputFailure('secret-permissions')
    if (stat.size > limit) throw new InputFailure('input-too-large')
    const chunks: Buffer[] = []
    let total = 0
    for (;;) {
      if (signal.aborted) throw new InputFailure('input-cancelled')
      const buffer = Buffer.alloc(Math.min(8192, limit + 1 - total))
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > limit) throw new InputFailure('input-too-large')
      chunks.push(buffer.subarray(0, bytesRead))
    }
    if (signal.aborted) throw new InputFailure('input-cancelled')
    const bytes = Buffer.concat(chunks)
    if (!secret && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
      throw new InputFailure('invalid-encoding')
    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch {
      throw new InputFailure('invalid-encoding')
    }
  } catch (error) {
    if (error instanceof InputFailure) throw error
    throw new InputFailure('input-unavailable')
  } finally {
    // A rejected close is a defect, not a normal invalid-input/cancelled result.
    try {
      await file.close()
    } catch {
      throw new Error('input-restore-failed')
    }
  }
}

/** CQ1 JSON syntax: duplicate keys and non-integer numeric spellings are rejected before rounding. */
export function payloadJSON(text: string): Record<string, unknown> {
  let at = 0
  const fail = (): never => {
    throw new InputFailure('invalid-json')
  }
  const space = () => {
    while (/^[\x20\x09\x0a\x0d]$/.test(text[at] ?? '')) at++
  }
  const string = (): string => {
    const start = at++
    while (at < text.length) {
      const char = text[at++]
      if (char === '\\') {
        at++
        continue
      }
      if (char === '"') {
        try {
          return JSON.parse(text.slice(start, at)) as string
        } catch {
          return fail()
        }
      }
    }
    return fail()
  }
  const object = (depth: number): Record<string, unknown> => {
    at++
    space()
    const result: Record<string, unknown> = Object.create(null),
      keys = new Set<string>()
    if (text[at] === '}') {
      at++
      return result
    }
    for (;;) {
      space()
      if (text[at] !== '"') return fail()
      const key = string()
      if (keys.has(key)) return fail()
      keys.add(key)
      space()
      if (text[at++] !== ':') return fail()
      result[key] = value(depth + 1)
      space()
      const end = text[at++]
      if (end === '}') return result
      if (end !== ',') return fail()
    }
  }
  const array = (depth: number): unknown[] => {
    at++
    space()
    const result: unknown[] = []
    if (text[at] === ']') {
      at++
      return result
    }
    for (;;) {
      result.push(value(depth + 1))
      space()
      const end = text[at++]
      if (end === ']') return result
      if (end !== ',') return fail()
    }
  }
  const value = (depth: number): unknown => {
    if (depth > 64) return fail()
    space()
    if (text[at] === '"') return string()
    if (text[at] === '{') return object(depth)
    if (text[at] === '[') return array(depth)
    for (const [word, result] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (text.startsWith(word, at)) {
        at += word.length
        return result
      }
    }
    const literal = /^-?(?:0|[1-9][0-9]*)/.exec(text.slice(at))?.[0]
    if (literal === undefined) return fail()
    at += literal.length
    const number = Number(literal)
    if (!Number.isSafeInteger(number)) return fail()
    return number
  }
  const result = value(0)
  space()
  if (at !== text.length || result === null || typeof result !== 'object' || Array.isArray(result))
    return fail()
  return result as Record<string, unknown>
}
