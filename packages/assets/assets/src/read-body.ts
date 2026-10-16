import {
  readJsonText,
  type JsonLimits,
  type JsonRead,
  type JsonValue,
} from '@omne-harness/json-text'

const owned = new WeakSet<object>()

type ArrayWork = {
  readonly kind: 'array'
  readonly items: JsonValue[]
  readonly source: readonly unknown[]
  index: number
}

type ObjectWork = {
  readonly kind: 'object'
  readonly entries: { key: string; value: JsonValue }[]
  readonly source: readonly unknown[]
  index: number
}

type Work = ArrayWork | ObjectWork

export function readBodyText(text: string, limits: JsonLimits): JsonRead {
  const read = readJsonText(text, limits)
  if (read.kind !== 'ok') return read
  const shot = copyTree(read.value, true)
  if (shot === undefined) throw new TypeError('read document could not be copied')
  return { kind: 'ok', value: shot }
}

export function isReadBody(value: unknown): value is JsonValue {
  return readSnapshot(value) !== undefined
}

export function readSnapshot(value: unknown): JsonValue | undefined {
  if (typeof value !== 'object' || value === null || !owned.has(value)) return undefined
  return value as JsonValue
}

export function copyReadBody(value: unknown): JsonValue | undefined {
  const source = readSnapshot(value)
  if (source === undefined) return undefined
  return copyTree(source, true)
}

export function copyTree(root: unknown, trust: boolean): JsonValue | undefined {
  const seen = new WeakSet<object>()
  const opened = open(root, seen, trust)
  if (opened === undefined) return undefined
  if (opened.kind === 'leaf') return opened.node
  const stack: Work[] = [opened.work]
  let done: JsonValue | undefined
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (frame === undefined) return undefined
    if (frame.index >= frame.source.length) {
      done = finish(frame, trust)
      stack.pop()
      const parent = stack[stack.length - 1]
      if (parent !== undefined && done !== undefined && !attach(parent, done)) return undefined
      continue
    }
    const childSource = sourceChild(frame)
    frame.index += 1
    if (childSource === undefined) return undefined
    const child = open(childSource, seen, trust)
    if (child === undefined) return undefined
    if (child.kind === 'leaf') {
      if (!attach(frame, child.node)) return undefined
    } else stack.push(child.work)
  }
  return done
}

function open(
  source: unknown,
  seen: WeakSet<object>,
  trust: boolean,
): { kind: 'leaf'; node: JsonValue } | { kind: 'work'; work: Work } | undefined {
  if (typeof source !== 'object' || source === null) return undefined
  if (seen.has(source)) return undefined
  seen.add(source)
  if (!('kind' in source)) return undefined
  if (source.kind === 'null') return { kind: 'leaf', node: keep({ kind: 'null' }, trust) }
  if (source.kind === 'boolean') {
    if (!('value' in source) || typeof source.value !== 'boolean') return undefined
    return { kind: 'leaf', node: keep({ kind: 'boolean', value: source.value }, trust) }
  }
  if (source.kind === 'string') {
    if (!('value' in source) || typeof source.value !== 'string') return undefined
    return { kind: 'leaf', node: keep({ kind: 'string', value: source.value }, trust) }
  }
  if (source.kind === 'number') {
    if (!('lexeme' in source) || typeof source.lexeme !== 'string') return undefined
    return { kind: 'leaf', node: keep({ kind: 'number', lexeme: source.lexeme }, trust) }
  }
  if (source.kind === 'array') {
    if (!('items' in source) || !Array.isArray(source.items)) return undefined
    return { kind: 'work', work: { kind: 'array', items: [], source: source.items, index: 0 } }
  }
  if (source.kind === 'object') {
    if (!('entries' in source) || !Array.isArray(source.entries)) return undefined
    return { kind: 'work', work: { kind: 'object', entries: [], source: source.entries, index: 0 } }
  }
  return undefined
}

function sourceChild(frame: Work): unknown {
  if (frame.kind === 'array') return frame.source[frame.index]
  const entry = frame.source[frame.index]
  if (
    typeof entry !== 'object' ||
    entry === null ||
    !('key' in entry) ||
    typeof entry.key !== 'string'
  )
    return undefined
  if (!('value' in entry)) return undefined
  return entry.value
}

function attach(frame: Work, child: JsonValue): boolean {
  if (frame.kind === 'array') {
    frame.items.push(child)
    return true
  }
  const entry = frame.source[frame.index - 1]
  if (
    typeof entry !== 'object' ||
    entry === null ||
    !('key' in entry) ||
    typeof entry.key !== 'string'
  )
    return false
  frame.entries.push(Object.freeze({ key: entry.key, value: child }))
  return true
}

function finish(frame: Work, trust: boolean): JsonValue {
  if (frame.kind === 'array')
    return keep({ kind: 'array', items: Object.freeze(frame.items) }, trust)
  return keep({ kind: 'object', entries: Object.freeze(frame.entries) }, trust)
}

function keep(value: JsonValue, trust: boolean): JsonValue {
  const frozen = Object.freeze(value)
  if (trust) owned.add(frozen)
  return frozen
}
