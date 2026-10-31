import { describe, expectTypeOf, it } from 'vitest'
import type { TestHostRecord as SuiteTestHostRecord } from '@omne-harness/agent-contract/testing'
import type { TestHostRecord } from '../src/testing/host-record.ts'

// The session-log Journal keeps its own `TestHostRecord`, because `src` does not import another
// package's `/testing` entry. Red when the suite's record gains or loses a branch and the local
// copy does not follow, so a fixture record of the suite could not be passed to the double.
describe('the host record of the session-log Journal', () => {
  it('is assignable both ways with the conformance suite record', () => {
    expectTypeOf<TestHostRecord>().toExtend<SuiteTestHostRecord>()
    expectTypeOf<SuiteTestHostRecord>().toExtend<TestHostRecord>()
  })
})
