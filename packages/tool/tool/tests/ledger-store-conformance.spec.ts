import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { runConformanceCase } from '@omne-harness/tool-contract/testing'
import {
  createMemoryToolLedgerStoreFixture,
  toolLedgerStoreConformance,
  toolLedgerStoreCompositionConformance,
} from '@omne-harness/tool/testing'
import { wrappedFixture } from './ledger-store-negative-values.ts'

const cases = [...toolLedgerStoreConformance(), ...toolLedgerStoreCompositionConformance()]
function unorderedFixture() {
  let reads = 0
  return wrappedFixture(store => ({
    ...store,
    read: async domain => {
      const read = await store.read(domain)
      reads += 1
      return read.kind === 'complete'
        ? {
            ...read,
            records: Object.freeze(reads % 2 === 0 ? read.records.toReversed() : [...read.records]),
          }
        : read
    },
  }))
}
function freezeDeep(value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  for (const key of Reflect.ownKeys(value)) freezeDeep(Reflect.get(value, key))
  Object.freeze(value)
}
function frozenFixture() {
  return wrappedFixture(store => ({
    ...store,
    read: async domain => {
      const read = await store.read(domain)
      freezeDeep(read)
      return read
    },
  }))
}
for (const scenario of [
  { name: 'public ledger store conformance', fixture: createMemoryToolLedgerStoreFixture },
  {
    name: 'public ledger store conformance with unordered read records',
    fixture: unorderedFixture,
  },
  { name: 'public ledger store conformance with deeply frozen snapshots', fixture: frozenFixture },
])
  describe(scenario.name, () => {
    for (const check of cases)
      it(`${check.clause} ${check.name}`, async () => {
        const fixture = scenario.fixture()
        try {
          assert.deepEqual(await runConformanceCase(check, fixture), { kind: 'passed' })
        } finally {
          await fixture.close()
        }
      })
  })
