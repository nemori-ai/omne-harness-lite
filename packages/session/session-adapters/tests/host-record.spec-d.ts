import { describe, expectTypeOf, it } from 'vitest'
import type { TestHostRecord as SuiteTestHostRecord } from '@omne-harness/agent-contract/testing'
import type { TestHostRecord } from '../src/testing/host-record.ts'

describe('the host record of the session-log Journal', () => {
  it('is assignable both ways with the conformance suite record', () => {
    expectTypeOf<TestHostRecord>().toExtend<SuiteTestHostRecord>()
    expectTypeOf<SuiteTestHostRecord>().toExtend<TestHostRecord>()
  })
})
