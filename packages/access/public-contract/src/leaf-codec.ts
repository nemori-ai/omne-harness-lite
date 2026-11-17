import {
  judgeJsonValue,
  readJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import {
  accountCodec,
  organizationCodec,
  loginStateCodec,
  tenantCodec,
  type IdentityTextCodec,
} from '@omne-harness/legal-identity'
import { encodeInstant, parseInstant, type Instant } from '@omne-harness/utc-instant'
import type { LeafKind, Rule } from './rule.ts'

export type Fields = Readonly<Record<string, unknown>>
export type Converted = { readonly local: unknown; readonly wire: JsonValue }
export type Direction = 'encode' | 'decode'
type Leaf = (input: unknown, direction: Direction, limits: JsonLimits) => Converted | undefined
type TreeKind = 'parameters' | 'json' | 'user-message'

export function fields(value: unknown): Fields | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  try {
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== null && prototype !== Object.prototype) return undefined
    const result: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return undefined
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor))
        return undefined
      result[key] = descriptor.value
    }
    return result
  } catch {
    return undefined
  }
}

function list(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) return undefined
    const keys = Reflect.ownKeys(value)
    if (keys.length !== length + 1) return undefined
    const result: unknown[] = []
    for (let i = 0; i < length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor))
        return undefined
      result.push(descriptor.value)
    }
    return result
  } catch {
    return undefined
  }
}

export function exact(
  value: Fields,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return (
    required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key))
  )
}

export function objectWire(
  value: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> | undefined {
  return value?.kind === 'object'
    ? Object.fromEntries(value.entries.map(entry => [entry.key, entry.value]))
    : undefined
}
export function textWire(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}
export function stringWire(value: string): JsonValue {
  return { kind: 'string', value }
}
export function wireObject(value: Readonly<Record<string, JsonValue>>): JsonValue {
  return { kind: 'object', entries: Object.entries(value).map(([key, value]) => ({ key, value })) }
}

function identity<T>(
  codec: IdentityTextCodec<T>,
  input: unknown,
  direction: Direction,
): Converted | undefined {
  if (direction === 'decode') {
    if (typeof input !== 'string') return undefined
    const parsed = codec.parse(input)
    return parsed.ok ? { local: parsed.value, wire: stringWire(input) } : undefined
  }
  const encoded = codec.encode(input as T)
  return encoded.ok ? { local: input, wire: stringWire(encoded.value) } : undefined
}

/** A calendar day without a time or a zone, `YYYY-MM-DD` in the proleptic Gregorian calendar. */
function isPlainDate(value: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (parts === null) return false
  const [year, month, dayOfMonth] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, dayOfMonth)
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === dayOfMonth
  )
}

function instant(input: unknown, direction: Direction): Converted | undefined {
  if (direction === 'decode') {
    if (typeof input !== 'string') return undefined
    const parsed = parseInstant(input)
    return parsed.ok ? { local: parsed.value, wire: stringWire(input) } : undefined
  }
  try {
    return { local: input, wire: stringWire(encodeInstant(input as Instant)) }
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}

function tenantText(text: string, limits: JsonLimits): boolean {
  if (!text.isWellFormed()) return false
  const parsed = readJsonText(text, { ...limits, maxDepth: 1, maxItems: 3, maxMembers: 2 })
  if (parsed.kind !== 'ok') return false
  const data = objectWire(parsed.value)
  return (
    data !== undefined &&
    exact(data, ['organization', 'account']) &&
    textWire(data.organization) !== undefined &&
    textWire(data.account) !== undefined
  )
}

function snapshotTree(input: unknown, maxItems: number): unknown {
  let root: unknown
  type Pending = { value: unknown; put: (value: unknown) => void } | { leave: object }
  const pending: Pending[] = [
    {
      value: input,
      put: value => {
        root = value
      },
    },
  ]
  const ancestors = new Set<object>()
  let objects = 0
  const maxObjects = Math.min(Number.MAX_SAFE_INTEGER, maxItems * 4 + 1)
  while (pending.length > 0) {
    const next = pending.pop()
    if (next === undefined) break
    if ('leave' in next) {
      ancestors.delete(next.leave)
      continue
    }
    if (typeof next.value !== 'object' || next.value === null) {
      next.put(next.value)
      continue
    }
    if (++objects > maxObjects || ancestors.has(next.value)) return undefined
    const data = fields(next.value) ?? list(next.value)
    if (data === undefined) return undefined
    const copy: Record<string, unknown> | unknown[] = Array.isArray(data) ? [] : Object.create(null)
    next.put(copy)
    ancestors.add(next.value)
    pending.push({ leave: next.value })
    for (const [key, value] of Object.entries(data)) {
      pending.push({
        value,
        put: value => {
          Object.defineProperty(copy, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          })
        },
      })
    }
  }
  return root
}

