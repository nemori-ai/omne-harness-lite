import { RFC_8259_NUMBER } from './read.ts'
import type { JsonValue } from './types.ts'

type Pending = Readonly<{ text: string }> | Readonly<{ node: unknown }>

function malformed(what: string): TypeError {
  return new TypeError(`value is not a json-text tree: ${what}`)
}

function field(node: object, key: string): unknown {
  return Reflect.get(node, key)
}

function pushItems(items: unknown, pending: Pending[]): void {
  if (!Array.isArray(items)) throw malformed('items is not a list')
  for (let index = items.length - 1; index >= 0; index -= 1) {
    pending.push({ node: items[index] })
    if (index > 0) pending.push({ text: ',' })
  }
}

function pushEntries(entries: unknown, pending: Pending[]): void {
  if (!Array.isArray(entries)) throw malformed('entries is not a list')
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry: unknown = entries[index]
    if (typeof entry !== 'object' || entry === null) throw malformed('an entry is not an object')
    const key = field(entry, 'key')
    if (typeof key !== 'string') throw malformed('an entry key is not a string')
    pending.push({ node: field(entry, 'value') }, { text: `${JSON.stringify(key)}:` })
    if (index > 0) pending.push({ text: ',' })
  }
}

function booleanText(node: object): string {
  const value = field(node, 'value')
  if (typeof value !== 'boolean') throw malformed('a boolean value is not a boolean')
  return value ? 'true' : 'false'
}

function stringText(node: object): string {
  const value = field(node, 'value')
  if (typeof value !== 'string') throw malformed('a string value is not a string')
  return JSON.stringify(value)
}

function numberText(node: object): string {
  const lexeme = field(node, 'lexeme')
  if (typeof lexeme !== 'string' || !RFC_8259_NUMBER.test(lexeme))
    throw malformed('a number lexeme is not a JSON number')
  return lexeme
}

function leafText(kind: unknown, node: object): string {
  switch (kind) {
    case 'null':
      return 'null'
    case 'boolean':
      return booleanText(node)
    case 'string':
      return stringText(node)
    case 'number':
      return numberText(node)
    default:
      throw malformed('a node has no known kind')
  }
}

function open(node: unknown, pending: Pending[]): string {
  if (typeof node !== 'object' || node === null) throw malformed('a node is not an object')
  const kind = field(node, 'kind')
  switch (kind) {
    case 'array':
      pending.push({ text: ']' })
      pushItems(field(node, 'items'), pending)
      return '['
    case 'object':
      pending.push({ text: '}' })
      pushEntries(field(node, 'entries'), pending)
      return '{'
    default:
      return leafText(kind, node)
  }
}

export function writeJsonText(value: JsonValue): string {
  const parts: string[] = []
  const pending: Pending[] = [{ node: value }]
  for (let next = pending.pop(); next !== undefined; next = pending.pop())
    parts.push('text' in next ? next.text : open(next.node, pending))
  return parts.join('')
}
