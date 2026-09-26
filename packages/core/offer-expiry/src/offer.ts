import { type Parsed, invalidInput, isOk, ok } from '@omne-harness-lite/identity-values'
import { type Duration, type Instant, addDuration, instantFromRfc3339 } from './time.ts'

/** S-4：两个时刻构成的记录；不含标识，不是邀约的身份。构造后不可变。 */
export interface OfferTiming {
  readonly issuedAt: Instant
  readonly expiresAt: Instant
}

/** 构造入口：`expiresAt = issuedAt + ttl`；跨字段约束 `expiresAt > issuedAt` 在这里兑现（Schema 管不到）。 */
export function timingFrom(issuedAt: Instant, ttl: Duration): Parsed<OfferTiming> | 'unavailable' {
  if (!(ttl > 0)) return invalidInput('OfferTiming: ttl must be positive')
  if (!Number.isSafeInteger(issuedAt + ttl)) return 'unavailable'
  const expiresAt = addDuration(issuedAt, ttl)
  if (!(expiresAt > issuedAt)) return invalidInput('OfferTiming: expiresAt must be after issuedAt')
  return ok({ issuedAt, expiresAt })
}

/** 解析交换表示（两个 RFC 3339 串）；除形状外还校验 S-4 的跨字段约束。 */
export function parseOfferTiming(value: unknown): Parsed<OfferTiming> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidInput('OfferTiming: not an object')
  }
  const record = value as Record<string, unknown>
  if (!Object.keys(record).every(key => key === 'issuedAt' || key === 'expiresAt')) {
    return invalidInput('OfferTiming: unexpected member')
  }
  const issuedAt = instantFromRfc3339(record['issuedAt'])
  if (!isOk(issuedAt)) return invalidInput(`OfferTiming.issuedAt: ${issuedAt.invalidInput}`)
  const expiresAt = instantFromRfc3339(record['expiresAt'])
  if (!isOk(expiresAt)) return invalidInput(`OfferTiming.expiresAt: ${expiresAt.invalidInput}`)
  if (!(expiresAt.ok > issuedAt.ok)) {
    return invalidInput('OfferTiming: expiresAt must be after issuedAt')
  }
  return ok({ issuedAt: issuedAt.ok, expiresAt: expiresAt.ok })
}

/** S-7：终结记录的三个值——唯一允许写入存储的状态类型。 */
export const SETTLED_STATES = ['accepted', 'withdrawn', 'declined'] as const
export type SettledState = (typeof SETTLED_STATES)[number]

/** S-7：派生状态的五个值——只作为 `deriveState` 的返回类型出现，不得成为存储字段（SC-OE-1）。 */
export const OFFER_STATES = ['pending', 'accepted', 'withdrawn', 'declined', 'expired'] as const
export type OfferState = (typeof OFFER_STATES)[number]

export function parseSettledState(value: unknown): Parsed<SettledState> {
  return typeof value === 'string' && (SETTLED_STATES as readonly string[]).includes(value)
    ? ok(value as SettledState)
    : invalidInput('SettledState: unknown value')
}

/** 指向对象的存在性读数（S-19/S-20）：读不到必须传 `'unavailable'`，不得传 `'absent'`。 */
export type TargetExistence = 'exists' | 'absent' | 'unavailable'

export interface DeriveStateInput {
  readonly timing: OfferTiming
  readonly settled: SettledState | null
  readonly now: Instant | 'unavailable'
  readonly target: TargetExistence
}

/**
 * S-8 判定式与求值次序，写死在函数体：
 * ① 有终结记录 ⇒ 原样返回（不看时间、不看存在性——已有答复不改写）；
 * ② `now` 或 `target` 不可用 ⇒ `'unavailable'`（S-20：不可用不得被判成不存在，也不得被判成存在）；
 * ③ `now > expiresAt ∨ target === 'absent'` ⇒ `expired`（严格不等号：`now === expiresAt` 仍可接受）；
 * ④ 否则 `pending`。
 * 纯函数、无缓存（S-9 读时派生）。
 */
export function deriveState(input: DeriveStateInput): OfferState | 'unavailable' {
  if (input.settled !== null) return input.settled
  if (input.now === 'unavailable' || input.target === 'unavailable') return 'unavailable'
  if (input.now > input.timing.expiresAt || input.target === 'absent') return 'expired'
  return 'pending'
}

/** S-13：接受路径上三种「不再可被接受」的来路折成同一个布尔，消费者只能从它映射一个失败值。 */
export function acceptable(state: OfferState): boolean {
  return state === 'pending'
}
