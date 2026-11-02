import { expect, it } from 'vitest'
import { measureStreamValue, createStreamBudget } from '../src/stream-bounds.ts'

it('counts canonical UTF-8 bytes and nodes without building the encoded payload', () => {
  const value = { z: ['汉', '\n', '\ud800'], a: true }
  const text = JSON.stringify({ a: true, z: value.z })
  expect(measureStreamValue(value, Buffer.byteLength(text))).toEqual({
    bytes: Buffer.byteLength(text),
    nodes: 6,
    containers: 2,
  })
  expect(measureStreamValue(value, Buffer.byteLength(text) - 1)).toBeNull()
})

it('allows exact capacity and returns each reservation exactly once', () => {
  const budget = createStreamBudget(12)
  const release = budget.reserve(12)
  expect(release).not.toBeNull()
  expect(budget.reserve(1)).toBeNull()
  release?.()
  release?.()
  expect(budget.used()).toBe(0)
})
