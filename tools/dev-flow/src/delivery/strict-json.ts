import { InputError } from './protocol.ts'

/**
 * Rejects duplicate keys before shape validation; escaped spellings name the same key.
 * `path` labels every error, for example `input.json: json-invalid`.
 */
export function strictJson(source: string, path: string): unknown {
  function fail(code: string): never {
    throw new InputError(`${path}: ${code}`)
  }
  if (Buffer.byteLength(source, 'utf8') > 1024 * 1024) fail('json-too-large')
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    fail('json-invalid')
  }
  const tokens =
    source.match(/"(?:[^"\\]|\\.)*"|[{}[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ??
    []
  let position = 0
  function consume(expected: string): void {
    if (tokens[position++] !== expected) fail('json-invalid')
  }
  function value(depth: number): void {
    if (depth > 128) fail('json-too-deep')
    const token = tokens[position++]
    if (token === '{') {
      const names = new Set<string>()
      if (tokens[position] !== '}') {
        for (;;) {
          const key = tokens[position++]
          if (key === undefined || !key.startsWith('"')) fail('json-invalid')
          const name: unknown = JSON.parse(key)
          if (typeof name !== 'string') fail('json-invalid')
          if (names.has(name)) fail('json-duplicate-key')
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
      fail('json-invalid')
    }
  }
  value(0)
  if (position !== tokens.length) fail('json-invalid')
  return parsed
}
