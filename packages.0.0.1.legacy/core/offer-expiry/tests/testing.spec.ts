import { describe, expect, it } from 'vitest'
import { instantFromEpochMs, type Instant } from '../src/index.ts'
import { testClock } from '../src/testing/index.ts'

function at(ms: number): Instant {
  const parsed = instantFromEpochMs(ms)
  if (!('ok' in parsed)) throw new Error(parsed.invalidInput)
  return parsed.ok
}

describe('testClock', () => {
  it('只前推、可切不可用', async () => {
    const clock = testClock(at(1000))
    expect(await clock.now()).toBe(1000)
    clock.advance(5)
    expect(await clock.now()).toBe(1005)
    expect(() => clock.advance(-1)).toThrow(RangeError)
    clock.setUnavailable(true)
    expect(await clock.now()).toBe('unavailable')
    clock.setUnavailable(false)
    expect(await clock.now()).toBe(1005)
  })
})
