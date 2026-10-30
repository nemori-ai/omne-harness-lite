import { describe, expectTypeOf, it } from 'vitest'
import type {
  SettlementQualification as SuiteSettlementQualification,
  TestHostRecord as SuiteTestHostRecord,
} from '@omne-harness/agent-contract/testing'
import type { SettlementQualification, TestHostRecord } from '../src/testing/host-record.ts'

// The memory Journal keeps its own copies, because `src` does not import another package's
// `/testing` entry. Red when a suite type gains or loses a branch and the local copy does not
// follow, so a fixture record or qualification of the suite could not be passed to the double.
describe('the fixture input types of the memory Journal', () => {
  it('keeps the host record assignable both ways with the conformance suite', () => {
    expectTypeOf<TestHostRecord>().toExtend<SuiteTestHostRecord>()
    expectTypeOf<SuiteTestHostRecord>().toExtend<TestHostRecord>()
  })

  it('keeps the settlement qualification assignable both ways with the conformance suite', () => {
    expectTypeOf<SettlementQualification>().toExtend<SuiteSettlementQualification>()
    expectTypeOf<SuiteSettlementQualification>().toExtend<SettlementQualification>()
  })
})
