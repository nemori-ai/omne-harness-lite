import { createGoals, type GoalStore } from '@omne-harness/goal'
import {
  createMemoryGoalStore,
  fakeAuthority,
  fakeCards,
  fakeSessions,
} from '@omne-harness/goal/testing'
import type {
  AnsweredCard,
  DirectWrite,
  GoalCaller,
  GoalDraft,
  GoalRecord,
  GoalRefusal,
  Outcome,
  Proposal,
} from '@omne-harness/goal-contract'

export const TENANT = 'tenant-1'
export const SESSION = 'session-1'
export const JOB = 'job-session-1'
export const OWNER: GoalCaller = { tenant: TENANT, subject: 'owner' }

export const DRAFT: GoalDraft = {
  purpose: '把首页的加载时间降下来',
  criteria: [
    { statement: '端到端用例全过', evidence: { kind: 'command', command: 'pnpm test:e2e' } },
  ],
  rules: [{ statement: '不改公共接口。' }],
}
export const SET = { kind: 'set', draft: DRAFT } as const satisfies Proposal
export const ADD_RULE: Proposal = {
  kind: 'revise',
  changes: [{ op: 'add', section: 'rules', entry: { statement: '每次提交前跑 lint。' } }],
}

export function world(wrap: (store: GoalStore) => GoalStore = store => store) {
  const store = createMemoryGoalStore()
  const authority = fakeAuthority()
  const sessions = fakeSessions()
  const cards = fakeCards()
  const hinted: string[] = []
  let tick = 0
  sessions.add(SESSION, 'attended')
  sessions.add(JOB, 'unattended')
  const goals = createGoals({
    store: wrap(store),
    authority,
    sessions,
    cards,
    clock: { now: () => `2026-11-25T00:00:${String((tick += 1)).padStart(2, '0')}.000Z` },
    hints: { wake: tenant => void hinted.push(tenant) },
  })
  const direct = (change: Partial<DirectWrite> = {}): DirectWrite => ({
    session: SESSION,
    operation: 'op-1',
    proposal: SET,
    words: '把首页降下来',
    draftedBy: 'person',
    by: 'acc-1',
    ...change,
  })
  /** Proposes, has a member confirm the card that shows it, and returns the card as its owner holds it. */
  async function answered(
    card: string,
    proposal: Proposal,
    change: Partial<AnsweredCard> = {},
    session = SESSION,
  ): Promise<AnsweredCard> {
    const proposed = value(await goals.propose(OWNER, { session, proposal }))
    const held: AnsweredCard = {
      card,
      by: 'acc-1',
      byMember: true,
      confirmed: true,
      digest: proposed.digest,
      base: proposed.base,
      ...change,
    }
    cards.answer(held)
    return held
  }
  return { goals, store, authority, sessions, cards, hinted, direct, answered }
}

export function value<T>(outcome: Outcome<T, GoalRefusal>): T {
  if (outcome.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(outcome)}`)
  return outcome.value
}
export function refusal<T>(outcome: Outcome<T, GoalRefusal>): GoalRefusal {
  if (outcome.kind !== 'refused')
    throw new Error(`expected refused, got ${JSON.stringify(outcome)}`)
  return outcome.reason
}
export const revisionOf = (record: GoalRecord | null): number | null =>
  record === null || record.state.status === 'none' ? null : record.state.revision
