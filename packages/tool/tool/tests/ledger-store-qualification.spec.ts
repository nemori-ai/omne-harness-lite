import assert from 'node:assert/strict'
import { it } from 'vitest'
import { createToolLedger } from '@omne-harness/tool'
import {
  createMemoryToolLedgerStoreFixture,
  createTestInvocationSource,
} from '@omne-harness/tool/testing'
import {
  createMemoryToolClock,
  createMemoryToolOutputCustody,
  createMemoryToolEnvironment,
  NotApplicable,
  testingTenant,
  runConformanceCase,
} from '@omne-harness/tool-contract/testing'
import { compositionCases } from '../src/testing-ledger-composition-cases.ts'
import type { LedgerAssemblyDependencies } from '../src/testing-ledger-assembly.ts'

it('qualification oracle rejects a real ledger assembled with an always-allow guard', async () => {
  const dependencies: LedgerAssemblyDependencies = {
    tenant: testingTenant,
    missing: handle => {
      throw new NotApplicable(handle)
    },
    source: createTestInvocationSource,
    clock: createMemoryToolClock,
    custody: createMemoryToolOutputCustody,
    environment: createMemoryToolEnvironment,
    createLedger: (store, guards, clock, configuration, ports) =>
      createToolLedger(
        store,
        { ...guards, access: { qualify: async () => ({ kind: 'allowed' }) } },
        clock,
        configuration,
        ports,
      ),
  }
  const check = compositionCases(dependencies).find(item => item.name === 'ledger.qualification')
  assert.ok(check)
  const fixture = createMemoryToolLedgerStoreFixture()
  try {
    await assert.rejects(
      () => runConformanceCase(check, fixture),
      error => {
        assert.ok(error instanceof assert.AssertionError)
        assert.ok(
          error.message.includes('foreign or revoked subject must receive only denied'),
          error.message,
        )
        return true
      },
    )
  } finally {
    await fixture.close()
  }
})
