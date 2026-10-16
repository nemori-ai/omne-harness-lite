// The tagged JSON tree of @omne-harness/json-text as an untrusted value: a closed check and the
// UTF-8 size of its JSON text. Both walk the tree with an explicit stack, so a deep tree cannot
// overflow the call stack.
import type { JsonEntry, JsonValue } from '@omne-harness/json-text'
import { succeed } from '@omne-harness/kernel-basis'
import { isPlainObject, item, member, reject, slot, type Check, type Checked } from './shape.ts'

const JSON_NUMBER = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/u

type Kind = JsonValue['kind']
type Leaf = Extract<JsonValue, { kind: 'null' | 'boolean' | 'string' | 'number' }>

function own(value: object, at: string, key: string): Checked<unknown> {
  const read = slot(value, key)
  const field = member(at, key)
  if (read.kind === 'absent') return reject(field, 'missing')
  if (read.kind === 'accessor') return reject(field, 'accessor')
  return succeed(read.value)
}

function leaf(
  value: object,
  at: string,
  key: string,
  build: (field: unknown) => Leaf | undefined,
): Checked<Leaf> {
  const read = own(value, at, key)
  if ('failure' in read) return read
  const built = build(read.ok)
  return built === undefined ? reject(member(at, key), 'type') : succeed(built)
}

/** One row per node kind: the closed key set, and how a leaf is rebuilt. */
const NODES: Readonly<
  Record<
    Kind,
    Readonly<{ keys: readonly string[]; leaf?: (value: object, at: string) => Checked<Leaf> }>
  >
> = {
  null: { keys: ['kind'], leaf: () => succeed({ kind: 'null' }) },
  boolean: {
    keys: ['kind', 'value'],
    leaf: (value, at) =>
      leaf(value, at, 'value', field =>
        typeof field === 'boolean' ? { kind: 'boolean', value: field } : undefined,
      ),
  },
  string: {
    keys: ['kind', 'value'],
    leaf: (value, at) =>
      leaf(value, at, 'value', field =>
        typeof field === 'string' ? { kind: 'string', value: field } : undefined,
      ),
  },
  number: {
    keys: ['kind', 'lexeme'],
    leaf: (value, at) =>
      leaf(value, at, 'lexeme', field =>
        typeof field === 'string' && JSON_NUMBER.test(field)
          ? { kind: 'number', lexeme: field }
          : undefined,
      ),
  },
  array: { keys: ['kind', 'items'] },
  object: { keys: ['kind', 'entries'] },
}

function isKind(kind: unknown): kind is Kind {
  return typeof kind === 'string' && Object.hasOwn(NODES, kind)
}

function closedNode(value: unknown, at: string): Checked<Readonly<{ node: object; kind: Kind }>> {
  if (!isPlainObject(value)) return reject(at, 'type')
  const kind = own(value, at, 'kind')
  if ('failure' in kind) return kind
  if (!isKind(kind.ok)) return reject(member(at, 'kind'), 'value')
  const keys = NODES[kind.ok].keys
  for (const key of Reflect.ownKeys(value))
    if (typeof key !== 'string' || !keys.includes(key))
      return reject(member(at, String(key)), 'unknown-field')
  return succeed({ node: value, kind: kind.ok })
}

function ownList(value: object, at: string, key: string): Checked<readonly unknown[]> {
  const read = own(value, at, key)
  if ('failure' in read) return read
  if (!Array.isArray(read.ok)) return reject(member(at, key), 'type')
  const items: unknown[] = []
  for (let index = 0; index < read.ok.length; index += 1) {
    const entry = own(read.ok, member(at, key), String(index))
    if ('failure' in entry) return reject(item(member(at, key), index), entry.failure.reason)
    items.push(entry.ok)
  }
  return succeed(items)
}

type Task = Readonly<{ value: unknown; at: string; place: (tree: JsonValue) => void }>
type Walk = { readonly tasks: Task[]; readonly seen: Set<object>; readonly built: object[] }

