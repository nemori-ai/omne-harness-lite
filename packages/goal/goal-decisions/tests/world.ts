import type { DecisionAsk } from '@omne-harness/goal'
import { accountCodec, organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'
import {
  decisionAnswersBlock,
  resolveModelInvocationRef,
  type DecisionAnswers,
  type FixedModelRequest,
  type ModelRuntime,
  type ResultPart,
  type Settlement,
} from '@omne-harness/model-contract'
import type { ModelDecisionPreparation } from '@omne-harness/model-contract/provider'
import { createGoalDecisions } from '../src/index.ts'

const organization = organizationCodec.parse('org_c0nf0rmance000000000000000')
const account = accountCodec.parse('acc_c0nf0rmance000000000000000')
if (!organization.ok || !account.ok) throw new Error('illegal test tenant')
const LEGAL = tenant(organization.value, account.value)
const encoded = tenantCodec.encode(LEGAL)
if (!encoded.ok) throw new Error('the test tenant has no text')
export const TENANT = encoded.value
export const PRINCIPAL = Object.freeze({ subject: 'the work of the session' })

export const ANSWERS: DecisionAnswers = {
  A1: { type: 'choice', choice: 'holds', probabilities: { holds: 0.97 } },
}
export const ask = (change: Partial<DecisionAsk> = {}): DecisionAsk => ({
  caller: { tenant: TENANT, subject: PRINCIPAL },
  session: 'session-1',
  identity: '1.1.0/0/0/0',
  model: 'openai/gpt-6-luna-decisions',
  request: {
    state: { goal: { purpose: '写 CHANGELOG' } },
    questions: { A1: { type: 'choice', instructions: '成立吗', criteria: { holds: '成立' } } },
  },
  ...change,
})

type Runtime = Pick<ModelRuntime<unknown>, 'calls' | 'consumption'>
type Asked<S extends keyof Runtime, K extends keyof Runtime[S]> = Runtime[S][K] extends (
  input: infer I,
  ...rest: never[]
) => unknown
  ? I
  : never
type Call = {
  request: FixedModelRequest
  consumer: unknown
  /** How many more looks it takes to settle; null: it never does. */
  looks: number | null
  termination: Settlement['termination']
  pages: ResultPart[][]
  acknowledged: { result: unknown; evidence: unknown }[]
  cancelled: boolean
}
export const sealed = (answers: DecisionAnswers): ResultPart[] => [
  { kind: 'sealed', block: decisionAnswersBlock(answers), trims: [] },
]
const AWAY = { failure: { kind: 'unavailable', dependency: 'test', diagnostic: 'away' } } as const
const FULL = {
  failure: { kind: 'unavailable', dependency: 'model-capacity', diagnostic: 'the share is full' },
} as const
const callOf = (reference: unknown): string => {
  const parts = resolveModelInvocationRef(reference, LEGAL)
  if ('failure' in parts) throw new Error('the reference names no call of this tenant')
  return String(parts.ok.call)
}

/** A Model that keeps calls by their id and settles them as a test tells it to. */
export function world() {
  const calls = new Map<string, Call>()
  const log: string[] = []
  const reads: string[] = []
  const operations: string[] = []
  const closed: unknown[] = []
  const prepared: Parameters<ModelDecisionPreparation<unknown>['prepare']>[0][] = []
  const state = {
    time: 0,
    modelAway: false,
    preparationAway: false,
    fail: new Set<'prepare' | 'inspect' | 'beginRead'>(),
    /** The page a read ends at instead of going on; null: it reads every page. */
    endsAt: null as number | null,
    /** How many admissions Model has no room for before it takes one. */
    full: 0,
    refuse: false,
    /** How the next admitted call goes. */
    next: {
      looks: 0 as number | null,
      termination: { kind: 'completed', reason: 'stop' } as Settlement['termination'],
      pages: [sealed(ANSWERS)] as ResultPart[][],
    },
  }
  const settlementOf = (call: Call) =>
    ({ version: 'v1', termination: call.termination, cursor: 'c1', source: {} }) as never
  const reading = (call: Call, at: number) => ({
    kind: 'reading',
    page: {
      parts: call.pages[at] ?? [],
      next: at + 1 < call.pages.length ? String(at + 1) : null,
      settlement: settlementOf(call),
    },
  })
  const model = {
    calls: {
      async inspect(input: Asked<'calls', 'inspect'>) {
        log.push('inspect')
        if (state.fail.has('inspect')) return AWAY
        const call = calls.get(callOf(input.reference))
        if (call === undefined) return { ok: { kind: 'not-accepted' } }
        const settledNow = call.looks === 0
        if (call.looks !== null && call.looks > 0) call.looks -= 1
        const phase = settledNow ? 'settled' : 'running'
        return { ok: { kind: 'found', state: { phase, settlement: settlementOf(call) } } }
      },
      async admit(input: Asked<'calls', 'admit'>) {
        log.push('admit')
        operations.push(String(input.operation))
        if (state.refuse) return { failure: { kind: 'denied', diagnostic: 'not this caller' } }
        if (state.full > 0) {
          state.full -= 1
          return FULL
        }
        const { request, consumer } = input
        const fresh = structuredClone(state.next)
        calls.set(String(input.call), {
          request,
          consumer,
          acknowledged: [],
          cancelled: false,
          ...fresh,
        })
        return { ok: {} }
      },
      async cancel(input: Asked<'calls', 'cancel'>) {
        log.push('cancel')
        operations.push(String(input.operation))
        const call = calls.get(String(input.call))
        if (call !== undefined) call.cancelled = true
        return { ok: {} }
      },
    },
    consumption: {
      async beginRead(input: Asked<'consumption', 'beginRead'>) {
        log.push('beginRead')
        reads.push(String(input.operation))
        if (state.fail.has('beginRead')) return AWAY
        const call = calls.get(callOf(input.reference))
        if (call === undefined) return AWAY
        if (call.acknowledged.length > 0) return { ok: { kind: 'acknowledged', custody: {} } }
        return { ok: { kind: 'started', read: 'read-1', value: reading(call, 0) } }
      },
      async readNext(input: Asked<'consumption', 'readNext'>) {
        log.push('readNext')
        const call = calls.get(String(input.call))
        if (call === undefined) return AWAY
        if (state.endsAt === Number(input.after)) return { ok: { kind: 'ended', reason: 'closed' } }
        return { ok: reading(call, Number(input.after)) }
      },
      async closeRead(input: Asked<'consumption', 'closeRead'>) {
        log.push('closeRead')
        closed.push({ call: String(input.call), read: input.read })
        return { ok: { kind: 'ended', reason: 'closed' } }
      },
      async acknowledge(input: Asked<'consumption', 'acknowledge'>) {
        log.push('acknowledge')
        operations.push(String(input.operation))
        const { result, evidence } = input
        calls.get(String(input.call))?.acknowledged.push({ result, evidence })
        return { ok: {} }
      },
    },
  } as unknown as Runtime
  const preparation: ModelDecisionPreparation<unknown> = {
    async prepare(input) {
      log.push('prepare')
      prepared.push(input)
      if (state.fail.has('prepare')) return AWAY
      return { ok: { messages: [{ id: input.message }] } as unknown as FixedModelRequest }
    },
  }
  const decisions = createGoalDecisions<unknown>({
    model: () => (state.modelAway ? undefined : model),
    preparation: () => (state.preparationAway ? undefined : preparation),
    principalOf: subject => (subject === PRINCIPAL ? PRINCIPAL : undefined),
    policy: { pollMs: 10, deadlineMs: 100 },
    now: () => state.time,
    wait: async ms => void (state.time += ms),
  })
  const only = (): Call => {
    const [call, ...more] = [...calls.values()]
    if (call === undefined || more.length > 0) throw new Error(`${String(calls.size)} calls`)
    return call
  }
  return { decisions, calls, log, reads, operations, closed, prepared, state, only }
}
