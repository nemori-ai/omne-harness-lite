import { describe, expect, it } from 'vitest'
import type {
  CheckAnswer,
  GoalDraft,
  JudgeAnswer,
  JudgeReply,
  ObservedCall,
} from '@omne-harness/goal-contract'
import type { DecisionAsk } from '@omne-harness/goal'
import { JOB, OWNER, refusal, SESSION, TENANT, value, world } from './world.ts'

const CHECK = { tenant: TENANT, subject: 'check' }
const CALL = 'exec-1/cand-1/before_terminal/call/0'
const check = (call = CALL, candidate: 'complete' | 'failed' = 'complete', session = SESSION) => ({
  session,
  call,
  candidate,
})

/** One criterion a reader judges, one rule, and a budget of three rounds. */
const READ: GoalDraft = {
  purpose: '把改动说明写进 CHANGELOG',
  criteria: [
    {
      statement: '改动说明写进了 CHANGELOG',
      evidence: { kind: 'file', path: 'CHANGELOG.md' },
      pass: { kind: 'shows', text: '有一条讲这次改动的新条目' },
    },
  ],
  rules: [{ statement: '不改公共接口。' }],
  exits: [
    {
      statement: '预算用尽',
      kind: 'budget',
      limits: [{ amount: 3, unit: 'rounds' }],
      deliver: '写到哪算哪',
      counts: 'failure',
    },
    { statement: '要改公共接口才写得了', kind: 'person', deliver: '说明', counts: 'failure' },
  ],
}

const write = (order: number): ObservedCall => ({
  ref: `call-${String(order)}`,
  order,
  tool: 'Files write',
  command: null,
  path: 'CHANGELOG.md',
  exit: null,
  output: '## 未发布\n- 首页提速',
  writes: true,
})

const choice = (option: string, probability = 0.97): JudgeAnswer => ({
  type: 'choice',
  choice: option,
  probabilities: { [option]: probability },
})
const noul = (value: number): JudgeAnswer => ({ type: 'noul', noul: value })

/** A whole reply to whatever was asked: every criterion and rule as told, no exit seen. */
function replyOf(ask: DecisionAsk, criterion: string, rule = 'kept'): JudgeReply {
  const names = Object.keys(ask.request.questions)
  return Object.fromEntries(
    names.map(name => {
      if (name.startsWith('A')) return [name, choice(criterion)]
      if (name.startsWith('N')) return [name, choice(rule)]
      return [name, ask.request.questions[name]?.type === 'noul' ? noul(0.01) : choice('none')]
    }),
  )
}

async function standing(session = SESSION, draft: GoalDraft = READ) {
  const w = world()
  const draftedBy = session === JOB ? 'creator' : 'person'
  const proposal = { kind: 'set', draft } as const
  value(await w.goals.write(OWNER, w.direct({ session, proposal, draftedBy })))
  w.history.made(write(1))
  w.sessions.woken.length = 0
  const record = () => w.store.rows(TENANT).findLast(row => row.session === session)
  const observe = (call = CALL, candidate: 'complete' | 'failed' = 'complete') =>
    w.goals.observe(CHECK, check(call, candidate, session))
  return { ...w, record, observe }
}

