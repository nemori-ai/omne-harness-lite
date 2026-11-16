import { describe, expect, expectTypeOf, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type {
  Access,
  AgentExecutionId,
  AgentJournalReading,
  FinishIntent,
  Reply,
} from '@omne-harness/agent-contract'

const unavailable = {
  kind: 'unavailable',
  owner: 'legacy-reading-double',
  diagnostic: 'a read group that predates readFinish answers nothing',
} as const

const legacy: AgentJournalReading<string> = {
  load: () => Promise.resolve(fail(unavailable)),
  inputs: () => Promise.resolve(fail(unavailable)),
  readReplyAdmissions: () => Promise.resolve(fail(unavailable)),
  query: () => Promise.resolve({ ok: { kind: 'unknown' } }),
  output: {
    read: () => Promise.resolve(fail(unavailable)),
    async *events() {
      yield fail(unavailable)
    },
  },
}

describe('readFinish, the optional finish read of AgentJournalReading', () => {
  it('is absent on an implementer that predates it, and the type accepts that implementer', () => {
    expect(legacy.readFinish).toBeUndefined()
    expect(Object.keys(legacy)).not.toContain('readFinish')
  })

  it('has the shape of the other reads: an Access with the execution in, the FinishIntent or null out', () => {
    expectTypeOf<AgentJournalReading<string>['readFinish']>().toEqualTypeOf<
      | ((
          input: Access<string> & Readonly<{ execution: AgentExecutionId }>,
        ) => Reply<FinishIntent | null>)
      | undefined
    >()
  })
})
