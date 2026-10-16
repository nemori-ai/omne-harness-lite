// The closed check of `ToolAuthorLimits` for an untrusted input. The contract package keeps its
// shape helpers private, so this package has its own small reader.
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import type { ToolAuthorLimits } from '@omne-harness/tool-contract'

export type Rejection = Readonly<{ field: string; reason: string }>

const LIMIT_FIELDS = [
  'authorBufferBytes',
  'authorBufferItems',
  'authorWaitHistoryBytes',
  'authorWaitHistoryItems',
] as const satisfies readonly (keyof ToolAuthorLimits)[]

type Slot =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'accessor' }>
  | Readonly<{ kind: 'value'; value: unknown }>

/** Reads one own property without running a getter. */
export function slot(value: object, key: string): Slot {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor === undefined) return { kind: 'absent' }
  if (!('value' in descriptor)) return { kind: 'accessor' }
  return { kind: 'value', value: descriptor.value }
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** Every limit is a positive safe integer and no other own key exists. The result is a frozen copy. */
export function judgeAuthorLimits(
  value: unknown,
  at: string,
): Outcome<ToolAuthorLimits, Rejection> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail({ field: at, reason: 'type' })
  const known = new Set<string>(LIMIT_FIELDS)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !known.has(key))
      return fail({ field: `${at}.${String(key)}`, reason: 'unknown-field' })
  }
  const copy: Partial<Record<keyof ToolAuthorLimits, number>> = {}
  for (const key of LIMIT_FIELDS) {
    const read = slot(value, key)
    const field = `${at}.${key}`
    if (read.kind === 'absent') return fail({ field, reason: 'missing' })
    if (read.kind === 'accessor') return fail({ field, reason: 'accessor' })
    if (typeof read.value !== 'number') return fail({ field, reason: 'type' })
    if (!isPositiveSafeInteger(read.value)) return fail({ field, reason: 'range' })
    copy[key] = read.value
  }
  // Every key of LIMIT_FIELDS was written above, so the partial record is complete.
  return succeed(Object.freeze(copy as ToolAuthorLimits))
}
