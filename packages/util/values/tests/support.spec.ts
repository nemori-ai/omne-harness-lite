import { describe, expect, it } from 'vitest'
import { deepFreeze, snapshotJsonValue, isJsonValue } from '../dist/index.js'

describe('source values baseline', () => {
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

})
