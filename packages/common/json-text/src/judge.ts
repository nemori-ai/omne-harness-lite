import { RFC_8259_NUMBER } from './read.ts'
import type { JsonEntry, JsonValue, JsonValueJudgment } from './types.ts'

type Rejected = Extract<JsonValueJudgment, { readonly rejected: string }>
type Reason = Rejected['rejected']
type Kind = JsonValue['kind']

const DEFAULT_MAX_VISITS = 1_000_000

/**
 * The fields of each node kind. A node with any other own key is rejected. A node that
 * `readJsonText` produced has exactly these keys.
 */
const NODE_KEYS: Readonly<Record<Kind, readonly string[]>> = {
  null: ['kind'],
  boolean: ['kind', 'value'],
  string: ['kind', 'value'],
  number: ['kind', 'lexeme'],
  array: ['kind', 'items'],
  object: ['kind', 'entries'],
}

/**
 * The way from the root to a node, as a chain of links from the node back to the root. A walk
 * extends it for every child and builds a `JsonTreePath` only for a rejection, so a deep tree
 * does not copy a path per node.
 */
type Trail = Readonly<{ parent: Trail; segment: string | number }> | null

function step(parent: Trail, segment: string | number): Trail {
  return { parent, segment }
}

function pathOf(trail: Trail, ...tail: (string | number)[]): readonly (string | number)[] {
  const path: (string | number)[] = []
  for (let link = trail; link !== null; link = link.parent) path.push(link.segment)
  return [...path.reverse(), ...tail]
}

function reject(reason: Reason, trail: Trail, ...tail: (string | number)[]): Rejected {
  return { rejected: reason, path: pathOf(trail, ...tail) }
}

/**
 * Raised when the input itself throws while it is read, for example from a Proxy trap. Each
 * function below that touches the input converts such an exception into this one, and nothing
 * else does. `judgeJsonValue` turns this one into `unreadable`; any other exception comes from
 * the walk, is a defect of the walk, and propagates.
 */
class UnreadableInput extends Error {}

function descriptorOf(object: object, key: string): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(object, key)
  } catch {
    throw new UnreadableInput()
  }
}

function ownKeysOf(object: object): readonly (string | symbol)[] {
  try {
    return Reflect.ownKeys(object)
  } catch {
    throw new UnreadableInput()
  }
}

function prototypeOf(object: object): object | null {
  try {
    return Object.getPrototypeOf(object)
  } catch {
    throw new UnreadableInput()
  }
}

function isList(value: unknown): value is readonly unknown[] {
  try {
    return Array.isArray(value)
  } catch {
    throw new UnreadableInput()
  }
}

/** The length of a list. A Proxy can claim any value, and one that is no length is unreadable. */
function lengthOf(list: readonly unknown[]): number {
  let length: unknown
  try {
    length = list.length
  } catch {
    throw new UnreadableInput()
  }
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0)
    throw new UnreadableInput()
  return length
}

type Field = Readonly<{ found: unknown }>

/** Reads one own data property. A getter is never called. */
function ownField(object: object, key: string, trail: Trail): Field | Rejected {
  const descriptor = descriptorOf(object, key)
  if (descriptor === undefined) return reject('missing', trail, key)
  if (!('value' in descriptor)) return reject('accessor', trail, key)
  return { found: descriptor.value }
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== 'object' || value === null || isList(value)) return false
  const prototype = prototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isKind(kind: unknown): kind is Kind {
  return typeof kind === 'string' && Object.hasOwn(NODE_KEYS, kind)
}

/**
 * The elements of a list field, each read as an own data property. Every element is a visit to
 * come, so the length is checked against the rest of the visit budget before any element is
 * read.
 */
function ownList(
  walk: Walk,
  node: object,
  key: 'items' | 'entries',
  trail: Trail,
): Readonly<{ list: readonly unknown[]; trail: Trail }> | Rejected {
  const field = ownField(node, key, trail)
  if ('rejected' in field) return field
  const list = field.found
  if (!isList(list)) return reject('type', trail, key)
  const listTrail = step(trail, key)
  const length = lengthOf(list)
  if (length > walk.maxVisits - walk.visits - walk.queued) return reject('budget', listTrail)
  const elements: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    const element = ownField(list, String(index), listTrail)
    if ('rejected' in element) return reject(element.rejected, listTrail, index)
    elements.push(element.found)
  }
  return { list: elements, trail: listTrail }
}

