import { unwrap } from '@omne-harness-lite/identity-values'
import { describe, expect, it } from 'vitest'
import {
  compareInstants,
  instantFromRfc3339,
  instantToRfc3339,
  parseOfferTiming,
} from '../src/index.ts'

describe('Instant 的交换表示（S-22：RFC 3339，按时间点比较）', () => {
  it('两个不同写法表示同一时刻', () => {
    const utc = unwrap(instantFromRfc3339('2026-09-22T09:00:00Z'))
    const shanghai = unwrap(instantFromRfc3339('2026-09-22T17:00:00+08:00'))
    expect(compareInstants(utc, shanghai)).toBe(0)
  })
  it('字典序与时间序不同的一对，按时间点判', () => {
    const a = unwrap(instantFromRfc3339('2026-09-22T23:00:00-05:00'))
    const b = unwrap(instantFromRfc3339('2026-09-23T01:00:00Z'))
    expect(compareInstants(a, b)).toBe(1)
  })
  it('日期不是时间点；无偏移不是规范形式；不存在的日历值拒绝', () => {
    for (const bad of ['2026-09-22', '2026-09-22T09:00:00', '2026-02-30T00:00:00Z', 42, null]) {
      expect('invalidInput' in instantFromRfc3339(bad)).toBe(true)
    }
  })
  it('规范书写为 UTC 毫秒精度', () => {
    expect(instantToRfc3339(unwrap(instantFromRfc3339('2026-09-22T17:00:00.250+08:00')))).toBe(
      '2026-09-22T09:00:00.250Z',
    )
  })
})

describe('parseOfferTiming（交换表示 + S-4 跨字段约束）', () => {
  it('expiresAt 不晚于 issuedAt 的记录被拒（Schema 放它过，解析器不放）', () => {
    expect(
      'invalidInput' in
        parseOfferTiming({ issuedAt: '2026-09-22T09:00:00Z', expiresAt: '2026-09-22T09:00:00Z' }),
    ).toBe(true)
  })
  it('多出 state 字段被拒（S-7：派生状态不是存储字段）', () => {
    expect(
      'invalidInput' in
        parseOfferTiming({
          issuedAt: '2026-09-22T09:00:00Z',
          expiresAt: '2026-09-29T09:00:00Z',
          state: 'pending',
        }),
    ).toBe(true)
  })
})