export function nodeOf(input: unknown): JsonValue | undefined {
  return input as JsonValue | undefined
}

function primitive(input: unknown, direction: Direction): unknown {
  if (direction === 'encode') return input
  const node = nodeOf(input)
  return node?.kind === 'string' || node?.kind === 'boolean' ? node.value : undefined
}

function tenant(input: unknown, direction: Direction, limits: JsonLimits): Converted | undefined {
  const converted = identity(tenantCodec, input, direction)
  return converted?.wire.kind === 'string' && tenantText(converted.wire.value, limits)
    ? converted
    : undefined
}

function isUserMessage(value: JsonValue): boolean {
  return (
    value.kind === 'object' &&
    value.entries.some(
      entry =>
        entry.key === 'role' && entry.value.kind === 'string' && entry.value.value === 'user',
    )
  )
}

function treeAccepts(kind: TreeKind, value: JsonValue): boolean {
  switch (kind) {
    case 'json':
      return true
    case 'parameters':
      return value.kind === 'object'
    case 'user-message':
      return isUserMessage(value)
  }
}

function tree(kind: TreeKind): Leaf {
  return (input, direction, limits) => {
    const judged = judgeJsonValue(
      direction === 'encode' ? snapshotTree(input, limits.maxItems) : input,
      { maxVisits: limits.maxItems },
    )
    return 'ok' in judged && treeAccepts(kind, judged.ok)
      ? { local: judged.ok, wire: judged.ok }
      : undefined
  }
}

function onPrimitive(convert: Leaf): Leaf {
  return (input, direction, limits) => convert(primitive(input, direction), direction, limits)
}

function textLeaf(accepts: (value: string) => boolean): Leaf {
  return onPrimitive(value =>
    typeof value === 'string' && accepts(value)
      ? { local: value, wire: stringWire(value) }
      : undefined,
  )
}

function identityLeaf<T>(codec: IdentityTextCodec<T>): Leaf {
  return onPrimitive((value, direction) => identity(codec, value, direction))
}

function nullLeaf(input: unknown, direction: Direction): Converted | undefined {
  const isNull = direction === 'decode' ? nodeOf(input)?.kind === 'null' : input === null
  return isNull ? { local: null, wire: { kind: 'null' } } : undefined
}

function boundedInteger(max: number, least = 1): Leaf {
  return (input, direction) => {
    const node = direction === 'decode' ? nodeOf(input) : undefined
    const value =
      direction === 'decode' ? (node?.kind === 'number' ? Number(node.lexeme) : undefined) : input
    return typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= least &&
      value <= max
      ? { local: value, wire: { kind: 'number', lexeme: String(value) } }
      : undefined
  }
}

const HITL_PAGE_LIMIT = 100
const withinPageLimit = boundedInteger(HITL_PAGE_LIMIT)

function pageLimit(
  input: unknown,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  if (direction === 'decode') {
    const node = nodeOf(input)
    if (node?.kind !== 'number' || !/^[1-9][0-9]*$/.test(node.lexeme)) return undefined
  }
  return withinPageLimit(input, direction, limits)
}

const withinCount = boundedInteger(Number.MAX_SAFE_INTEGER, 0)

function count(input: unknown, direction: Direction, limits: JsonLimits): Converted | undefined {
  if (direction === 'decode') {
    const node = nodeOf(input)
    if (node?.kind !== 'number' || !/^(0|[1-9][0-9]*)$/.test(node.lexeme)) return undefined
  }
  return withinCount(input, direction, limits)
}