type Visit = Readonly<{
  action: 'visit'
  value: unknown
  trail: Trail
  /** Puts the copy of this node where its parent expects it. */
  place: (tree: JsonValue) => void
}>
/** Runs after every descendant of a container: the container is then no longer an ancestor. */
type Leave = Readonly<{ action: 'leave'; node: object }>
type Walk = {
  readonly pending: (Visit | Leave)[]
  /** The containers on the path from the root to the node being visited. */
  readonly ancestors: Set<object>
  /** The containers, lists and entries of the copy, frozen once the walk has accepted all. */
  readonly built: object[]
  readonly maxVisits: number
  visits: number
  /** The visits that the walk has queued and not yet made. */
  queued: number
}

function leaf(
  node: object,
  kind: 'boolean' | 'string' | 'number',
  trail: Trail,
): JsonValue | Rejected {
  const key = kind === 'number' ? 'lexeme' : 'value'
  const field = ownField(node, key, trail)
  if ('rejected' in field) return field
  const value = field.found
  switch (kind) {
    case 'boolean':
      return typeof value === 'boolean'
        ? Object.freeze({ kind, value })
        : reject('type', trail, key)
    case 'string':
      return typeof value === 'string' ? Object.freeze({ kind, value }) : reject('type', trail, key)
    case 'number':
      return typeof value === 'string' && RFC_8259_NUMBER.test(value)
        ? Object.freeze({ kind, lexeme: value })
        : reject('type', trail, key)
  }
}

function visitArray(walk: Walk, node: object, visit: Visit): JsonValue | Rejected {
  if (walk.ancestors.has(node)) return reject('cycle', visit.trail)
  const read = ownList(walk, node, 'items', visit.trail)
  if ('rejected' in read) return read
  const items: JsonValue[] = read.list.map(() => ({ kind: 'null' }))
  walk.queued += items.length
  walk.ancestors.add(node)
  walk.pending.push({ action: 'leave', node })
  for (let index = read.list.length - 1; index >= 0; index -= 1) {
    walk.pending.push({
      action: 'visit',
      value: read.list[index],
      trail: step(read.trail, index),
      place: tree => (items[index] = tree),
    })
  }
  const tree: JsonValue = { kind: 'array', items }
  walk.built.push(items, tree)
  return tree
}

/** One object entry: a plain object with the fields `key` and `value` only. */
function readEntry(
  entry: unknown,
  trail: Trail,
): Readonly<{ key: string; value: unknown }> | Rejected {
  if (!isPlainObject(entry)) return reject('type', trail)
  for (const key of ownKeysOf(entry))
    if (key !== 'key' && key !== 'value') return reject('unknown-field', trail, String(key))
  const key = ownField(entry, 'key', trail)
  if ('rejected' in key) return key
  if (typeof key.found !== 'string') return reject('type', trail, 'key')
  const value = ownField(entry, 'value', trail)
  if ('rejected' in value) return value
  return { key: key.found, value: value.found }
}

function visitObject(walk: Walk, node: object, visit: Visit): JsonValue | Rejected {
  if (walk.ancestors.has(node)) return reject('cycle', visit.trail)
  const read = ownList(walk, node, 'entries', visit.trail)
  if ('rejected' in read) return read
  const entries: JsonEntry[] = []
  const keys = new Set<string>()
  const children: Visit[] = []
  for (const [index, element] of read.list.entries()) {
    const trail = step(read.trail, index)
    const entry = readEntry(element, trail)
    if ('rejected' in entry) return entry
    if (keys.has(entry.key)) return reject('duplicate', trail, 'key')
    keys.add(entry.key)
    const placed: { key: string; value: JsonValue } = { key: entry.key, value: { kind: 'null' } }
    entries.push(placed)
    walk.built.push(placed)
    children.push({
      action: 'visit',
      value: entry.value,
      trail: step(trail, 'value'),
      place: tree => (placed.value = tree),
    })
  }
  walk.queued += children.length
  walk.ancestors.add(node)
  walk.pending.push({ action: 'leave', node })
  // One push per child: a spread passes every child as an argument and overflows the stack.
  for (const child of children.reverse()) walk.pending.push(child)
  const tree: JsonValue = { kind: 'object', entries }
  walk.built.push(entries, tree)
  return tree
}

