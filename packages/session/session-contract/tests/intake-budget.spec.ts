import { describe, expect, it } from 'vitest'
import {
  budgetTermsOf,
  intakeTermsOf,
  withIntakeTerms,
  type IntakeSubject,
  type SessionCommand,
  type SessionIntakeBudget,
  type SessionIntakeLimits,
} from '@omne-harness/session-contract'
import {
  TESTING_SOURCES,
  TESTING_SYSTEM_COMPONENT,
  createMemoryInitializationSource,
  createMemorySessionHistorySource,
  createMemorySessionTransactions,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  memoryAccess,
  operationId,
  ordinaryInput,
  refused,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { initializationGuards } from './initialization-fixture.ts'

const access = memoryAccess('budget-test')
const base = { tenant: access.tenant, session: access.session }
const SYSTEM: IntakeSubject = { kind: 'system', component: TESTING_SYSTEM_COMPONENT }
const OWN: SessionIntakeLimits = { maxPendingInputs: 8, maxInputBytes: 4096 }

type Answer = SessionIntakeLimits | null | 'throws'

async function scene(first: Answer) {
  const initialization = createMemoryInitializationSource()
  const state: { answer: Answer; subject: IntakeSubject; asked: number } = {
    answer: first,
    subject: { kind: 'member' },
    asked: 0,
  }
  const budget: SessionIntakeBudget = {
    async read(tenant) {
      expect(tenant).toEqual(access.tenant)
      state.asked++
      if (state.answer === 'throws') throw new Error('the budget source is down')
      return state.answer
    },
  }
  const port = createMemorySessionTransactions({
    initialization,
    history: createMemorySessionHistorySource(),
    accessCheck: createPolicySessionAccessCheck(() => ({
      kind: 'allowed',
      evidence: evidence('access'),
      subject: state.subject,
    })),
    subjects: 'strict',
    intakeLimits: OWN,
    budget,
  })
  const command = {
    kind: 'create',
    input: { ...base, operation: operationId('create'), creation: creation({ initial: null }) },
  } satisfies SessionCommand
  const guards = initializationGuards(command, null)
  initialization.controls.register(command, guards[0]!)
  const prepared = succeeded(await initialization.prepare(command), 'prepare')
  succeeded(await port.commit({ access, command, guards: prepared }), 'create')
  const accept = (name: string, value = ordinaryInput(name)) =>
    port.commit({
      access,
      guards: [],
      command: { kind: 'accept', input: { ...base, operation: operationId(name), value } },
    })
  return { state, accept }
}

function reminder(name: string) {
  const input = ordinaryInput(name)
  return {
    ...input,
    source: TESTING_SOURCES.system,
    message: { ...input.message, role: 'system_reminder' },
  } as typeof input
}

const limit = (maxPendingInputs: number): SessionIntakeLimits => ({ ...OWN, maxPendingInputs })
const UNAVAILABLE = {
  kind: 'unavailable',
  owner: 'session-intake',
  diagnostic: 'the intake budget of this tenant is not available',
}

describe('the budget of ordinary inputs is read for the tenant at each commit (SE-28)', () => {
  it('judges an input on the budget of the tenant, not on the limits of the writer', async () => {
    const s = await scene(limit(1))
    succeeded(await s.accept('one'), 'one')
    expect(refused(await s.accept('two'), 'two')).toEqual({
      kind: 'limited',
      resource: 'pending-inputs',
      limit: 1,
    })
  })

  it('judges the next input on the value of now: a smaller budget refuses, a larger one admits', async () => {
    const s = await scene(limit(3))
    succeeded(await s.accept('one'), 'one')
    succeeded(await s.accept('two'), 'two')
    s.state.answer = limit(2)
    expect(refused(await s.accept('three'), 'three')).toMatchObject({ kind: 'limited', limit: 2 })
    s.state.answer = limit(3)
    succeeded(await s.accept('three'), 'three again')
    expect(s.state.asked).toBe(4)
  })

  it.each([
    ['cannot be read', null],
    ['throws', 'throws'],
    ['gives a value that is not a budget', { maxPendingInputs: 0, maxInputBytes: 4096 }],
  ] as const)(
    'answers unavailable when the budget %s, admits nothing, and admits again when it can be read',
    async (_label, broken) => {
      const s = await scene(broken)
      expect(refused(await s.accept('one'), 'one')).toEqual(UNAVAILABLE)
      s.state.answer = limit(1)
      succeeded(await s.accept('one'), 'one again')
      expect(refused(await s.accept('two'), 'two')).toMatchObject({ kind: 'limited', limit: 1 })
    },
  )

  it('admits an input that does not count toward the budget while the budget cannot be read', async () => {
    const s = await scene(null)
    s.state.subject = SYSTEM
    succeeded(await s.accept('reminder', reminder('reminder')), 'reminder')
  })

  it('reads no budget for a command that carries no input', async () => {
    const command = {
      kind: 'cancelRun',
      input: { ...base, operation: operationId('cancel') },
    } as unknown as SessionCommand
    const budget = { read: async () => limit(1) }
    expect(await budgetTermsOf(budget, command)).toBeUndefined()
    expect(await budgetTermsOf(null, command)).toBeUndefined()
  })

  it('drops terms whose budget is not a budget: the input is unavailable, never judged on a guess', () => {
    const terms = { budget: { kind: 'given', limits: { maxPendingInputs: -1, maxInputBytes: 1 } } }
    expect(intakeTermsOf(withIntakeTerms([], terms as never))).toBeNull()
    const other = { budget: { kind: 'other' } }
    expect(intakeTermsOf(withIntakeTerms([], other as never))).toBeNull()
    const fine = { budget: { kind: 'unavailable' } } as const
    expect(intakeTermsOf(withIntakeTerms([], fine))).toEqual(fine)
  })
})
