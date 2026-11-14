import { judgeJsonValue, type JsonTreePath, type JsonValue } from '@omne-harness/json-text'
import { succeed } from '@omne-harness/operation-result'
import { item, member, reject, type Check } from './shape.ts'

type Leaf = Extract<JsonValue, { kind: 'null' | 'boolean' | 'string' | 'number' }>

function treeField(at: string, path: JsonTreePath): string {
  let field = at
  for (const segment of path)
    field = typeof segment === 'number' ? item(field, segment) : member(field, segment)
  return field
}

export const jsonValue: Check<JsonValue> = (value, at) => {
  const judgment = judgeJsonValue(value)
  return 'ok' in judgment
    ? succeed(judgment.ok)
    : reject(treeField(at, judgment.path), judgment.rejected)
}

export const jsonObject: Check<Extract<JsonValue, { kind: 'object' }>> = (value, at) => {
  const checked = jsonValue(value, at)
  if ('failure' in checked) return checked
  return checked.ok.kind === 'object' ? succeed(checked.ok) : reject(member(at, 'kind'), 'value')
}

const encoder = new TextEncoder()

export function jsonTextBytes(tree: JsonValue): number {
  const parts: string[] = []
  const pending: (JsonValue | string)[] = [tree]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (typeof next === 'string') parts.push(next)
    else if (next.kind === 'array' || next.kind === 'object')
      parts.push(openContainer(next, pending))
    else parts.push(leafText(next))
  }
  return encoder.encode(parts.join('')).byteLength
}

function leafText(node: Leaf): string {
  switch (node.kind) {
    case 'null':
      return 'null'
    case 'boolean':
      return node.value ? 'true' : 'false'
    case 'string':
      return JSON.stringify(node.value)
    case 'number':
      return node.lexeme
    default: {
      const exhaustive: never = node
      return exhaustive
    }
  }
}

function openContainer(node: Exclude<JsonValue, Leaf>, pending: (JsonValue | string)[]): string {
  const close = node.kind === 'array' ? ']' : '}'
  const members: readonly (readonly (JsonValue | string)[])[] =
    node.kind === 'array'
      ? node.items.map(child => [child])
      : node.entries.map(entry => [`${JSON.stringify(entry.key)}:`, entry.value])
  pending.push(close)
  members.toReversed().forEach((parts, index, reversed) => {
    pending.push(...parts.toReversed())
    if (index < reversed.length - 1) pending.push(',')
  })
  return node.kind === 'array' ? '[' : '{'
}
