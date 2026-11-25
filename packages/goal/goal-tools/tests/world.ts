import { createGoals } from '@omne-harness/goal'
import {
  createMemoryGoalStore,
  fakeAuthority,
  fakeCalls,
  fakeCards,
  fakeDecisions,
  fakeHistory,
  fakeJudging,
  fakeSessions,
} from '@omne-harness/goal/testing'
import { readConfirmOption, type GoalDraft, type GoalRecord } from '@omne-harness/goal-contract'
import { writeJsonText } from '@omne-harness/json-text'
import type { ToolDecision } from '@omne-harness/tool-contract'
import type { ToolSegmentContext } from '@omne-harness/tool-contract/provider'
import {
  answerGoal,
  attachGoal,
  bindGoal,
  proposeExecutor,
  type GoalArguments,
} from '../src/index.ts'

export const TENANT = 'tenant-1'
export const SESSION = 'session-1'
export const CALL = 'call-ref-1'
export const DRAFT: GoalDraft = {
  purpose: '把首页的加载时间降下来',
  criteria: [
    { statement: '端到端用例全过', evidence: { kind: 'command', command: 'pnpm test:e2e' } },
  ],
  rules: [{ statement: '不改公共接口。' }],
}
export const ADD_RULE = [
  { op: 'add', section: 'rules', entry: { statement: '每次提交前跑 lint。' } },
]

type Card = { id: string; options: { id: string }[]; description: string; title: string }

/** The real goal registry over a memory store, bound to one call of one session. */
export function world(session = SESSION, call = CALL) {
  const store = createMemoryGoalStore()
  const sessions = fakeSessions()
  const cards = fakeCards()
  const calls = fakeCalls()
  const authority = fakeAuthority()
  sessions.add(SESSION, 'attended')
  sessions.add('job-1', 'unattended')
  const goals = createGoals({
    store,
    authority,
    sessions,
    cards,
    calls,
    history: fakeHistory(),
    decisions: fakeDecisions(),
    judging: fakeJudging(),
    clock: { now: () => '2026-11-25T00:00:00.000Z' },
    hints: { wake: () => {} },
  })
  const caller = { tenant: TENANT, subject: 'work' }
  const record = (): GoalRecord | null => store.rows(TENANT).at(-1) ?? null

  /** One tool call of the session: its own reference, so the card it puts up is its own. */
  function callOf(call: string) {
    const bound = bindGoal({
      tenant: TENANT,
      call,
      goals: () => goals,
      context: async () => ({ caller, session }),
    })
    const signal = new AbortController().signal
    const context = { signal } as unknown as ToolSegmentContext
    attachGoal({ context, limits: {}, finish: async () => {} } as never, bound)
    const run = (args: Exclude<GoalArguments, { command: 'propose' }>) => answerGoal(args, context)

    /** Runs propose up to its card. A failure before the card is thrown with its reason. */
    async function proposed(params: { body?: unknown; changes?: unknown }) {
      const args = { command: 'propose', params } as Extract<GoalArguments, { command: 'propose' }>
      const first = await proposeExecutor.initial(args, null, context)
      if ('failure' in first) return { failure: first.failure }
      if (first.ok.kind !== 'suspended') throw new Error('propose did not wait')
      const request = JSON.parse(writeJsonText(first.ok.wait.request)) as unknown
      return { state: first.ok.state, wait: first.ok.wait, request, closed: first.ok.closedResult }
    }
    /** The person answers the card. A confirmation is held by the cards' owner, as human intervention holds it. */
    async function answer(state: Uint8Array, card: Card, response: ToolDecision<unknown>) {
      const picked =
        response.kind === 'answer'
          ? (response.value as { answers: { optionId?: string }[] }).answers[0]?.optionId
          : undefined
      const read = picked === undefined ? null : readConfirmOption(picked)
      if (read !== null)
        cards.answer({ card: call, by: 'entry:tenant-1', byMember: true, confirmed: true, ...read })
      const second = await proposeExecutor.resume({ checkpoint: state, response }, null, context)
      if ('failure' in second) return { failure: second.failure }
      if (second.ok.kind !== 'completed') throw new Error('propose did not end')
      void card
      return { text: second.ok.value }
    }
    return { context, run, proposed, answer }
  }

  const first = callOf(call)
  return { goals, store, sessions, cards, calls, authority, caller, record, callOf, ...first }
}

export const selection = (optionId: string): ToolDecision<unknown> => ({
  kind: 'answer',
  value: { answers: [{ cardId: 'goal', kind: 'selection', optionId }] },
})
export const words = (text: string): ToolDecision<unknown> => ({
  kind: 'answer',
  value: { answers: [{ cardId: 'goal', kind: 'text', text }] },
})