type Typed = Readonly<{ node: object; kind: Kind }>

/** The node as a plain object of one of the six kinds, with no key outside that kind's set. */
function typedNode(visit: Visit): Typed | Rejected {
  const node = visit.value
  if (!isPlainObject(node)) return reject('type', visit.trail)
  const kind = ownField(node, 'kind', visit.trail)
  if ('rejected' in kind) return kind
  if (!isKind(kind.found)) return reject('value', visit.trail, 'kind')
  const allowed = NODE_KEYS[kind.found]
  for (const key of ownKeysOf(node))
    if (typeof key !== 'string' || !allowed.includes(key))
      return reject('unknown-field', visit.trail, String(key))
  return { node, kind: kind.found }
}

function visitNode(walk: Walk, visit: Visit): JsonValue | Rejected {
  walk.visits += 1
  const typed = typedNode(visit)
  if ('rejected' in typed) return typed
  switch (typed.kind) {
    case 'null':
      return Object.freeze({ kind: 'null' })
    case 'boolean':
    case 'string':
    case 'number':
      return leaf(typed.node, typed.kind, visit.trail)
    case 'array':
      return visitArray(walk, typed.node, visit)
    case 'object':
      return visitObject(walk, typed.node, visit)
  }
}

function walkTree(value: unknown, maxVisits: number): JsonValueJudgment {
  let root: JsonValue = { kind: 'null' }
  const walk: Walk = {
    pending: [{ action: 'visit', value, trail: null, place: tree => (root = tree) }],
    ancestors: new Set(),
    built: [],
    maxVisits,
    visits: 0,
    queued: 1,
  }
  for (let next = walk.pending.pop(); next !== undefined; next = walk.pending.pop()) {
    if (next.action === 'leave') {
      walk.ancestors.delete(next.node)
      continue
    }
    walk.queued -= 1
    const tree = visitNode(walk, next)
    if ('rejected' in tree) return tree
    next.place(tree)
  }
  for (const built of walk.built) Object.freeze(built)
  return { ok: root }
}

function parseMaxVisits(limits: unknown): number {
  if (limits === undefined) return DEFAULT_MAX_VISITS
  if (typeof limits !== 'object' || limits === null) throw new TypeError('limits must be an object')
  let maxVisits: unknown
  try {
    maxVisits = Reflect.get(limits, 'maxVisits')
  } catch (cause) {
    throw new TypeError('limits.maxVisits could not be read', { cause })
  }
  if (typeof maxVisits !== 'number' || !Number.isSafeInteger(maxVisits) || maxVisits < 1)
    throw new TypeError(
      'limits.maxVisits must be an integer from 1 through Number.MAX_SAFE_INTEGER',
    )
  return maxVisits
}

/**
 * Judges a value that was built in memory. It accepts a closed tree of `JsonValue` nodes and
 * returns a frozen copy, or the first rejection with the structural path of the field. It reads
 * own data properties only and never calls a getter. An exception raised by reading the input,
 * such as a Proxy trap, rejects the whole value as `unreadable`, and so does a list whose length
 * is not a non-negative safe integer. A list is checked against the
 * visit budget before its elements are read.
 */
export function judgeJsonValue(
  value: unknown,
  limits?: Readonly<{ maxVisits: number }>,
): JsonValueJudgment {
  const maxVisits = parseMaxVisits(limits)
  try {
    return walkTree(value, maxVisits)
  } catch (error) {
    if (error instanceof UnreadableInput) return { rejected: 'unreadable', path: [] }
    throw error
  }
}
