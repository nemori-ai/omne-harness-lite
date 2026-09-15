import { describe, expect, it } from 'vitest'
import { clampTimeout, timeoutOf } from '../dist/index.js'

describe('source timeout baseline', () => {
  it('rejects invalid timer input instead of scheduling a clamped Node timer', () => {
    expect(() => clampTimeout(0, 20, 30)).toThrow()
    expect(clampTimeout(40, 20, 30)).toBe(30)
    expect(timeoutOf({ reason: new Error('unrelated') })).toBeUndefined()
  })
})
