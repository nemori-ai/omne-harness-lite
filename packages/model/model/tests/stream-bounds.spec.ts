import { expect, it } from 'vitest'
import { measureStreamValue, createStreamBudget, checkStreamLimits } from '../src/stream-bounds.ts'
import type { ModelObservationLimits } from '../src/stream-types.ts'

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

const explicitLimits = {
  maxSnapshotBytes: 1,
  maxDeltaBytes: 1,
  maxQueuedFrames: 1,
  maxQueuedBytes: 1,
  maxObserversPerTenant: 1,
  maxObservers: 1,
  maxPendingSourceOperations: 1,
  maxRetainedCalls: 1,
  maxRetainedBytes: 1,
  maxTotalBytes: 1,
  maxQueueResidenceMs: 1,
  checkIntervalMs: 1,
} satisfies ModelObservationLimits

it.each(Object.keys(explicitLimits))('requires an explicit positive safe integer for %s', field => {
  expect(() => checkStreamLimits(explicitLimits)).not.toThrow()
  for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined]) {
    expect(() => checkStreamLimits({ ...explicitLimits, [field]: value })).toThrow(field)
  }
})
