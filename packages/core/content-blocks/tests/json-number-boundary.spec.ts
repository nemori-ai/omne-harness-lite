import { expect, test } from 'vitest'
import { copyJsonValue, LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'

test('JSON copying rejects a numeric subclass before executing its source accessor', () => {
  let reads = 0
  class ExternalNumber extends LosslessNumber {
    override get source(): string {
      reads++
      throw new Error('external accessor ran')
    }
  }
  const input = new ExternalNumber('9007199254740993')
  expect(copyJsonValue({ nested: [input] })).toEqual({ failed: 'not_json' })
  expect(() => writeJsonLossless(input)).toThrow(TypeError)
  expect(reads).toBe(0)
  expect(writeJsonLossless(new LosslessNumber('9007199254740993'))).toBe('9007199254740993')
})
