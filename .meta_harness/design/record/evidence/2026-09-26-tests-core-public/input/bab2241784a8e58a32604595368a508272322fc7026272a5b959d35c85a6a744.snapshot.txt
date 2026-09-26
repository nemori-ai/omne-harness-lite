import { describe, expectTypeOf, it } from 'vitest'
import type { Clock, Instant, OfferState, SettledState } from '../src/index.ts'

describe('编译期挡住的条款', () => {
  it('S-7：SettledState 恰两值、OfferState 恰四值，且 OfferState 不可赋给 SettledState', () => {
    expectTypeOf<SettledState>().toEqualTypeOf<'accepted' | 'withdrawn'>()
    expectTypeOf<OfferState>().toEqualTypeOf<'pending' | 'accepted' | 'withdrawn' | 'expired'>()
    expectTypeOf<OfferState>().not.toMatchTypeOf<SettledState>()
  })
  it('S-16：Clock.now 的返回带 unavailable 支，消费者无法不接', () => {
    expectTypeOf<ReturnType<Clock['now']>>().toEqualTypeOf<Instant | 'unavailable'>()
  })
  it('Instant 是品牌化数值，普通 number 不能直接当时间点', () => {
    expectTypeOf<number>().not.toMatchTypeOf<Instant>()
  })
})
