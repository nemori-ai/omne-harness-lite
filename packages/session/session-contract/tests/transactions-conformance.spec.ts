// Self-proof of the SessionTransactionPort suite: it passes on the conforming in-memory port and
// on the same port without the second tenant (the cross-tenant case is then not applicable), and
// each case fails under a violating variant that breaks the rule of that case.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import type { SessionTransactionPort } from '@omne-harness/session-contract'
import {
  memorySessionTransactionsFixture,
  sessionTransactionsConformance,
  type SessionTransactionsFixture,
} from '@omne-harness/session-contract/testing'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itPassesLegal,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'

const cases = sessionTransactionsConformance<string>()

const NAMES = {
  create: 'create commits the creation and readWork returns the snapshot',
  recall: 'the same operation with the same input recalls the original receipt',
  conflict: 'the same operation with another input is a conflict',
  tenant: 'another tenant reads denied, the same as for a session that never was',
  accept: 'accept queues an ordinary input and readInput returns it',
  start: 'startRun fixes the first input, opens the Run and keeps the inputs pending',
  runActive: 'a second startRun on an unfinished Run is run-active, and without input no-input',
  handover: 'the hand-over marks the input handed, keeps it pending, and refuses another execution',
  message:
    'the message hand-over records the assistant message, and after the terminal the next input opens another Run',
  history:
    'history pages the entries in commit order, next continues, a cursor of another session is invalid',
  pending: 'pending lists the session while inputs or a Run are open, and omits it afterwards',
  query:
    'queryOperation answers committed with the receipt, and unknown for an operation never seen',
  finish: 'finishRun with an admission rejection fails the Run and releases the first input',
  offPath: 'a kind off the first path is refused unavailable naming #756',
} as const

type Fixture = SessionTransactionsFixture<string>
type Port = SessionTransactionPort<string>

/** A fixture whose port is the conforming port with `build(real)` laid over it. */
function variant(build: (real: Port) => Partial<Port>): () => Fixture {
  return () => {
    const base = memorySessionTransactionsFixture()
    return { ...base, port: { ...base.port, ...build(base.port) } }
  }
}

const legal: readonly LegalProvider<Fixture>[] = [
  { name: 'the conforming in-memory port', fixture: memorySessionTransactionsFixture },
  {
    name: 'the in-memory port without a second tenant',
    fixture: () => {
      const { otherAccess: _other, ...rest } = memorySessionTransactionsFixture()
      return rest
    },
    notApplicable: { [NAMES.tenant]: 'otherAccess' },
  },
]

const variants: readonly Variant<Fixture>[] = [
  {
    name: 'readWork answers the session of another tenant',
    fails: [NAMES.tenant],
    fixture: variant(real => {
      const fixture = memorySessionTransactionsFixture()
      return {
        readWork: async input => {
          const own = await real.readWork(input)
          return 'ok' in own ? own : real.readWork({ ...fixture.access, session: input.session })
        },
      }
    }),
  },
  {
    name: 'a recall is reported as a fresh commit',
    fails: [NAMES.recall],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (
          'ok' in answer &&
          typeof answer.ok === 'object' &&
          answer.ok !== null &&
          'receipt' in answer.ok
        ) {
          const receipt = (answer.ok as { receipt: { recovered: boolean } }).receipt
          return succeed({ ...answer.ok, receipt: { ...receipt, recovered: false } })
        }
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'a conflict is reported as unavailable',
    fails: [NAMES.conflict],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        return 'failure' in answer && answer.failure.kind === 'conflict'
          ? fail({ kind: 'unavailable' as const, owner: 'variant', diagnostic: 'conflict hidden' })
          : answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'queryOperation answers not-committed for an operation never seen',
    fails: [NAMES.query],
    fixture: variant(real => ({
      queryOperation: async input => {
        const answer = await real.queryOperation(input)
        return 'ok' in answer && answer.ok.kind === 'unknown'
          ? succeed({
              kind: 'not-committed' as const,
              exclusion: { owner: 'variant', record: 'x', revision: '1', digest: 'sha256:x' },
            })
          : answer
      },
    })),
  },
  {
    name: 'next ignores the session of the cursor',
    fails: [NAMES.history],
    fixture: variant(real => {
      const fixture = memorySessionTransactionsFixture()
      return {
        history: {
          ...real.history,
          next: input => real.history.next({ ...input, session: fixture.access.session }),
        },
      }
    }),
  },
  {
    name: 'pending never lists a session for its inputs',
    fails: [NAMES.pending],
    fixture: variant(real => ({
      pending: async input => {
        if (input.reason === 'inputs') return succeed({ sessions: [], next: null })
        return real.pending(input)
      },
    })),
  },
  {
    name: 'readInput answers nothing for an accepted input',
    fails: [NAMES.accept],
    fixture: variant(() => ({
      readInput: async () => fail({ kind: 'invalid' as const, field: 'input', reason: 'variant' }),
    })),
  },
  {
    name: 'startRun reports another first input',
    fails: [NAMES.start, NAMES.message],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (input.command.kind === 'startRun' && 'ok' in answer)
          return succeed({ ...(answer.ok as object), first: 'input-other' })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'a second startRun on an unfinished Run is reported as no-input',
    fails: [NAMES.runActive],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if ('failure' in answer && answer.failure.kind === 'run-active')
          return fail({ kind: 'no-input' as const })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'a hand-over of another execution is accepted',
    fails: [NAMES.handover],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (
          'failure' in answer &&
          answer.failure.kind === 'invalid' &&
          answer.failure.field === 'fact.execution'
        )
          return succeed({
            operation: input.command.input.operation,
            revision: '0',
            first: '0',
            last: '0',
            recovered: false,
            source: { owner: 'variant', record: 'x', revision: '1', digest: 'sha256:x' },
          })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'a message after the terminal is accepted',
    fails: [NAMES.message],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (
          'failure' in answer &&
          answer.failure.kind === 'terminal' &&
          input.command.kind === 'recordMessage'
        )
          return succeed({
            operation: input.command.input.operation,
            revision: '0',
            first: '0',
            last: '0',
            recovered: false,
            source: { owner: 'variant', record: 'x', revision: '1', digest: 'sha256:x' },
          })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'finishRun after the terminal is accepted again',
    fails: [NAMES.finish],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (
          'failure' in answer &&
          answer.failure.kind === 'terminal' &&
          input.command.kind === 'finishRun'
        )
          return succeed({
            receipt: {
              operation: input.command.input.operation,
              revision: '0',
              first: '0',
              last: '0',
              recovered: false,
              source: { owner: 'variant', record: 'x', revision: '1', digest: 'sha256:x' },
            },
            terminal: answer.failure.terminal,
          })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'an off-path kind is refused without naming #756',
    fails: [NAMES.offPath],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        return 'failure' in answer && answer.failure.kind === 'unavailable'
          ? fail({ ...answer.failure, diagnostic: 'unsupported' })
          : answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'create answers another session',
    fails: [NAMES.create],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (input.command.kind === 'create' && 'ok' in answer) {
          const created = answer.ok as { state: { session: string } }
          return succeed({
            ...created,
            state: { ...created.state, session: `${created.state.session}-other` },
          })
        }
        return answer
      }) as Port['commit'],
    })),
  },
]

describe('the SessionTransactionPort suite', () => {
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
