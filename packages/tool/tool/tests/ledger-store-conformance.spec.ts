import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { runConformanceCase } from '@omne-harness/tool-contract/testing'
import {
  createMemoryToolLedgerStoreFixture,
  toolLedgerStoreConformance,
  toolLedgerStoreCompositionConformance,
} from '@omne-harness/tool/testing'

const cases = [...toolLedgerStoreConformance(), ...toolLedgerStoreCompositionConformance()]
describe('public ledger store conformance', () => {
  for (const check of cases)
    it(`${check.clause} ${check.name}`, async () => {
      const fixture = createMemoryToolLedgerStoreFixture()
      try {
        assert.deepEqual(await runConformanceCase(check, fixture), { kind: 'passed' })
      } finally {
        await fixture.close()
      }
    })
})
