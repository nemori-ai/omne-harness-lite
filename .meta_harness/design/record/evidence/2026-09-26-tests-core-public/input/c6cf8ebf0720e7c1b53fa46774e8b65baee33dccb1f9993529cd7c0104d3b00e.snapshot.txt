// `Clock` 形状的测试替身：可控、只前推、可切成不可用。归本包是因为它是 `Clock` 形状的 owner；
// 它不是时间源的实现（那归 infra/clock），也不是 in-memory 基础设施——只是测试夹具。
import type { Clock, Instant } from '../time.ts'

export interface TestClock extends Clock {
  /** 前推指定毫秒；负数抛出——测试替身也不后退。 */
  advance(ms: number): void
  /** 切成不可用／恢复。 */
  setUnavailable(unavailable: boolean): void
  readonly current: Instant
}

export function testClock(start: Instant): TestClock {
  let current = start
  let unavailable = false
  return {
    get current() {
      return current
    },
    now() {
      return unavailable ? 'unavailable' : current
    },
    advance(ms) {
      if (!Number.isInteger(ms) || ms < 0)
        throw new RangeError(`testClock.advance: ms must be a non-negative integer, got ${ms}`)
      current = (current + ms) as Instant
    },
    setUnavailable(value) {
      unavailable = value
    },
  }
}
