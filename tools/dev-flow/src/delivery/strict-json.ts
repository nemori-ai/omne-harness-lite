import { InputError } from './protocol.ts'

/** Rejects duplicate keys before shape validation; escaped spellings name the same key. */
export function strictJson(source: string): unknown {
  if (Buffer.byteLength(source, 'utf8') > 1024 * 1024) throw new InputError('json-too-large')
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new InputError('json-invalid')
  }
  const tokens =
    source.match(/"(?:[^"\\]|\\.)*"|[{}[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ??
    []
  let position = 0
  function consume(expected: string): void {
    if (tokens[position++] !== expected) throw new InputError('json-invalid')
  }
  function value(depth: number): void {
    if (depth > 128) throw new InputError('json-too-deep')
    const token = tokens[position++]
    if (token === '{') {
      const names = new Set<string>()
      if (tokens[position] !== '}') {
        for (;;) {
          const key = tokens[position++]
          if (key === undefined || !key.startsWith('"')) throw new InputError('json-invalid')
          const name: unknown = JSON.parse(key)
          if (typeof name !== 'string') throw new InputError('json-invalid')
          if (names.has(name)) throw new InputError('json-duplicate-key')
          names.add(name)
          consume(':')
          value(depth + 1)
          if (tokens[position] !== ',') break
          position++
        }
      }
      consume('}')
    } else if (token === '[') {
      if (tokens[position] !== ']') {
        for (;;) {
          value(depth + 1)
          if (tokens[position] !== ',') break
          position++
        }
      }
      consume(']')
    } else if (token === undefined || ['}', ']', ',', ':'].includes(token)) {
      throw new InputError('json-invalid')
    }
  }
  value(0)
  if (position !== tokens.length) throw new InputError('json-invalid')
  return parsed
}
