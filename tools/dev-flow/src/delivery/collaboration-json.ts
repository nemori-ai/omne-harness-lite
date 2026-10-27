import { InputError } from './protocol.ts'

/** Rejects duplicate keys before shape validation; escaped spellings name the same key. */
export function collaborationJson(source: string): unknown {
  if (Buffer.byteLength(source, 'utf8') > 1024 * 1024)
    throw new InputError('collaboration-json-too-large')
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new InputError('collaboration-json-invalid')
  }
  const tokens =
    source.match(/"(?:[^"\\]|\\.)*"|[{}[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ??
    []
  let position = 0
  function consume(expected: string): void {
    if (tokens[position++] !== expected) throw new InputError('collaboration-json-invalid')
  }
  function value(depth: number): void {
    if (depth > 128) throw new InputError('collaboration-json-too-deep')
    const token = tokens[position++]
    if (token === '{') {
      const names = new Set<string>()
      if (tokens[position] !== '}') {
        for (;;) {
          const key = tokens[position++]
          if (key === undefined || !key.startsWith('"'))
            throw new InputError('collaboration-json-invalid')
          const name: unknown = JSON.parse(key)
          if (typeof name !== 'string') throw new InputError('collaboration-json-invalid')
          if (names.has(name)) throw new InputError('collaboration-json-duplicate-key')
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
      throw new InputError('collaboration-json-invalid')
    }
  }
  value(0)
  if (position !== tokens.length) throw new InputError('collaboration-json-invalid')
  return parsed
}
