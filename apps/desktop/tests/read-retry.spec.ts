import { describe, expect, it } from 'vitest'
import { readRetryDelayMs, readRetryPolicy } from '../src/page/read-retry.ts'

describe('页面对读不到的再问策略', () => {
  it('failures 1 到 7 各给一个不超过表里对应间隔的非负毫秒数', () => {
    const table = [250, 500, 1_000, 2_000, 4_000, 4_000, 4_000]
    table.forEach((interval, index) => {
      for (let run = 0; run < 20; run += 1) {
        const delay = readRetryDelayMs(index + 1, 0)
        expect(delay).not.toBeNull()
        expect(delay!).toBeGreaterThanOrEqual(0)
        expect(delay!).toBeLessThanOrEqual(interval)
      }
    })
  })

  it('failures 8 给 null：次数用完', () => {
    expect(readRetryDelayMs(8, 0)).toBeNull()
  })

  it('已过 30 秒给 null：时间用完', () => {
    expect(readRetryDelayMs(1, 30_001)).toBeNull()
    expect(readRetryPolicy.maxElapsedMs).toBe(30_000)
  })
})
