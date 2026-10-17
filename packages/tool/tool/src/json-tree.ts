// The tagged JSON tree of a wait request as an untrusted value: a closed check that rebuilds a
// frozen copy and the canonical JSON text of that copy.
//
// This file mirrors tool-contract/src/json-tree.ts. The contract keeps its checker private, and
// the scope also needs the canonical text and its UTF-8 size while it walks, which that checker
// does not give. Who owns the shared walk is an open item for the contract owner; until then the
// two walks keep the same guarantees. The walk uses an explicit stack, so a deep tree cannot
// exhaust the call stack; a container on its own path is rejected as a cycle; at most
// JSON_TREE_MAX_NODES nodes are visited, counting a shared subtree each time it is reached; and
// the walk stops as soon as the text exceeds the byte budget. So a deep, shared or cyclic input
// cannot run without bound.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolAskRequest } from '@omne-harness/tool-contract'
import { slot } from './limits.ts'

export type JsonValue = ToolAskRequest['request']
type JsonEntry = Extract<JsonValue, { kind: 'object' }>['entries'][number]
type Kind = JsonValue['kind']

export type FixedJsonTree = Readonly<{ value: JsonValue; text: string; bytes: number }>
export type JsonTreeRejection = Readonly<{
  reason: 'invalid' | 'too-large' | 'cycle' | 'budget'
  detail: string
}>

/** The most nodes one check visits. Equal to the contract's JSON_TREE_MAX_NODES. */
export const JSON_TREE_MAX_NODES = 1_000_000

const JSON_NUMBER = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/u

type Built = Readonly<{ value: JsonValue; text: string }>

type Frame =
  | {
      kind: 'array'
      source: object
      sources: readonly unknown[]
      next: number
      items: JsonValue[]
      texts: string[]
    }
  | {
      kind: 'object'
      source: object
      sources: readonly unknown[]
      next: number
      entries: JsonEntry[]
      texts: string[]
      keys: Set<string>
      key: string
    }

type Walk = {
  readonly stack: Frame[]
  /** The containers open on the path from the root to the current node. */
  readonly path: Set<object>
  visits: number
  /** The exact UTF-8 size of the text built so far. */
  bytes: number
  readonly maxBytes: number
}

/** One row per node kind: the closed key set, the field that carries the value, and what it opens. */
type Row = Readonly<{ keys: readonly string[]; field: string }> &
  (
    | Readonly<{ leaf: (field: unknown) => Built | undefined }>
    | Readonly<{ opens: 'array' | 'object' }>
  )

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isLexeme(value: unknown): value is string {
  return typeof value === 'string' && JSON_NUMBER.test(value)
}

function leaf<T>(accept: (field: unknown) => field is T, build: (field: T) => Built) {
  return (field: unknown): Built | undefined => (accept(field) ? build(field) : undefined)
}

const NODES: Readonly<Record<Kind, Row>> = {
  null: { keys: ['kind'], field: 'kind', leaf: () => ({ value: { kind: 'null' }, text: 'null' }) },
  boolean: {
    keys: ['kind', 'value'],
    field: 'value',
    leaf: leaf(isBoolean, value => ({ value: { kind: 'boolean', value }, text: String(value) })),
  },
  string: {
    keys: ['kind', 'value'],
    field: 'value',
    leaf: leaf(isString, value => ({
      value: { kind: 'string', value },
      text: JSON.stringify(value),
    })),
  },
  number: {
    keys: ['kind', 'lexeme'],
    field: 'lexeme',
    leaf: leaf(isLexeme, lexeme => ({ value: { kind: 'number', lexeme }, text: lexeme })),
  },
  array: { keys: ['kind', 'items'], field: 'items', opens: 'array' },
  object: { keys: ['kind', 'entries'], field: 'entries', opens: 'object' },
}

function isKind(value: unknown): value is Kind {
  return typeof value === 'string' && Object.hasOwn(NODES, value)
}

function invalid(detail: string): Outcome<never, JsonTreeRejection> {
  return fail({ reason: 'invalid', detail })
}

function tooLarge(walk: Walk): Outcome<never, JsonTreeRejection> {
  return fail({ reason: 'too-large', detail: `more than ${walk.maxBytes} bytes` })
}

/** Adds bytes to the running size and says whether the text still fits. */
function charge(walk: Walk, bytes: number): boolean {
  walk.bytes += bytes
  return walk.bytes <= walk.maxBytes
}

/** A node is a plain object with a known kind and no field outside its kind's key set. */
function closedNode(
  source: unknown,
): Outcome<Readonly<{ node: object; kind: Kind }>, JsonTreeRejection> {
  if (typeof source !== 'object' || source === null || Array.isArray(source))
    return invalid('a node is not an object')
  const kind = slot(source, 'kind')
  if (kind.kind !== 'value' || typeof kind.value !== 'string') return invalid('a node has no kind')
  if (!isKind(kind.value)) return invalid(`unknown node kind ${kind.value}`)
  const keys = NODES[kind.value].keys
  for (const present of Reflect.ownKeys(source))
    if (typeof present !== 'string' || !keys.includes(present))
      return invalid(`unknown field ${String(present)}`)
  return succeed({ node: source, kind: kind.value })
}

function frame(kind: 'array' | 'object', source: object, sources: readonly unknown[]): Frame {
  return kind === 'array'
    ? { kind, source, sources, next: 0, items: [], texts: [] }
    : { kind, source, sources, next: 0, entries: [], texts: [], keys: new Set(), key: '' }
}

