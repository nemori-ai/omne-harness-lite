import { unwrap } from '@omne-harness-lite/identity-values'
import { describe, expect, it } from 'vitest'
import {
  type Instant,
  acceptable,
  deriveState,
  instantFromEpochMs,
  parseOfferTtl,
  timingFrom,
} from '../src/index.ts'

const at = (ms: number): Instant => unwrap(instantFromEpochMs(ms))
const madeTiming = timingFrom(at(1_000), unwrap(parseOfferTtl(500)))
if (madeTiming === 'unavailable') throw new Error('fixture deadline overflow')
const timing = unwrap(madeTiming)

describe('deriveState（S-8 判定式与求值次序）', () => {
  it('终结记录优先：已撤回且时间已过仍是 withdrawn，不是 expired', () => {
    expect(deriveState({ timing, settled: 'withdrawn', now: at(9_999), target: 'exists' })).toBe(
      'withdrawn',
    )
    expect(deriveState({ timing, settled: 'accepted', now: at(9_999), target: 'absent' })).toBe(
      'accepted',
    )
  })
  it('严格不等号：now === expiresAt 仍可接受', () => {
    expect(deriveState({ timing, settled: null, now: at(1_500), target: 'exists' })).toBe('pending')
    expect(deriveState({ timing, settled: null, now: at(1_501), target: 'exists' })).toBe('expired')
  })
  it('指向对象不存在 ⇒ expired，即使时间未到', () => {
    expect(deriveState({ timing, settled: null, now: at(1_100), target: 'absent' })).toBe('expired')
  })
  it('S-20：now 或 target 不可用 ⇒ unavailable，不是 pending 也不是 expired', () => {
    expect(deriveState({ timing, settled: null, now: 'unavailable', target: 'exists' })).toBe(
      'unavailable',
    )
    expect(deriveState({ timing, settled: null, now: at(9_999), target: 'unavailable' })).toBe(
      'unavailable',
    )
  })
  it('S-20 与终结记录的次序：有终结记录时即使不可用也返回终结记录（①在②之前）', () => {
    expect(
      deriveState({ timing, settled: 'accepted', now: 'unavailable', target: 'unavailable' }),
    ).toBe('accepted')
  })
})

describe('acceptable（S-13）', () => {
  it('pending 为真；三种来路同一个 false', () => {
    expect(acceptable('pending')).toBe(true)
    expect(acceptable('expired')).toBe(false)
    expect(acceptable('withdrawn')).toBe(false)
    expect(acceptable('accepted')).toBe(false)
  })
})

describe('timingFrom / parseOfferTtl（S-4 / S-14）', () => {
  it('expiresAt = issuedAt + ttl', () => {
    expect(timing).toEqual({ issuedAt: 1_000, expiresAt: 1_500 })
  })
  it('非正、非有限、非整数、不合形状 ⇒ invalidInput', () => {
    for (const bad of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1.5,
      'abc',
      'P',
      'PT',
      null,
      {},
      true,
    ]) {
      expect('invalidInput' in parseOfferTtl(bad)).toBe(true)
    }
  })
  it('ISO 8601 时长：P7D、PT1H30M、P2W', () => {
    expect(unwrap(parseOfferTtl('P7D'))).toBe(7 * 86_400_000)
    expect(unwrap(parseOfferTtl('PT1H30M'))).toBe(90 * 60_000)
    expect(unwrap(parseOfferTtl('P2W'))).toBe(14 * 86_400_000)
  })
  it('缺席不进解析器：undefined 被当作非法（分流是调用方的事）', () => {
    expect('invalidInput' in parseOfferTtl(undefined)).toBe(true)
  })
})

describe('OE2 decline / overflow', () => {
  it('declined remains final without clock or target and cannot be accepted', () => {
    expect(
      deriveState({ timing, settled: 'declined', now: 'unavailable', target: 'unavailable' }),
    ).toBe('declined')
    expect(acceptable('declined')).toBe(false)
  })
  it('valid positive ttl with unrepresentable deadline is unavailable', () => {
    expect(timingFrom(at(Number.MAX_SAFE_INTEGER - 1), unwrap(parseOfferTtl(2)))).toBe(
      'unavailable',
    )
  })
})
