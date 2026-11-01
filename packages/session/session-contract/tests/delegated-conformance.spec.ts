// Self-proof of the delegated-view suite: it passes on the in-memory pair, and each case fails
// under a variant that breaks the rule of that case (one check per face operation, no call outside
// the checked tenant, session or command, the bound evidence on the record).
import { fail } from '@omne-harness/operation-result'
import { describe, it } from 'vitest'
import type {
  SessionCheckedAccess,
  SessionDelegatedTransactions,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import {
  evidence,
  memorySessionDelegatedTransactionsFixture,
  sessionDelegatedTransactionsConformance,
  type SessionDelegatedTransactionsFixture,
} from '@omne-harness/session-contract/testing'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itPassesLegal,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'

type Fixture = SessionDelegatedTransactionsFixture<string>
type Port = SessionTransactionPort<string>

const cases = sessionDelegatedTransactionsConformance<string>()

const NAMES = {
  serve:
    'a view serves the checked face operation without asking the access check, on the store of the public port',
  outside:
    'a view answers denied to another session or another tenant, without asking the access check',
  command:
    'a view commits only the checked command: another input, operation or a read binding is denied',
  retry: 'a changed retry with a fresh expected stays bound to the checked command',
  evidence: 'a view commit stores the bound evidence with the operation record',
  refusals: 'a view answers denied to pending, references, releasedScopes and commitEntries',
} as const

/** A fixture whose `delegated.bind` is the real one with `build` laid over the bound view. */
function variant(
  build: (view: Port, fixture: Fixture, checked: SessionCheckedAccess<string>) => Partial<Port>,
): () => Fixture {
  return () => {
    const base = memorySessionDelegatedTransactionsFixture()
    const delegated: SessionDelegatedTransactions<string> = {
      bind: checked => {
        const view = base.delegated.bind(checked)
        return { ...view, ...build(view, base, checked) }
      },
    }
    return { ...base, delegated }
  }
}

const legal: readonly LegalProvider<Fixture>[] = [
  { name: 'the in-memory pair', fixture: memorySessionDelegatedTransactionsFixture },
  {
    name: 'the in-memory pair without an evidence readback',
    fixture: () => {
      const { decisionOf: _decisionOf, ...rest } = memorySessionDelegatedTransactionsFixture()
      return rest
    },
    notApplicable: { [NAMES.evidence]: 'decisionOf' },
  },
]

const variants: readonly Variant<Fixture>[] = [
  {
    name: 'the view is the public port, which asks the access check at each call',
    fails: Object.values(NAMES),
    fixture: () => {
      const base = memorySessionDelegatedTransactionsFixture()
      return { ...base, delegated: { bind: () => base.transactions } }
    },
  },
  {
    name: 'the view reads the checked session whatever session or tenant the call names',
    fails: [NAMES.outside],
    fixture: variant((view, fixture) => ({
      readWork: input => view.readWork({ ...input, ...fixture.access, principal: input.principal }),
    })),
  },
  {
    name: 'a refused view commit falls back to the public port',
    fails: [NAMES.outside, NAMES.command],
    fixture: variant((view, fixture) => ({
      commit: (async input => {
        const answer = await view.commit(input)
        return 'failure' in answer && answer.failure.kind === 'denied'
          ? fixture.transactions.commit(input)
          : answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'the view binds the command with its expected',
    fails: [NAMES.retry],
    fixture: variant((view, _fixture, checked) => ({
      commit: (async input => {
        const bound =
          'command' in checked.request.target ? checked.request.target.command.input : null
        const expected = (value: unknown) => (value as { expected?: unknown } | null)?.expected
        return expected(bound) !== expected(input.command.input)
          ? fail({ kind: 'denied' as const, action: input.command.kind })
          : view.commit(input)
      }) as Port['commit'],
    })),
  },
  {
    name: 'the view stores other evidence than the bound one',
    fails: [NAMES.evidence],
    fixture: () => {
      const base = memorySessionDelegatedTransactionsFixture()
      return {
        ...base,
        delegated: {
          bind: checked => base.delegated.bind({ ...checked, evidence: evidence('access/other') }),
        },
      }
    },
  },
  {
    name: 'the view lists pending sessions through the public port',
    fails: [NAMES.refusals],
    fixture: variant((_view, fixture) => ({
      pending: input => fixture.transactions.pending(input),
    })),
  },
]

describe('sessionDelegatedTransactionsConformance', () => {
  it('names each case once, under its SPEC clause', () => {
    expectWellFormed(cases)
  })
  it('has a violating variant for every case', () => {
    expectEveryCaseIsCaught(cases, variants)
  })
  itPassesLegal(cases, legal)
  itFailsExactly(cases, variants)
})