/** A leaf becomes a built value. A container becomes a frame to fill. */
function begin(walk: Walk, source: unknown): Outcome<Built | Frame, JsonTreeRejection> {
  walk.visits += 1
  if (walk.visits > JSON_TREE_MAX_NODES)
    return fail({ reason: 'budget', detail: `more than ${JSON_TREE_MAX_NODES} nodes` })
  const closed = closedNode(source)
  if ('failure' in closed) return closed
  const { node, kind } = closed.ok
  const row = NODES[kind]
  const field = slot(node, row.field)
  const value = field.kind === 'value' ? field.value : undefined
  if ('leaf' in row) {
    const built = row.leaf(value)
    return built === undefined ? invalid(`a ${kind} node has no ${row.field}`) : succeed(built)
  }
  if (walk.path.has(node)) return fail({ reason: 'cycle', detail: 'a container is inside itself' })
  if (!Array.isArray(value)) return invalid(`a ${kind} node has no ${row.field} array`)
  return succeed(frame(row.opens, node, value))
}

function complete(frame: Frame): Built {
  if (frame.kind === 'array') {
    return {
      value: Object.freeze({ kind: 'array', items: Object.freeze(frame.items) }),
      text: `[${frame.texts.join(',')}]`,
    }
  }
  return {
    value: Object.freeze({ kind: 'object', entries: Object.freeze(frame.entries) }),
    text: `{${frame.texts.join(',')}}`,
  }
}

/** Charges a begun node: its leaf text, or the two brackets of a container, which is then opened. */
function enter(walk: Walk, begun: Built | Frame): Built | null {
  if ('text' in begun) {
    charge(walk, Buffer.byteLength(begun.text))
    Object.freeze(begun.value)
    return begun
  }
  charge(walk, 2)
  if (begun.sources.length === 0) return complete(begun)
  walk.stack.push(begun)
  walk.path.add(begun.source)
  return null
}

function place(parent: Frame, child: Built): void {
  if (parent.kind === 'array') {
    parent.items.push(child.value)
    parent.texts.push(child.text)
  } else {
    parent.entries.push(Object.freeze({ key: parent.key, value: child.value }))
    parent.texts.push(`${JSON.stringify(parent.key)}:${child.text}`)
  }
  parent.next += 1
}

/**
 * Puts a built child into the open frame on top and completes every frame it was the last child
 * of. Gives the root when the stack empties, null while a frame still waits for its next child.
 */
function fold(walk: Walk, built: Built): Outcome<Built | null, JsonTreeRejection> {
  let child = built
  for (;;) {
    const parent = walk.stack[walk.stack.length - 1]
    if (parent === undefined) return succeed(child)
    place(parent, child)
    // One comma per child after the first.
    if (parent.next < parent.sources.length) return charge(walk, 1) ? succeed(null) : tooLarge(walk)
    walk.stack.pop()
    walk.path.delete(parent.source)
    child = complete(parent)
  }
}

/** One object entry: closed to `key` and `value`, and its key is a string. */
function closedEntry(
  entry: unknown,
): Outcome<Readonly<{ key: string; value: unknown }>, JsonTreeRejection> {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
    return invalid('an entry is not an object')
  for (const present of Reflect.ownKeys(entry))
    if (present !== 'key' && present !== 'value') return invalid(`unknown field ${String(present)}`)
  const key = slot(entry, 'key')
  if (key.kind !== 'value' || typeof key.value !== 'string')
    return invalid('an entry key is not a string')
  const value = slot(entry, 'value')
  if (value.kind !== 'value') return invalid('an entry has no value')
  return succeed({ key: key.value, value: value.value })
}

/** Reads the next child of an object frame: its key is fixed here, its value by `begin`. */
function nextEntryValue(
  frame: Extract<Frame, { kind: 'object' }>,
): Outcome<unknown, JsonTreeRejection> {
  const entry = closedEntry(frame.sources[frame.next])
  if ('failure' in entry) return entry
  if (frame.keys.has(entry.ok.key)) return invalid(`duplicate key ${entry.ok.key}`)
  frame.keys.add(entry.ok.key)
  frame.key = entry.ok.key
  return succeed(entry.ok.value)
}

/** The next source to begin: the next child of the frame on top, with `"key":` charged for an object. */
function nextChild(walk: Walk): Outcome<unknown, JsonTreeRejection> {
  const top = walk.stack[walk.stack.length - 1]
  if (top === undefined) throw new Error('json tree walk lost its frames before the root completed')
  if (top.kind === 'array') return succeed(top.sources[top.next])
  const next = nextEntryValue(top)
  if ('failure' in next) return next
  return charge(walk, Buffer.byteLength(JSON.stringify(top.key)) + 1) ? next : tooLarge(walk)
}

/**
 * Checks and copies one tagged JSON tree and gives its canonical text. `maxBytes` bounds the
 * UTF-8 size of that text; a larger tree is rejected as `too-large` before the walk completes.
 * A container inside itself is `cycle`; more than JSON_TREE_MAX_NODES visits is `budget`.
 */
export function fixJsonTree(
  source: unknown,
  maxBytes: number,
): Outcome<FixedJsonTree, JsonTreeRejection> {
  const walk: Walk = { stack: [], path: new Set(), visits: 0, bytes: 0, maxBytes }
  let pending: unknown = source
  for (;;) {
    const begun = begin(walk, pending)
    if ('failure' in begun) return begun
    const built = enter(walk, begun.ok)
    if (walk.bytes > maxBytes) return tooLarge(walk)
    if (built !== null) {
      const folded = fold(walk, built)
      if ('failure' in folded) return folded
      if (folded.ok !== null) return succeed({ ...folded.ok, bytes: walk.bytes })
    }
    const next = nextChild(walk)
    if ('failure' in next) return next
    pending = next.ok
  }
}
