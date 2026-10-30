import { describe, expectTypeOf, it } from 'vitest'
import type { RecordFault as SuiteRecordFault } from '@omne-harness/agent-contract/testing'
import type { RecordFault } from '../src/testing/journal-receiving.ts'

// The memory journal keeps its own `RecordFault`, because `src` does not import another package's
// `/testing` entry. Red when the conformance suite's fault gains or loses a branch and the local
// copy does not follow, so a scripted fault of the suite could not be passed to the control.
describe('the scripted record fault of the memory journal', () => {
  it('is assignable both ways with the conformance suite fault', () => {
    expectTypeOf<RecordFault>().toExtend<SuiteRecordFault>()
    expectTypeOf<SuiteRecordFault>().toExtend<RecordFault>()
  })
})