const leaves: { readonly [K in LeafKind]: Leaf } = {
  'positive-integer': boundedInteger(Number.MAX_SAFE_INTEGER),
  count,
  'page-limit': pageLimit,
  text: textLeaf(value => value !== ''),
  string: textLeaf(() => true),
  session: textLeaf(value => /^[0-9a-f]{64}$/.test(value)),
  'page-bytes': textLeaf(value => /^[1-9][0-9]*$/.test(value)),
  revision: textLeaf(value => /^(0|[1-9][0-9]*)$/.test(value)),
  boolean: onPrimitive(value =>
    typeof value === 'boolean' ? { local: value, wire: { kind: 'boolean', value } } : undefined,
  ),
  null: nullLeaf,
  account: identityLeaf(accountCodec),
  organization: identityLeaf(organizationCodec),
  login: identityLeaf(loginStateCodec),
  tenant: onPrimitive(tenant),
  instant: onPrimitive(instant),
  'plain-date': textLeaf(isPlainDate),
  parameters: tree('parameters'),
  json: tree('json'),
  'user-message': tree('user-message'),
}

function isLeaf(rule: Rule): rule is Extract<Rule, { readonly kind: LeafKind }> {
  return Object.hasOwn(leaves, rule.kind)
}

function literal(rule: Extract<Rule, { kind: 'literal' }>, value: unknown): Converted | undefined {
  if (typeof value === 'string' && rule.values.includes(value))
    return { local: value, wire: stringWire(value) }
  if (typeof value === 'boolean' && rule.values.includes(value))
    return { local: value, wire: { kind: 'boolean', value } }
  return undefined
}

function convertObject(
  rule: Extract<Rule, { kind: 'object' }>,
  data: Fields | undefined,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  if (data === undefined || Object.keys(data).some(key => !Object.hasOwn(rule.fields, key)))
    return undefined
  const local: Record<string, unknown> = {}
  const wire: Record<string, JsonValue> = {}
  for (const [key, field] of Object.entries(rule.fields)) {
    if (!Object.hasOwn(data, key) && field.optional) continue
    const converted = convert(field.rule, data[key], direction, limits)
    if (converted === undefined) return undefined
    local[key] = converted.local
    wire[key] = converted.wire
  }
  return { local, wire: wireObject(wire) }
}

function convertList(
  rule: Extract<Rule, { kind: 'array' }>,
  data: readonly unknown[] | undefined,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  if (
    data === undefined ||
    data.length > limits.maxItems ||
    (rule.nonempty && data.length === 0) ||
    (rule.max !== undefined && data.length > rule.max)
  )
    return undefined
  const values: Converted[] = []
  for (const item of data) {
    const converted = convert(rule.item, item, direction, limits)
    if (converted === undefined) return undefined
    values.push(converted)
  }
  return {
    local: values.map(value => value.local),
    wire: { kind: 'array', items: values.map(value => value.wire) },
  }
}

function firstMatch(
  rules: readonly Rule[],
  input: unknown,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  for (const option of rules) {
    const converted = convert(option, input, direction, limits)
    if (converted !== undefined) return converted
  }
  return undefined
}

function itemsOf(input: unknown, direction: Direction): readonly unknown[] | undefined {
  if (direction === 'encode') return list(input)
  const node = nodeOf(input)
  return node?.kind === 'array' ? node.items : undefined
}

export function convert(
  rule: Rule,
  input: unknown,
  direction: Direction,
  limits: JsonLimits,
): Converted | undefined {
  if (isLeaf(rule)) return leaves[rule.kind](input, direction, limits)
  switch (rule.kind) {
    case 'literal':
      return literal(rule, primitive(input, direction))
    case 'object':
      return convertObject(
        rule,
        direction === 'decode' ? objectWire(nodeOf(input)) : fields(input),
        direction,
        limits,
      )
    case 'array':
      return convertList(rule, itemsOf(input, direction), direction, limits)
    case 'one-of':
      return firstMatch(rule.rules, input, direction, limits)
    default: {
      const unreachable: never = rule
      return unreachable
    }
  }
}
