// The optional finish read of the Journal read group (SPEC "条件终结", the readFinish clause; RFC-0013
// DA3): `readFinish` is an additive member. An implementer written before it satisfies
// `AgentJournalReading` without the member, and a consumer sees `undefined` there, which it treats
// as unsupported. The shape is the one of the other reads: an Access with the execution in, a
// Reply of the FinishIntent or null out. The behavior of a provider that implements it is checked
// by the implementer's own suite (session-adapters, `tests/agent-journal-provider.spec.ts`).
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

/** The read group as an implementer wrote it before `readFinish` existed: the member is absent. */
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
