import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolAuthorLimits } from '@omne-harness/tool-contract/provider'
import { readOwnSlot, type OwnSlot } from '@omne-harness/tool-contract/binding'

export type Rejection = Readonly<{ field: string; reason: string }>

const LIMIT_FIELDS = [
  'authorBufferBytes',
  'authorBufferItems',
  'authorWaitHistoryBytes',
  'authorWaitHistoryItems',
] as const satisfies readonly (keyof ToolAuthorLimits)[]

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function limitOf(read: OwnSlot): Outcome<number, string> {
  if (read.kind === 'absent') return fail('missing')
  if (read.kind === 'accessor') return fail('accessor')
  if (typeof read.value !== 'number') return fail('type')
  return isPositiveSafeInteger(read.value) ? succeed(read.value) : fail('range')
}

function unknownKey(value: object): string | undefined {
  const known: ReadonlySet<PropertyKey> = new Set(LIMIT_FIELDS)
  const key = Reflect.ownKeys(value).find(candidate => !known.has(candidate))
  return key === undefined ? undefined : String(key)
}

export function judgeAuthorLimits(
  value: unknown,
  at: string,
): Outcome<ToolAuthorLimits, Rejection> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail({ field: at, reason: 'type' })
  const unknown = unknownKey(value)
  if (unknown !== undefined) return fail({ field: `${at}.${unknown}`, reason: 'unknown-field' })
  const copy: Partial<Record<keyof ToolAuthorLimits, number>> = {}
  for (const key of LIMIT_FIELDS) {
    const limit = limitOf(readOwnSlot(value, key))
    if ('failure' in limit) return fail({ field: `${at}.${key}`, reason: limit.failure })
    copy[key] = limit.ok
  }
  return succeed(Object.freeze(copy as ToolAuthorLimits))
}
