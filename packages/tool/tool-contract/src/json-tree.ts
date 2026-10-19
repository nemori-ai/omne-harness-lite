// The tagged JSON tree of @omne-harness/json-text as an untrusted value: a closed check and the
// UTF-8 size of its JSON text. The check is `judgeJsonValue` of json-text, wrapped as a shape
// check that names the rejected field. The size walk uses an explicit stack, so a deep tree
// cannot overflow the call stack. A checked tree shares no node, so its size is the size of its
// text.
import { judgeJsonValue, type JsonTreePath, type JsonValue } from '@omne-harness/json-text'
import { succeed } from '@omne-harness/operation-result'
import { item, member, reject, type Check } from './shape.ts'

type Leaf = Extract<JsonValue, { kind: 'null' | 'boolean' | 'string' | 'number' }>

/**
 * The field name of a structural tree path below the field `at`: a name is a member, an index is
 * an item, and the empty path is `at` itself. This keeps `entries[1].key` and `items[0].value`
 * style names, which json-text does not know.
 */
function treeField(at: string, path: JsonTreePath): string {
  let field = at
  for (const segment of path)
    field = typeof segment === 'number' ? item(field, segment) : member(field, segment)
  return field
}

/**
 * A closed json-text tree, judged by `judgeJsonValue`: a number keeps its source lexeme and
 * follows the JSON number grammar, object keys are unique, a container may be shared by several
 * parents but not be inside itself (`cycle`), and one judgment visits at most one million
 * nodes, counting a shared subtree each time (`budget`, at the list whose slots would pass the
 * limit). The copy is frozen and shares no node with the input. A read that throws, such as a
 * Proxy trap, is `unreadable` at the field of the tree. The reason names of json-text are the
 * reason names of this package, so a rejection keeps its reason and only gains the field path.
 */
export const jsonValue: Check<JsonValue> = (value, at) => {
  const judgment = judgeJsonValue(value)
  return 'ok' in judgment
    ? succeed(judgment.ok)
    : reject(treeField(at, judgment.path), judgment.rejected)
}

/** A json-text tree whose root is an object. */
export const jsonObject: Check<Extract<JsonValue, { kind: 'object' }>> = (value, at) => {
  const checked = jsonValue(value, at)
  if ('failure' in checked) return checked
  return checked.ok.kind === 'object' ? succeed(checked.ok) : reject(member(at, 'kind'), 'value')
}

const encoder = new TextEncoder()

/** The UTF-8 byte length of the JSON text of a checked tree. Numbers use their lexeme. */
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

/**
 * Returns the opening bracket of a container and pushes the rest of its text in reverse order,
 * so that the parts pop in text order.
 */
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
