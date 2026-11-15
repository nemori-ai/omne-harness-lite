import { describe, expectTypeOf, it } from 'vitest'
import type { RecordFault as SuiteRecordFault } from '@omne-harness/agent-contract/testing'
import type { RecordFault } from '../src/testing/journal-receiving.ts'

describe('the scripted record fault of the memory journal', () => {
  it('is assignable both ways with the conformance suite fault', () => {
    expectTypeOf<RecordFault>().toExtend<SuiteRecordFault>()
    expectTypeOf<SuiteRecordFault>().toExtend<RecordFault>()
  })
})
