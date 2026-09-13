import { describe, expect, it } from 'vitest'
import { deepFreeze, snapshotJsonValue, isJsonValue } from '../dist/support/values.js'
import { deadline, clampTimeout, timeoutOf } from '../dist/support/timeout.js'

describe('source support baseline', () => {
  it('snapshots JSON independently and rejects lossy values', () => {
    const original = { items: [1, { text: 'a' }] }
    const copy = snapshotJsonValue(original)!
    expect(copy).toEqual(original)
    expect(copy).not.toBe(original)
    expect(copy.items).not.toBe(original.items)
    expect(isJsonValue({ value: Number.NaN })).toBe(false)
    expect(snapshotJsonValue({ callback() {} })).toBeUndefined()
    const frozen = deepFreeze(copy)
    expect(Object.isFrozen(frozen.items)).toBe(true)
  })
  it('rejects invalid timer input instead of scheduling a clamped Node timer', () => {
    expect(() => clampTimeout(0, 20, 30)).toThrow()
    expect(clampTimeout(40, 20, 30)).toBe(30)
    expect(timeoutOf({ reason: new Error('unrelated') })).toBeUndefined()
  })
})
