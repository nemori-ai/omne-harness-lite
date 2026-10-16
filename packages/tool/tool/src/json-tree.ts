// The tagged JSON tree of a wait request as an untrusted value: a closed check that rebuilds a
// frozen copy and the canonical JSON text of that copy. The walk uses an explicit stack and stops
// as soon as the text exceeds the byte budget, so a deep, shared or cyclic input cannot exhaust
// the call stack or run without bound.
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import type { ToolAskRequest } from '@omne-harness/tool-contract'
import { slot } from './limits.ts'

export type JsonValue = ToolAskRequest['request']
type JsonEntry = Extract<JsonValue, { kind: 'object' }>['entries'][number]

export type FixedJsonTree = Readonly<{ value: JsonValue; text: string; bytes: number }>
export type JsonTreeRejection = Readonly<{ reason: 'invalid' | 'too-large'; detail: string }>

const JSON_NUMBER = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/u

type Built = Readonly<{ value: JsonValue; text: string }>

type Frame =
  | {
      kind: 'array'
      sources: readonly unknown[]
      next: number
      items: JsonValue[]
      texts: string[]
    }
  | {
      kind: 'object'
      sources: readonly unknown[]
      next: number
      entries: JsonEntry[]
      texts: string[]
      keys: Set<string>
      key: string
    }

function invalid(detail: string): Outcome<never, JsonTreeRejection> {
  return fail({ reason: 'invalid', detail })
}

function own(
  value: object,
  key: string,
  keys: readonly string[],
): Outcome<unknown, JsonTreeRejection> {
  for (const present of Reflect.ownKeys(value)) {
    if (typeof present !== 'string' || !keys.includes(present))
      return invalid(`unknown field ${String(present)}`)
  }
  const read = slot(value, key)
  if (read.kind !== 'value') return invalid(`${key} is ${read.kind}`)
  return succeed(read.value)
}

/** A leaf becomes a built value. A container becomes a frame to fill. */
function begin(source: unknown): Outcome<Built | Frame, JsonTreeRejection> {
  if (typeof source !== 'object' || source === null || Array.isArray(source))
    return invalid('a node is not an object')
  const kind = slot(source, 'kind')
  if (kind.kind !== 'value' || typeof kind.value !== 'string') return invalid('a node has no kind')
  switch (kind.value) {
    case 'null': {
      const read = own(source, 'kind', ['kind'])
      return 'failure' in read ? read : succeed({ value: { kind: 'null' }, text: 'null' })
    }
    case 'boolean': {
      const read = own(source, 'value', ['kind', 'value'])
      if ('failure' in read) return read
      if (typeof read.ok !== 'boolean') return invalid('a boolean node has no boolean value')
      return succeed({ value: { kind: 'boolean', value: read.ok }, text: String(read.ok) })
    }
    case 'string': {
      const read = own(source, 'value', ['kind', 'value'])
      if ('failure' in read) return read
      if (typeof read.ok !== 'string') return invalid('a string node has no string value')
      return succeed({ value: { kind: 'string', value: read.ok }, text: JSON.stringify(read.ok) })
    }
    case 'number': {
      const read = own(source, 'lexeme', ['kind', 'lexeme'])
      if ('failure' in read) return read
      if (typeof read.ok !== 'string' || !JSON_NUMBER.test(read.ok))
        return invalid('a number node has no JSON number lexeme')
      return succeed({ value: { kind: 'number', lexeme: read.ok }, text: read.ok })
    }
    case 'array': {
      const read = own(source, 'items', ['kind', 'items'])
      if ('failure' in read) return read
      if (!Array.isArray(read.ok)) return invalid('an array node has no items array')
      return succeed({ kind: 'array', sources: read.ok, next: 0, items: [], texts: [] })
    }
    case 'object': {
      const read = own(source, 'entries', ['kind', 'entries'])
      if ('failure' in read) return read
      if (!Array.isArray(read.ok)) return invalid('an object node has no entries array')
      return succeed({
        kind: 'object',
        sources: read.ok,
        next: 0,
        entries: [],
        texts: [],
        keys: new Set(),
        key: '',
      })
    }
    default:
      return invalid(`unknown node kind ${kind.value}`)
  }
}

function complete(frame: Frame): Built {
  if (frame.kind === 'array') {
    return {
      value: { kind: 'array', items: Object.freeze(frame.items) },
      text: `[${frame.texts.join(',')}]`,
    }
  }
  return {
    value: { kind: 'object', entries: Object.freeze(frame.entries) },
    text: `{${frame.texts.join(',')}}`,
  }
}

/** Reads the next child of an object frame: its key is fixed here, its value by `begin`. */
function nextEntryValue(
  frame: Extract<Frame, { kind: 'object' }>,
): Outcome<unknown, JsonTreeRejection> {
  const entry = frame.sources[frame.next]
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
    return invalid('an entry is not an object')
  const key = own(entry, 'key', ['key', 'value'])
  if ('failure' in key) return key
  if (typeof key.ok !== 'string') return invalid('an entry key is not a string')
  if (frame.keys.has(key.ok)) return invalid(`duplicate key ${key.ok}`)
  frame.keys.add(key.ok)
  frame.key = key.ok
  const value = slot(entry, 'value')
  return value.kind === 'value' ? succeed(value.value) : invalid('an entry has no value')
}

/**
 * Checks and copies one tagged JSON tree and gives its canonical text. `maxBytes` bounds the
 * UTF-8 size of that text; a larger tree is rejected as `too-large` before the walk completes.
 */
export function fixJsonTree(
  source: unknown,
  maxBytes: number,
): Outcome<FixedJsonTree, JsonTreeRejection> {
  const stack: Frame[] = []
  // The running count is exact for the text built so far: leaf texts, two brackets per
  // container, one comma per child after the first, and `"key":` per object entry.
  let bytes = 0
  const tooLarge = (): Outcome<never, JsonTreeRejection> =>
    fail({ reason: 'too-large', detail: `more than ${maxBytes} bytes` })
  let pending: unknown = source
  for (;;) {
    const begun = begin(pending)
    if ('failure' in begun) return begun
    let built: Built | null = null
    if ('text' in begun.ok) {
      built = begun.ok
      bytes += Buffer.byteLength(built.text)
    } else {
      bytes += 2
      if (begun.ok.sources.length === 0) built = complete(begun.ok)
      else stack.push(begun.ok)
    }
    if (bytes > maxBytes) return tooLarge()
    while (built !== null) {
      const parent = stack[stack.length - 1]
      if (parent === undefined) {
        Object.freeze(built.value)
        return succeed({ value: built.value, text: built.text, bytes })
      }
      if (parent.kind === 'array') {
        parent.items.push(built.value)
        parent.texts.push(built.text)
      } else {
        parent.entries.push(Object.freeze({ key: parent.key, value: built.value }))
        parent.texts.push(`${JSON.stringify(parent.key)}:${built.text}`)
      }
      parent.next += 1
      if (parent.next < parent.sources.length) {
        bytes += 1
        if (bytes > maxBytes) return tooLarge()
        built = null
        break
      }
      stack.pop()
      built = complete(parent)
    }
    const top = stack[stack.length - 1]
    if (top === undefined)
      throw new Error('json tree walk lost its frames before the root completed')
    if (top.kind === 'array') pending = top.sources[top.next]
    else {
      const next = nextEntryValue(top)
      if ('failure' in next) return next
      bytes += Buffer.byteLength(JSON.stringify(top.key)) + 1
      if (bytes > maxBytes) return tooLarge()
      pending = next.ok
    }
  }
}
