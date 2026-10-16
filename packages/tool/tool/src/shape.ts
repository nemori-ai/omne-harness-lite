// Closed shape checks for untrusted values. Each check reads own data properties only, never
// calls a getter or a function of the input, and returns a frozen rebuilt copy. Only an author
// capability check reads the prototype chain, through `inheritedSlot`.
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'

/** The field path that a check rejects, such as `commands[1].name`, and why. */
export type ShapeRejection = Readonly<{ field: string; reason: string }>
export type Checked<T> = Outcome<T, ShapeRejection>
export type Check<T> = (value: unknown, at: string) => Checked<T>
type Checks = Readonly<Record<string, Check<unknown>>>
type Checked_<C> = C extends Check<infer T> ? T : never
type Fields<C extends Checks> = { readonly [K in keyof C]: Checked_<C[K]> }

export function reject(field: string, reason: string): Checked<never> {
  return fail({ field, reason })
}

export function member(at: string, key: string): string {
  return at === '' ? key : `${at}.${key}`
}

export function item(at: string, index: number): string {
  return `${at}[${index}]`
}

/** Runs a check at the root and names the root `root` in a rejection. */
export function judgeAt<T>(check: Check<T>, value: unknown, root: string): Checked<T> {
  const checked = check(value, '')
  if ('ok' in checked || checked.failure.field !== '') return checked
  return reject(root, checked.failure.reason)
}

/**
 * `judgeAt` for an entry point that takes `unknown`. Reading the input can still throw, for
 * example through a Proxy trap; the whole value is then rejected as `unreadable`.
 */
export function judgeUnknown<T>(check: Check<T>, value: unknown, root: string): Checked<T> {
  try {
    return judgeAt(check, value, root)
  } catch {
    return reject(root, 'unreadable')
  }
}

type Slot =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'accessor' }>
  | Readonly<{ kind: 'value'; value: unknown }>

/** Reads one own property without running a getter. */
export function slot(value: object, key: PropertyKey): Slot {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor === undefined) return { kind: 'absent' }
  if (!('value' in descriptor)) return { kind: 'accessor' }
  return { kind: 'value', value: descriptor.value }
}

/**
 * Reads one property from the object or its prototype chain without running a getter. The
 * nearest property that has the key decides, as for an ordinary read.
 */
export function inheritedSlot(value: object, key: PropertyKey): Slot {
  for (let holder: object | null = value; holder !== null; holder = Object.getPrototypeOf(holder)) {
    const read = slot(holder, key)
    if (read.kind !== 'absent') return read
  }
  return { kind: 'absent' }
}

export function isPlainObject(value: unknown): value is object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function describeKey(key: PropertyKey): string {
  return typeof key === 'string' ? key : `[${String(key)}]`
}

function readFields(
  value: object,
  at: string,
  checks: Checks,
  out: Record<string, unknown>,
  required: boolean,
): ShapeRejection | undefined {
  for (const [key, check] of Object.entries(checks)) {
    const field = member(at, key)
    const read = slot(value, key)
    if (read.kind === 'absent') {
      if (required) return { field, reason: 'missing' }
      continue
    }
    if (read.kind === 'accessor') return { field, reason: 'accessor' }
    const checked = check(read.value, field)
    if ('failure' in checked) return checked.failure
    out[key] = checked.ok
  }
  return undefined
}

/**
 * A closed object. Every key of `required` must be present. A key of `optional` may be absent,
 * and an absent key stays absent in the copy. Any other own key is rejected.
 */
export function record<R extends Checks, O extends Checks = Readonly<Record<never, never>>>(
  required: R,
  optional?: O,
): Check<Fields<R> & Partial<Fields<O>>> {
  const allowed = new Set([...Object.keys(required), ...Object.keys(optional ?? {})])
  return (value, at) => {
    if (!isPlainObject(value)) return reject(at, 'type')
    const out: Record<string, unknown> = {}
    const failure =
      readFields(value, at, required, out, true) ??
      readFields(value, at, optional ?? {}, out, false)
    if (failure !== undefined) return fail(failure)
    for (const key of Reflect.ownKeys(value))
      if (typeof key !== 'string' || !allowed.has(key))
        return reject(member(at, describeKey(key)), 'unknown-field')
    // Each declared field passed its check above, so the copy has the declared shape.
    return succeed(Object.freeze(out) as Fields<R> & Partial<Fields<O>>)
  }
}

/** A tagged union. The tag selects one branch, and the branch checks the whole object. */
export function variant<B extends Checks>(
  tag: string,
  branches: B,
): Check<{ [K in keyof B]: Checked_<B[K]> }[keyof B]> {
  return (value, at) => {
    if (!isPlainObject(value)) return reject(at, 'type')
    const read = slot(value, tag)
    const field = member(at, tag)
    if (read.kind === 'absent') return reject(field, 'missing')
    if (read.kind === 'accessor') return reject(field, 'accessor')
    if (typeof read.value !== 'string' || !Object.hasOwn(branches, read.value))
      return reject(field, 'value')
    const branch = branches[read.value]
    if (branch === undefined) return reject(field, 'value')
    // The selected branch is one member of the union.
    return branch(value, at) as Checked<{ [K in keyof B]: Checked_<B[K]> }[keyof B]>
  }
}

