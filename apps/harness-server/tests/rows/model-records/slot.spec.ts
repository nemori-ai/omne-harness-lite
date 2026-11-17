import { expect, it } from 'vitest'
import { slot } from '../../../src/rows/model-records/slot.ts'

it('reads nothing before an install, the installed value after it, and nothing after its withdrawal', () => {
  const held = slot<object>()
  expect(held.read()).toBeUndefined()
  const first = {}
  const withdraw = held.install(first)
  expect(held.read()).toBe(first)
  withdraw()
  expect(held.read()).toBeUndefined()
})

it('a withdrawal of an earlier install leaves a later one in place', () => {
  const held = slot<object>()
  const withdrawFirst = held.install({})
  const second = {}
  const withdrawSecond = held.install(second)
  withdrawFirst()
  expect(held.read()).toBe(second)
  withdrawSecond()
  expect(held.read()).toBeUndefined()
})
