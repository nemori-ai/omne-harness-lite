// The ToolBodyStore suite against its own non-durable double, and against a store that answers
// nothing (the negative control: every case must fail there for the reason it checks).
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  memoryToolBodyStoreFixture,
  runConformanceCase,
  toolBodyStoreConformance,
  type ToolBodyStoreFixture,
} from '@omne-harness/tool-contract/testing'
import type { ToolBodyStore } from '@omne-harness/tool-contract/provider'

const cases = toolBodyStoreConformance()

describe('ToolBodyStore conformance on the memory double', () => {
  it('has cases', () => {
    assert.ok(cases.length > 0)
  })
  for (const check of cases)
    it(`${check.clause} ${check.name}`, async () => {
      assert.deepEqual(await runConformanceCase(check, memoryToolBodyStoreFixture()), {
        kind: 'passed',
      })
    })
})

describe('ToolBodyStore conformance rejects a store that keeps nothing', () => {
  const unavailable = { kind: 'unavailable', diagnostic: 'keeps nothing' } as const
  const empty: ToolBodyStore = {
    durability: 'none',
    put: () => Promise.resolve(unavailable),
    seal: () => Promise.resolve(unavailable),
    read: () => Promise.resolve(unavailable),
    delete: () => Promise.resolve(unavailable),
  }
  for (const check of cases)
    it(`${check.name} fails`, async () => {
      const fixture: ToolBodyStoreFixture = { ...memoryToolBodyStoreFixture(), store: empty }
      await assert.rejects(runConformanceCase(check, fixture), assert.AssertionError)
    })
})
