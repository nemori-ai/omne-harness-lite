import { describe, expect, it } from 'vitest'
import {
  INTAKE_BUDGET_REQUIRED,
  INTAKE_GUARD_OWNER,
  admitSource,
  budgetTermsOf,
  commitWithinBudget,
  intakeTermsOf,
  withIntakeTerms,
  type BudgetTerms,
  type IntakeSubject,
  type SessionCommand,
  type SessionIntakeBudget,
  type SessionIntakeLimits,
} from '@omne-harness/session-contract'
import {
  TESTING_DECLARATIONS,
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
import { admitInput } from '../src/decide-intake.ts'
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

describe('the budget of the tenant is read when the answer depends on it (SE-28)', () => {
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

  it('admits the first input while the budget cannot be read: every limit a tenant can set admits it', async () => {
    const s = await scene('throws')
    succeeded(await s.accept('one'), 'one')
  })

  it('still judges the size of an input while no input waits, on the limit of the writer', async () => {
    const s = await scene(null)
    const big = ordinaryInput('big')
    const block = { ...big.message.blocks[0]!, text: 'x'.repeat(OWN.maxInputBytes) }
    const value = { ...big, message: { ...big.message, blocks: [block] } } as typeof big
    expect(refused(await s.accept('big', value), 'big')).toEqual({
      kind: 'limited',
      resource: 'input-bytes',
      limit: OWN.maxInputBytes,
    })
  })

  it.each([
    ['cannot be read', null],
    ['throws', 'throws'],
    ['gives a value that is not a budget', { maxPendingInputs: 0, maxInputBytes: 4096 }],
  ] as const)(
    'answers unavailable once an input waits and the budget %s, and admits again when it can be read',
    async (_label, broken) => {
      const s = await scene(broken)
      succeeded(await s.accept('one'), 'one')
      expect(refused(await s.accept('two'), 'two')).toEqual(UNAVAILABLE)
      s.state.answer = limit(2)
      succeeded(await s.accept('two'), 'two again')
      expect(refused(await s.accept('three'), 'three')).toMatchObject({ kind: 'limited', limit: 2 })
    },
  )

  it('admits an input that does not count toward the budget while one waits and the budget cannot be read', async () => {
    const s = await scene(null)
    succeeded(await s.accept('one'), 'one')
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
    const deferred = { budget: { kind: 'deferred' } } as const
    expect(intakeTermsOf(withIntakeTerms([], deferred))).toEqual(deferred)
  })
})

describe('what the decider answers on the budget terms it is given', () => {
  const input = ordinaryInput('judged')
  const person = TESTING_DECLARATIONS.find(item => item.name === input.source)!
  const admitted = admitSource(person, { kind: 'member' }, {})
  if (admitted.kind !== 'admitted') throw new Error('the testing person source admits a member')
  const judged = (budget: BudgetTerms | undefined, pending: number) => {
    const source = { kind: 'admitted', source: admitted.source } as const
    const intake = budget === undefined ? { source } : { source, budget }
    return admitInput(input, pending, { reads: { intake } as never, limits: OWN }, 'value')
  }
  const refusal = (answer: unknown) => (answer as { failure?: unknown }).failure

  it('admits on unread terms while no input waits, and says the answer depends on them once one waits', () => {
    expect(judged({ kind: 'deferred' }, 0)).toEqual({ source: admitted.source })
    expect(refusal(judged({ kind: 'deferred' }, 1))).toEqual({
      kind: 'unavailable',
      owner: INTAKE_GUARD_OWNER,
      diagnostic: INTAKE_BUDGET_REQUIRED,
    })
  })

  it('tells unread terms from terms that could not be read', () => {
    expect(judged({ kind: 'unavailable' }, 0)).toEqual({ source: admitted.source })
    expect(refusal(judged({ kind: 'unavailable' }, 1))).toEqual(UNAVAILABLE)
    expect(INTAKE_BUDGET_REQUIRED).not.toBe(UNAVAILABLE.diagnostic)
  })

  it('judges on the given budget, and on the limits of the writer when no terms of a budget came', () => {
    expect(refusal(judged({ kind: 'given', limits: limit(1) }, 1))).toMatchObject({ limit: 1 })
    expect(judged({ kind: 'given', limits: limit(2) }, 1)).toEqual({ source: admitted.source })
    expect(judged(undefined, OWN.maxPendingInputs - 1)).toEqual({ source: admitted.source })
    expect(refusal(judged(undefined, OWN.maxPendingInputs))).toMatchObject({
      limit: OWN.maxPendingInputs,
    })
  })
})

describe('a commit within the budget of the tenant', () => {
  const input = {
    kind: 'accept',
    input: { ...base, operation: operationId('w'), value: ordinaryInput('w') },
  } as SessionCommand
  const required = {
    failure: { kind: 'unavailable', owner: INTAKE_GUARD_OWNER, diagnostic: INTAKE_BUDGET_REQUIRED },
  } as const
  const port = (): SessionIntakeBudget & { asked: number } => ({
    asked: 0,
    async read() {
      this.asked++
      return limit(5)
    },
  })

  it('commits once and reads nothing when the first attempt does not ask for the budget', async () => {
    for (const first of [
      { ok: 'done' },
      { failure: { kind: 'denied', action: 'accept' } },
    ] as const) {
      const budget = port()
      const seen: unknown[] = []
      const answer = await commitWithinBudget(budget, input, async terms => {
        seen.push(terms)
        return first as never
      })
      expect(answer).toBe(first)
      expect(seen).toEqual([{ kind: 'deferred' }])
      expect(budget.asked).toBe(0)
    }
  })

  it('reads the budget and commits again when the first attempt says the answer depends on it', async () => {
    const budget = port()
    const seen: unknown[] = []
    const answer = await commitWithinBudget(budget, input, async terms => {
      seen.push(terms)
      return (seen.length === 1 ? required : { ok: 'second' }) as never
    })
    expect(answer).toEqual({ ok: 'second' })
    expect(seen).toEqual([{ kind: 'deferred' }, { kind: 'given', limits: limit(5) }])
    expect(budget.asked).toBe(1)
  })

  it('does not take an unavailable answer of another owner or another reason for the marker', async () => {
    for (const failure of [
      { ...required.failure, owner: 'someone-else' },
      { ...required.failure, diagnostic: 'the intake budget of this tenant is not available' },
    ]) {
      const budget = port()
      const answer = await commitWithinBudget(budget, input, async () => ({ failure }) as never)
      expect(answer).toEqual({ failure })
      expect(budget.asked).toBe(0)
    }
  })

  it('commits without terms of a budget when there is no budget port or no input', async () => {
    const seen: unknown[] = []
    const attempt = async (terms: unknown) => {
      seen.push(terms)
      return { ok: null } as never
    }
    await commitWithinBudget(undefined, input, attempt)
    await commitWithinBudget(null, input, attempt)
    const cancel = { kind: 'cancelRun', input: { ...base, operation: operationId('c') } }
    await commitWithinBudget(port(), cancel as unknown as SessionCommand, attempt)
    expect(seen).toEqual([undefined, undefined, undefined])
  })
})