describe('a check of a round that is about to end', () => {
  it('lets the round end, asks nobody and writes nothing when the session has no goal', async () => {
    const w = world()
    expect(value(await w.goals.observe(CHECK, check()))).toEqual({ kind: 'pass' })
    expect(w.decisions.asked).toEqual([])
    expect(w.store.rows(TENANT)).toEqual([])
  })

  it('lets it end without judging when the goal is paused or settled', async () => {
    const s = await standing()
    value(await s.goals.command(OWNER, { session: SESSION, command: { kind: 'pause' } }))
    expect(value(await s.observe())).toEqual({ kind: 'pass' })
    value(await s.goals.command(OWNER, { session: SESSION, command: { kind: 'cancel' } }))
    expect(value(await s.observe('call-b'))).toEqual({ kind: 'pass' })
    expect(s.decisions.asked).toEqual([])
    expect(s.record()?.observed).toBeNull()
  })

  it('only looks on when the round proposes to fail: nothing is judged, nothing is written', async () => {
    const s = await standing()
    const before = s.record()
    expect(value(await s.observe(CALL, 'failed'))).toEqual({ kind: 'pass' })
    expect(s.decisions.asked).toEqual([])
    expect(s.record()).toEqual(before)
  })

  it('settles the goal as achieved and lets the round end when the judge reads every entry as met', async () => {
    const s = await standing()
    s.decisions.answer(ask => replyOf(ask, 'holds'))
    expect(value(await s.observe())).toEqual({ kind: 'pass' })
    expect(s.record()?.state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
    expect(s.record()?.readings.criteria.A1).toEqual({ value: 'holds', source: 'judge', ref: null })
    expect(s.sessions.woken).toEqual([])
    const [asked] = s.decisions.asked
    expect(asked).toMatchObject({
      caller: CHECK,
      session: SESSION,
      identity: '1.1.0/0/0/0',
      model: 'openai/gpt-6-luna-decisions',
    })
    expect(Object.keys(asked?.request.questions ?? {})).toEqual(['A1', 'N1', 'X2'])
  })

  it('counts a round, sends the reminder of that round with the open rows, and answers to go on', async () => {
    const s = await standing()
    s.decisions.answer(ask => replyOf(ask, 'fails'))
    expect(value(await s.observe())).toEqual({ kind: 'continue' })
    expect(s.record()?.state).toMatchObject({ status: 'active', rounds: 1 })
    expect(s.sessions.woken).toHaveLength(1)
    expect(s.sessions.woken[0]).toMatchObject({
      kind: 'continue',
      request: 'continue/1/1/1',
      session: SESSION,
      open: '- [A1] 改动说明写进了 CHANGELOG：证据显示没做到（判定）',
    })
    expect(s.record()?.wake).toBeNull()
  })

  it('answers the same check again as it was answered, without judging or counting again', async () => {
    const s = await standing()
    s.decisions.answer(ask => replyOf(ask, 'fails'))
    value(await s.observe())
    const asked = s.decisions.asked.length
    const again = await s.observe()
    expect(again).toEqual({ kind: 'done', value: { kind: 'continue' }, recalled: true })
    expect(s.decisions.asked).toHaveLength(asked)
    expect(s.record()?.state).toMatchObject({ rounds: 1 })
    expect(s.sessions.woken).toHaveLength(1)
  })

  it('keeps the reminder owed when its sending is not known, answers to go on, and sends the same one again on the replay', async () => {
    const s = await standing()
    s.decisions.answer(ask => replyOf(ask, 'fails'))
    s.sessions.sendNext('unknown')
    expect(value(await s.observe())).toEqual({ kind: 'continue' })
    expect(s.record()?.wake).toEqual({ kind: 'continue', request: 'continue/1/1/1' })
    expect(s.hinted).toEqual([TENANT])
    expect(value(await s.observe())).toEqual({ kind: 'continue' })
    expect(s.sessions.woken.map(wake => wake.request)).toEqual(['continue/1/1/1', 'continue/1/1/1'])
    expect(s.record()?.wake).toBeNull()
    expect(s.record()?.state).toMatchObject({ rounds: 1 })
  })

  it('a next check of the same goal is a next round with its own reminder', async () => {
    const s = await standing()
    s.decisions.answer(ask => replyOf(ask, 'fails'))
    value(await s.observe('call-1'))
    value(await s.observe('call-2'))
    expect(s.sessions.woken.map(wake => wake.request)).toEqual(['continue/1/1/1', 'continue/1/1/2'])
    expect(s.decisions.asked.map(ask => ask.identity)).toEqual(['1.1.0/0/0/0', '1.1.1/0/0/0'])
  })

  it('settles by the budget once its rounds are used, the goal still open', async () => {
    const s = await standing()
    s.decisions.answer(ask => replyOf(ask, 'fails'))
    for (const call of ['c1', 'c2', 'c3']) value(await s.observe(call))
    expect(value(await s.observe('c4'))).toEqual({ kind: 'pass' })
    expect(s.record()?.state).toMatchObject({
      status: 'settled',
      rounds: 3,
      outcome: { kind: 'exit', exit: 'X1', counts: 'failure' },
    })
  })

  it('where a person attends, pauses on an exit that is theirs to call and leaves them a note; the round ends', async () => {
    const s = await standing()
    s.decisions.answer(ask => ({ ...replyOf(ask, 'fails'), X2: noul(0.97) }))
    const answer = value(await s.observe()) as Extract<CheckAnswer, { kind: 'tell' }>
    expect(answer.kind).toBe('tell')
    expect(answer.note).toContain('[X2] 要改公共接口才写得了')
    expect(answer.note).toContain('，或照 [X2] 收场。')
    expect(s.record()?.state).toMatchObject({
      status: 'paused',
      pause: { by: 'verdict', row: 5, exit: 'X2' },
    })
    expect(s.sessions.woken).toEqual([])
    expect(value(await s.observe())).toEqual(answer)
  })

  it('where nobody attends, the same exit settles the goal instead', async () => {
    const s = await standing(JOB)
    s.decisions.answer(ask => ({ ...replyOf(ask, 'fails'), X2: noul(0.97) }))
    expect(value(await s.observe())).toEqual({ kind: 'pass' })
    expect(s.record()?.state).toMatchObject({
      status: 'settled',
      outcome: { kind: 'exit', exit: 'X2', counts: 'failure' },
    })
  })
})

describe('the decision calls of one judging', () => {
  it('asks a request again as a new call when it got no whole answer, twice at most', async () => {
    const s = await standing()
    let calls = 0
    s.decisions.answer(ask => {
      calls += 1
      return calls < 3 ? null : replyOf(ask, 'holds')
    })
    expect(value(await s.observe())).toEqual({ kind: 'pass' })
    expect(s.decisions.asked.map(ask => ask.identity)).toEqual([
      '1.1.0/0/0/0',
      '1.1.0/0/0/1',
      '1.1.0/0/0/2',
    ])
  })

  it('a reply that leaves a question out, or throws, counts as no answer', async () => {
    const s = await standing()
    let calls = 0
    s.decisions.answer(ask => {
      calls += 1
      if (calls === 1) throw new Error('the decisions are away')
      if (calls === 2) return { A1: choice('holds') }
      return replyOf(ask, 'holds')
    })
    expect(value(await s.observe())).toEqual({ kind: 'pass' })
    expect(s.decisions.asked).toHaveLength(3)
  })

  it('a judge that never answers hands the goal to the person where one attends, and settles it where nobody does', async () => {
    const attended = await standing()
    const answer = value(await attended.observe())
    expect(answer).toMatchObject({ kind: 'tell' })
    expect(attended.decisions.asked).toHaveLength(3)
    expect(attended.record()?.state).toMatchObject({
      status: 'paused',
      pause: { by: 'verdict', row: 8 },
    })
    const job = await standing(JOB)
    expect(value(await job.observe())).toEqual({ kind: 'pass' })
    expect(job.record()?.state).toMatchObject({
      status: 'settled',
      outcome: { kind: 'judge-unavailable' },
    })
  })

  it('asks under the model the configuration names, three times each when it is set to vote', async () => {
    const s = await standing()
    s.judging.set({ model: 'typesafe/jev-1.14', votes: 3 })
    s.decisions.answer(ask => replyOf(ask, 'holds'))
    value(await s.observe())
    expect(s.decisions.asked.map(ask => [ask.model, ask.identity])).toEqual([
      ['typesafe/jev-1.14', '1.1.0/0/0/0'],
      ['typesafe/jev-1.14', '1.1.0/0/1/0'],
      ['typesafe/jev-1.14', '1.1.0/0/2/0'],
    ])
  })

  it('asks nobody about a goal whose entries the system settles all by itself', async () => {
    const draft: GoalDraft = {
      purpose: '让用例全过',
      criteria: [
        {
          statement: '用例全过',
          evidence: { kind: 'command', command: 'pnpm test' },
          pass: { kind: 'exit-zero' },
        },
      ],
    }
    const s = await standing(SESSION, draft)
    const run: ObservedCall = { ...write(2), tool: 'Shell', command: 'pnpm test', path: null }
    s.history.made({ ...run, exit: 0, writes: false, output: 'ok' })
    expect(value(await s.observe())).toEqual({ kind: 'pass' })
    expect(s.decisions.asked).toEqual([])
    expect(s.record()?.readings.criteria.A1).toEqual({
      value: 'holds',
      source: 'system',
      ref: null,
    })
    expect(s.record()?.state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
  })
})

describe('what a check stands on', () => {
  it('answers that its basis is away, and writes nothing, when the history or the configuration cannot be read', async () => {
    for (const part of ['history', 'judging'] as const) {
      const s = await standing()
      s[part].readable(false)
      expect(await s.observe()).toEqual({ kind: 'basis-unavailable' })
      expect(s.record()?.observed).toBeNull()
      expect(s.decisions.asked).toEqual([])
    }
  })

  it('asks the authority for this action on every call, and refuses on its word', async () => {
    const s = await standing()
    s.authority.answer(action => (action === 'observe' ? 'denied' : 'permitted'))
    expect(refusal(await s.observe())).toEqual({ kind: 'denied' })
    expect(refusal(await s.goals.compacted(CHECK, SESSION))).toEqual({ kind: 'denied' })
    expect(s.authority.asked.at(-1)).toMatchObject({ caller: CHECK, action: 'observe' })
  })

  it('answers unknown when the write is not known to stand, and recalls it on the replay if it did', async () => {
    const s = await standing()
    s.decisions.answer(ask => replyOf(ask, 'fails'))
    s.store.failNext('unknown-after-commit')
    expect(await s.observe()).toEqual({ kind: 'unknown' })
    expect(s.sessions.woken).toEqual([])
    expect(await s.observe()).toMatchObject({ value: { kind: 'continue' }, recalled: true })
    expect(s.sessions.woken.map(wake => wake.request)).toEqual(['continue/1/1/1'])
  })

  it('judges again when a person changed the goal while it was being judged', async () => {
    const s = await standing()
    let revised = false
    s.decisions.answer(async ask => {
      if (!revised) {
        revised = true
        const changes = [{ op: 'add', section: 'rules', entry: { statement: '先跑 lint。' } }]
        const proposal = { kind: 'revise', changes } as const
        value(await s.goals.write(OWNER, s.direct({ proposal, operation: 'op-2' })))
      }
      return replyOf(ask, 'holds')
    })
    expect(value(await s.observe())).toEqual({ kind: 'pass' })
    expect(s.decisions.asked.map(ask => ask.identity)).toEqual(['1.1.0/0/0/0', '1.2.0/0/0/0'])
    expect(s.record()?.state).toMatchObject({ status: 'settled', revision: 2 })
  })
})

describe('after a compaction', () => {
  it('tells the agent what the goal in progress is for and what is open; nothing when none is in progress', async () => {
    const s = await standing()
    expect(value(await s.goals.compacted(CHECK, SESSION))).toContain(
      'Purpose: 把改动说明写进 CHANGELOG',
    )
    value(await s.goals.command(OWNER, { session: SESSION, command: { kind: 'cancel' } }))
    expect(value(await s.goals.compacted(CHECK, SESSION))).toBeNull()
    expect(value(await world().goals.compacted(CHECK, SESSION))).toBeNull()
  })
})
