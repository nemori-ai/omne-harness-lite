import type { JsonValue } from '@omne-harness/json-text'

/** A body written as people read JSON: two spaces per level, every number as it was written. */
export function plainJson(value: JsonValue, depth = 0): string {
  const inner = '  '.repeat(depth + 1)
  const outer = '  '.repeat(depth)
  switch (value.kind) {
    case 'null':
      return 'null'
    case 'boolean':
      return value.value ? 'true' : 'false'
    case 'number':
      return value.lexeme
    case 'string':
      return JSON.stringify(value.value)
    case 'array':
      if (value.items.length === 0) return '[]'
      return `[\n${value.items.map(item => inner + plainJson(item, depth + 1)).join(',\n')}\n${outer}]`
    case 'object':
      if (value.entries.length === 0) return '{}'
      return `{\n${value.entries
        .map(
          ({ key, value: member }) =>
            `${inner}${JSON.stringify(key)}: ${plainJson(member, depth + 1)}`,
        )
        .join(',\n')}\n${outer}}`
  }
}