function walkArray(walk: Walk, node: object, task: Task): Checked<JsonValue> {
  const items = ownList(node, task.at, 'items')
  if ('failure' in items) return items
  const out: JsonValue[] = items.ok.map(() => ({ kind: 'null' }))
  items.ok.forEach((child, index) => {
    const at = item(member(task.at, 'items'), index)
    walk.tasks.push({ value: child, at, place: tree => (out[index] = tree) })
  })
  const tree: JsonValue = { kind: 'array', items: out }
  walk.built.push(out, tree)
  return succeed(tree)
}

function walkObject(walk: Walk, node: object, task: Task): Checked<JsonValue> {
  const entries = ownList(node, task.at, 'entries')
  if ('failure' in entries) return entries
  const out: JsonEntry[] = []
  const keys = new Set<string>()
  for (const [index, entry] of entries.ok.entries()) {
    const at = item(member(task.at, 'entries'), index)
    if (!isPlainObject(entry)) return reject(at, 'type')
    for (const key of Reflect.ownKeys(entry))
      if (key !== 'key' && key !== 'value') return reject(member(at, String(key)), 'unknown-field')
    const name = own(entry, at, 'key')
    if ('failure' in name) return name
    if (typeof name.ok !== 'string') return reject(member(at, 'key'), 'type')
    if (keys.has(name.ok)) return reject(member(at, 'key'), 'duplicate')
    keys.add(name.ok)
    const child = own(entry, at, 'value')
    if ('failure' in child) return child
    const placed: { key: string; value: JsonValue } = { key: name.ok, value: { kind: 'null' } }
    out.push(placed)
    walk.built.push(placed)
    walk.tasks.push({
      value: child.ok,
      at: member(at, 'value'),
      place: tree => (placed.value = tree),
    })
  }
  const tree: JsonValue = { kind: 'object', entries: out }
  walk.built.push(out, tree)
  return succeed(tree)
}

/**
 * A closed json-text tree. A number keeps its source lexeme and must follow the JSON number
 * grammar. Object keys are unique. A container that occurs twice, as in a cycle, is rejected.
 * The copy is frozen.
 */
export const jsonValue: Check<JsonValue> = (value, at) => {
  let root: JsonValue = { kind: 'null' }
  const walk: Walk = {
    tasks: [{ value, at, place: tree => (root = tree) }],
    seen: new Set(),
    built: [],
  }
  for (let task = walk.tasks.pop(); task !== undefined; task = walk.tasks.pop()) {
    const closed = closedNode(task.value, task.at)
    if ('failure' in closed) return closed
    const { node, kind } = closed.ok
    const read = NODES[kind].leaf
    if (read === undefined) {
      // A container that occurs twice would make the walk repeat or never end.
      if (walk.seen.has(node)) return reject(task.at, 'repeated-container')
      walk.seen.add(node)
    }
    const tree =
      read !== undefined
        ? read(node, task.at)
        : kind === 'array'
          ? walkArray(walk, node, task)
          : walkObject(walk, node, task)
    if ('failure' in tree) return tree
    if (read !== undefined) Object.freeze(tree.ok)
    task.place(tree.ok)
  }
  for (const built of walk.built) Object.freeze(built)
  return succeed(root)
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
    if (typeof next === 'string') {
      parts.push(next)
      continue
    }
    switch (next.kind) {
      case 'null':
        parts.push('null')
        break
      case 'boolean':
        parts.push(next.value ? 'true' : 'false')
        break
      case 'string':
        parts.push(JSON.stringify(next.value))
        break
      case 'number':
        parts.push(next.lexeme)
        break
      case 'array':
        parts.push('[')
        pending.push(']')
        next.items.toReversed().forEach((child, index, reversed) => {
          pending.push(child)
          if (index < reversed.length - 1) pending.push(',')
        })
        break
      case 'object':
        parts.push('{')
        pending.push('}')
        next.entries.toReversed().forEach((entry, index, reversed) => {
          pending.push(entry.value, `${JSON.stringify(entry.key)}:`)
          if (index < reversed.length - 1) pending.push(',')
        })
        break
      default: {
        const exhaustive: never = next
        return exhaustive
      }
    }
  }
  return encoder.encode(parts.join('')).byteLength
}
