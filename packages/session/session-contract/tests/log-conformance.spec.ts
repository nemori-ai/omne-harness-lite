// Self-proof of the commitLog suite: it passes on the conforming in-memory double and on the same
// double without its optional handles (the cases that need them are then not applicable), and each
// case fails under a violating variant that breaks the rule of that case.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import type { SessionLogReceipt } from '@omne-harness/session-contract'
import {
  evidence,
  memorySessionLogFixture,
  sessionLogConformance,
  type SessionLogFixture,
} from '@omne-harness/session-contract/testing'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itPassesLegal,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'

const cases = sessionLogConformance<string>()

const NAMES = {
  commit:
    'commitLog commits the consequence with its progress and the receipt names the saved interpretation',
  recall:
    'the same operation with the same observation recalls the original receipt and writes nothing',
  conflict: 'the same operation with another observation is a conflict and writes nothing',
  sequence:
    'an event at or below the saved progress recalls the original interpretation and commits nothing',
  progress:
    'the progress continues from the saved one, and each commit saves its own interpretation',
  tenant:
    'another tenant reads denied, the same as for a session that never was, and nothing is written',
  head: 'a head that is not the original execution head is invalid and writes nothing',
  observed: 'an observation without a Session consequence is invalid and writes nothing',
  interleave:
    'two commits of one interpretation that interleave publish it once, and the loser recalls or answers changed',
  delegated: 'a delegated view that has commitLog answers denied and writes nothing',
} as const

type Fixture = SessionLogFixture<string>
type Commit = Fixture['port']['commitLog']

/** A fixture whose `commitLog` is `build(real, fixture)`, everything else the conforming double. */
function variant(build: (real: Commit, fixture: Fixture) => Commit): () => Fixture {
  return () => {
    const base = memorySessionLogFixture()
    return { ...base, port: { ...base.port, commitLog: build(base.port.commitLog, base) } }
  }
}

const placeholder = (receipt: SessionLogReceipt): SessionLogReceipt => ({
  ...receipt,
  interpreted: evidence('log/placeholder'),
})

const legal: readonly LegalProvider<Fixture>[] = [
  { name: 'the conforming in-memory double', fixture: memorySessionLogFixture },
  {
    name: 'the in-memory double without a second tenant',
    fixture: () => {
      const { otherAccess: _other, ...rest } = memorySessionLogFixture()
      return rest
    },
    notApplicable: { [NAMES.tenant]: 'otherAccess' },
  },
  {
    name: 'the in-memory double without a delegated view',
    fixture: () => {
      const { delegatedView: _view, ...rest } = memorySessionLogFixture()
      return rest
    },
    notApplicable: { [NAMES.delegated]: 'delegatedView' },
  },
]

const variants: readonly Variant<Fixture>[] = [
  {
    name: 'the commit reads the tenant of the caller from the fixture, not from the observation',
    fails: [NAMES.tenant],
    fixture: variant(
      (real, fixture) => input =>
        real({ observation: { ...input.observation, tenant: fixture.access.tenant } }),
    ),
  },
  {
    name: 'the commit does not check the head: it commits against the head that exists',
    fails: [NAMES.head],
    fixture: variant(
      real => input =>
        real({
          observation: { ...input.observation, revision: input.observation.sequence ?? '0' },
        }),
    ),
  },
  {
    name: 'a recall is reported as a fresh commit',
    fails: [NAMES.recall, NAMES.sequence, NAMES.interleave],
    fixture: variant(real => async input => {
      const answer = await real(input)
      return 'ok' in answer ? succeed({ ...answer.ok, recovered: false }) : answer
    }),
  },
  {
    name: 'a conflict is reported as unavailable',
    fails: [NAMES.conflict],
    fixture: variant(real => async input => {
      const answer = await real(input)
      return 'failure' in answer && answer.failure.kind === 'conflict'
        ? fail({ kind: 'unavailable', owner: 'variant', diagnostic: 'conflict hidden' })
        : answer
    }),
  },
  {
    name: 'the saved interpretation is a placeholder: the head receipt of the event',
    fails: [NAMES.commit],
    fixture: variant(real => async input => {
      const answer = await real(input)
      return 'ok' in answer
        ? succeed({ ...answer.ok, interpreted: input.observation.executionEvidence })
        : answer
    }),
  },
  {
    name: 'the receipt does not move the progress',
    fails: [NAMES.commit, NAMES.progress],
    fixture: variant(real => async input => {
      const answer = await real(input)
      return 'ok' in answer ? succeed({ ...answer.ok, readThrough: '0' }) : answer
    }),
  },
  {
    name: 'an observation without a consequence answers a receipt',
    fails: [NAMES.observed],
    fixture: variant(real => async input => {
      const answer = await real(input)
      return 'failure' in answer &&
        answer.failure.kind === 'invalid' &&
        input.observation.consequences.every(item => item.kind === 'observed')
        ? succeed(
            placeholder({
              operation: input.observation.operation,
              execution: input.observation.execution,
              readThrough: '0',
              interpreted: input.observation.source,
              recovered: false,
            }),
          )
        : answer
    }),
  },
  {
    name: 'a loser of an interleaved commit claims to have written',
    fails: [NAMES.interleave],
    fixture: variant(real => async input => {
      const answer = await real(input)
      return 'failure' in answer && answer.failure.kind === 'changed'
        ? succeed({
            operation: input.observation.operation,
            execution: input.observation.execution,
            readThrough: input.observation.sequence ?? '0',
            interpreted: evidence('log/claimed'),
            recovered: false,
          })
        : answer
    }),
  },
  {
    name: 'queryOperation answers a log commit as a committed batch',
    fails: [NAMES.commit],
    fixture: () => {
      const base = memorySessionLogFixture()
      const queryOperation: Fixture['port']['queryOperation'] = async input => {
        const answer = await base.port.queryOperation(input)
        return 'failure' in answer && answer.failure.kind === 'conflict'
          ? succeed({ kind: 'unknown' as const })
          : answer
      }
      return { ...base, port: { ...base.port, queryOperation } }
    },
  },
  {
    name: 'a delegated view commits',
    fails: [NAMES.delegated],
    fixture: () => {
      const base = memorySessionLogFixture()
      return {
        ...base,
        delegatedView: () => ({ ...base.delegatedView!(), commitLog: base.port.commitLog }),
      }
    },
  },
]

describe('the commitLog suite', () => {
  it('is well formed: unique names and a clause for every case', () => {
    expectWellFormed(cases)
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
  })

  itPassesLegal(cases, legal)
  itFailsExactly(cases, variants)

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, variants)
  })
})
