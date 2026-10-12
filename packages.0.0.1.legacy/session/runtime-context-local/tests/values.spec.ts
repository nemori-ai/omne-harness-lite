import { expect, test } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { identity } from '../src/values.ts'

test('context revision identity compares exact JSON values, not numeric spellings or object order', () => {
  expect(
    identity({ values: [new LosslessNumber('-0'), new LosslessNumber('1.00e2')], other: true }),
  ).toBe(identity({ other: true, values: [0, 100] }))
  expect(identity({ value: new LosslessNumber('9007199254740993') })).not.toBe(
    identity({ value: new LosslessNumber('9007199254740992') }),
  )
  expect(identity([1, 2])).not.toBe(identity([2, 1]))
})