export function literal<const L extends readonly string[]>(...values: L): Check<L[number]> {
  return (value, at) => {
    for (const candidate of values) if (value === candidate) return succeed(candidate)
    return reject(at, typeof value === 'string' ? 'value' : 'type')
  }
}

export const text: Check<string> = (value, at) =>
  typeof value === 'string' ? succeed(value) : reject(at, 'type')

/** A string with at least one character. It is not trimmed or normalized. */
export const filled: Check<string> = (value, at) => {
  if (typeof value !== 'string') return reject(at, 'type')
  return value.length > 0 ? succeed(value) : reject(at, 'empty')
}

/** A string that has a character other than white space. */
export const nonBlank: Check<string> = (value, at) => {
  if (typeof value !== 'string') return reject(at, 'type')
  return value.trim().length > 0 ? succeed(value) : reject(at, 'blank')
}

/** A non-blank string without a line break. */
export const oneLine: Check<string> = (value, at) => {
  const checked = nonBlank(value, at)
  if ('failure' in checked) return checked
  return /[\r\n\u2028\u2029]/u.test(checked.ok) ? reject(at, 'multiline') : checked
}

const DECIMAL = /^(0|[1-9][0-9]*)$/u

/** A canonical non-negative decimal integer text: no sign, no leading zero, no fraction. */
export const decimal: Check<string> = (value, at) => {
  if (typeof value !== 'string') return reject(at, 'type')
  return DECIMAL.test(value) ? succeed(value) : reject(at, 'decimal')
}

export const positiveSafeInteger: Check<number> = (value, at) => {
  if (typeof value !== 'number') return reject(at, 'type')
  return Number.isSafeInteger(value) && value > 0 ? succeed(value) : reject(at, 'range')
}

export const bool: Check<boolean> = (value, at) =>
  typeof value === 'boolean' ? succeed(value) : reject(at, 'type')

export function nullable<T>(check: Check<T>): Check<T | null> {
  return (value, at) => (value === null ? succeed(null) : check(value, at))
}

/** A dense array. The copy is frozen. */
export function list<T>(check: Check<T>): Check<readonly T[]> {
  return (value, at) => {
    if (!Array.isArray(value)) return reject(at, 'type')
    const out: T[] = []
    for (let index = 0; index < value.length; index += 1) {
      const read = slot(value, index)
      const field = item(at, index)
      if (read.kind === 'absent') return reject(field, 'missing')
      if (read.kind === 'accessor') return reject(field, 'accessor')
      const checked = check(read.value, field)
      if ('failure' in checked) return checked
      out.push(checked.ok)
    }
    return succeed(Object.freeze(out))
  }
}

/** Adds a rule that runs only after `check` accepted the value. */
export function refine<T>(
  check: Check<T>,
  rule: (value: T, at: string) => ShapeRejection | undefined,
): Check<T> {
  return (value, at) => {
    const checked = check(value, at)
    if ('failure' in checked) return checked
    const failure = rule(checked.ok, at)
    return failure === undefined ? checked : fail(failure)
  }
}

export function nonEmpty<T>(check: Check<readonly T[]>): Check<readonly T[]> {
  return refine(check, (values, at) =>
    values.length === 0 ? { field: at, reason: 'empty' } : undefined,
  )
}

/**
 * Rejects the first later item whose key equals the key of an earlier item. `suffix` names the
 * member of the item that holds the key, or is empty when the item is the key.
 */
export function unique<T>(
  check: Check<readonly T[]>,
  key: (value: T) => string,
  suffix = '',
): Check<readonly T[]> {
  return refine(check, (values, at) => {
    const index = firstRepeat(values.map(key))
    if (index < 0) return undefined
    const field = suffix === '' ? item(at, index) : member(item(at, index), suffix)
    return { field, reason: 'duplicate' }
  })
}

/** The index of the first value that an earlier value repeats, or -1. */
export function firstRepeat(values: readonly string[]): number {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) return index
    seen.add(value)
  }
  return -1
}

/** Adapts a Tool identity decoder, whose failure names the identity type, to a field path. */
export function identity<T>(
  decode: (text: unknown) => Outcome<T, Readonly<{ reason: string }>>,
): Check<T> {
  return (value, at) => {
    const decoded = decode(value)
    return 'ok' in decoded ? decoded : reject(at, decoded.failure.reason)
  }
}

/** Formats a rejection for an interface whose failure carries only `reason`. */
export function describeRejection(rejection: ShapeRejection): string {
  return `${rejection.field}: ${rejection.reason}`
}
