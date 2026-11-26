import { describe, expect, it } from 'vitest'
import { impliedKey } from '@omne-harness/goal-contract'
import type {
  CheckAnswer,
  GoalDraft,
  GoalRecord,
  JudgeAnswer,
  JudgeReply,
  ObservedCall,
} from '@omne-harness/goal-contract'
import type { DecisionAsk, GoalStore } from '@omne-harness/goal'
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

describe('a goal whose criterion stands on what was done in the round', () => {
  /** What a person wants told in the session: nothing is left behind but the words. */
  const SAID = {
    statement: '在会话里列出了 todo.md 里全部没打勾的事项',
    evidence: { kind: 'activity' },
    pass: { kind: 'shows', text: '答复里有三件：续保、体检、护照' },
  } as const
  const TOLD: GoalDraft = { purpose: '把 todo.md 里没打勾的事项列给我', criteria: [SAID] }
  const read: ObservedCall = { ...write(1), tool: 'Files read', path: 'todo.md', writes: false }

  it('is shown the calls of the session and what the agent said last, as the goal a session implies is', async () => {
    const s = await standing(SESSION, TOLD)
    s.history.made(read)
    s.history.say('没打勾的有三件：给车续保、预约年度体检、护照换新。')
    s.decisions.answer(ask => replyOf(ask, 'holds'))
    expect(value(await s.observe())).toEqual({ kind: 'pass' })
    const state = s.decisions.asked[0]?.request.state as {
      evidence: { A1: { ref: string; tool: string; excerpt: string }[] }
    }
    expect(state.evidence.A1.map(item => [item.ref, item.tool])).toEqual([
      ['call-1', 'Files read'],
      ['reply', 'Reply'],
    ])
    expect(state.evidence.A1.at(-1)?.excerpt).toBe(
      '没打勾的有三件：给车续保、预约年度体检、护照换新。',
    )
    expect(s.record()?.state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
  })

  it('is shown what the agent said when only one of its criteria stands on the round', async () => {
    const kept = {
      statement: '清单留在了 todo.md',
      evidence: { kind: 'file', path: 'todo.md' },
    } as const
    const s = await standing(SESSION, { ...TOLD, criteria: [SAID, kept] })
    s.history.say('没打勾的有三件。')
    s.decisions.answer(ask => replyOf(ask, 'holds'))
    value(await s.observe())
    const state = s.decisions.asked[0]?.request.state as { evidence: { A1: { ref: string }[] } }
    expect(state.evidence.A1.map(item => item.ref)).toEqual(['call-1', 'reply'])
  })

  it('has no basis when what the agent said cannot be read', async () => {
    const s = await standing(SESSION, TOLD)
    s.history.hearable(false)
    expect(await s.observe()).toEqual({ kind: 'basis-unavailable' })
    expect(s.decisions.asked).toEqual([])
  })

  it('a goal that stands on a file is not shown what the agent said, and is judged though it cannot be read', async () => {
    const s = await standing()
    s.history.say('写好了。')
    s.history.hearable(false)
    s.decisions.answer(ask => replyOf(ask, 'holds'))
    value(await s.observe())
    const state = s.decisions.asked[0]?.request.state as { evidence: { A1: { ref: string }[] } }
    expect(state.evidence.A1.map(item => item.ref)).toEqual(['call-1'])
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

describe('a self-driving session nobody set a goal for', () => {
  const INPUT = { since: '41', text: '把改动说明写进 CHANGELOG' }
  const KEY = impliedKey(SESSION)
  async function driving(input: typeof INPUT | null = INPUT) {
    const w = world()
    w.sessions.drive(SESSION, input)
    w.history.made(write(1))
    w.history.say('写好了。')
    const implied = () => w.store.rows(TENANT).filter(row => row.session === KEY)
    const observe = (call = CALL, candidate: 'complete' | 'failed' = 'complete') =>
      w.goals.observe(CHECK, check(call, candidate))
    return { ...w, implied, observe }
  }

  it('is judged by the input that opened the round: one criterion, shown the calls of the round and what the agent said last', async () => {
    const s = await driving()
    s.decisions.answer(ask => replyOf(ask, 'holds'))
    expect(value(await s.observe())).toEqual({ kind: 'pass' })
    const [asked] = s.decisions.asked
    expect(asked).toMatchObject({ session: SESSION, identity: 'implied.1.1.0/0/0/0' })
    expect(Object.keys(asked?.request.questions ?? {})).toEqual(['A1'])
    const state = asked?.request.state as {
      goal: { purpose: string }
      evidence: { A1: { ref: string; tool: string; excerpt: string }[] }
    }
    expect(state.goal.purpose).toBe(INPUT.text)
    expect(state.evidence.A1.map(item => [item.ref, item.tool])).toEqual([
      ['call-1', 'Files write'],
      ['reply', 'Reply'],
    ])
    expect(state.evidence.A1.at(-1)?.excerpt).toBe('写好了。')
    expect(s.implied()).toHaveLength(1)
    expect(s.changed).toEqual([])
    expect(s.implied()[0]?.state).toMatchObject({
      status: 'settled',
      attendance: 'unattended',
      outcome: { kind: 'achieved' },
    })
  })

  it('is no goal of the session: nothing reads it there, and a person sets a goal as if it were not there', async () => {
    const s = await driving()
    s.decisions.answer(ask => replyOf(ask, 'fails'))
    value(await s.observe())
    expect(value(await s.goals.read(OWNER, SESSION))).toBeNull()
    const proposal = { kind: 'set', draft: READ } as const
    const set = value(await s.goals.write(OWNER, s.direct({ proposal })))
    expect(set.state).toMatchObject({ status: 'active', generation: 1, revision: 1 })
    expect(value(await s.observe('call-b'))).toEqual({ kind: 'continue' })
    expect(s.decisions.asked.at(-1)?.identity).toBe('1.1.0/0/0/0')
    expect(s.implied()).toHaveLength(1)
  })

  it('sends the agent on with a reminder of its own while the judge reads the input as not done, a round at a time', async () => {
    const s = await driving()
    s.decisions.answer(ask => replyOf(ask, 'fails'))
    expect(value(await s.observe('c1'))).toEqual({ kind: 'continue' })
    expect(s.sessions.woken).toEqual([
      {
        kind: 'continue',
        request: 'implied/continue/1/1/1',
        session: SESSION,
        rendered: expect.stringContaining(`## 目的\n${INPUT.text}`),
        open: '- [A1] 这段输入要的事做完了：证据显示没做到（判定）',
        implied: true,
      },
    ])
    const again = await s.observe('c1')
    expect(again).toEqual({ kind: 'done', value: { kind: 'continue' }, recalled: true })
    expect(s.decisions.asked).toHaveLength(1)
    expect(value(await s.observe('c2'))).toEqual({ kind: 'continue' })
    expect(s.sessions.woken.map(wake => wake.request)).toEqual([
      'implied/continue/1/1/1',
      'implied/continue/1/1/2',
    ])
    expect(s.implied()).toHaveLength(1)
  })

  it('lets the round end, with nobody told anything, once sending it on changed nothing or the judge cannot answer', async () => {
    const stalled = await driving()
    stalled.decisions.answer(ask => replyOf(ask, 'fails'))
    const answers: string[] = []
    for (const call of ['c1', 'c2', 'c3', 'c4', 'c5'])
      answers.push(value(await stalled.observe(call)).kind)
    expect(answers).toEqual(['continue', 'continue', 'continue', 'pass', 'pass'])
    expect(stalled.implied()[0]?.state).toMatchObject({
      status: 'settled',
      outcome: { kind: 'stalled' },
    })
    expect(stalled.decisions.asked).toHaveLength(4)
    const mute = await driving()
    expect(value(await mute.observe())).toEqual({ kind: 'pass' })
    expect(mute.implied()[0]?.state).toMatchObject({ outcome: { kind: 'judge-unavailable' } })
  })

  it('begins anew for the next input, over the one row it keeps', async () => {
    const s = await driving()
    s.decisions.answer(ask => replyOf(ask, 'fails'))
    value(await s.observe('c1'))
    s.sessions.drive(SESSION, { since: '57', text: '再把版本号改了' })
    expect(value(await s.observe('c2'))).toEqual({ kind: 'continue' })
    expect(s.implied()).toHaveLength(1)
    expect(s.implied()[0]).toMatchObject({
      since: '57',
      body: { purpose: '再把版本号改了' },
      state: { generation: 1, revision: 2, rounds: 1 },
    })
    expect(s.decisions.asked.at(-1)?.identity).toBe('implied.1.2.0/0/0/0')
    expect(s.sessions.woken.at(-1)?.request).toBe('implied/continue/1/2/1')
  })

  it('implies nothing for a round that proposes to fail, an input without words, a session that does not drive itself, or one whose goal is paused', async () => {
    const failing = await driving()
    expect(value(await failing.observe(CALL, 'failed'))).toEqual({ kind: 'pass' })
    const wordless = await driving({ since: '41', text: '  ' })
    expect(value(await wordless.observe())).toEqual({ kind: 'pass' })
    const led = await driving(null)
    expect(value(await led.observe())).toEqual({ kind: 'pass' })
    const paused = await driving()
    const proposal = { kind: 'set', draft: READ } as const
    value(await paused.goals.write(OWNER, paused.direct({ proposal })))
    value(await paused.goals.command(OWNER, { session: SESSION, command: { kind: 'pause' } }))
    expect(value(await paused.observe())).toEqual({ kind: 'pass' })
    for (const s of [failing, wordless, led, paused]) {
      expect(s.decisions.asked).toEqual([])
      expect(s.implied()).toEqual([])
    }
  })

  it('answers that its basis is away when the facts of the session or what the agent said cannot be read', async () => {
    const blind = await driving()
    blind.sessions.readable(false)
    expect(await blind.observe()).toEqual({ kind: 'basis-unavailable' })
    expect(blind.implied()).toEqual([])
    const deaf = await driving()
    deaf.history.readable(false)
    expect(await deaf.observe()).toEqual({ kind: 'basis-unavailable' })
    expect(deaf.decisions.asked).toEqual([])
  })
})

describe('what a check withstands', () => {
  const UNAVAILABLE = { kind: 'unavailable' } as const
  const INPUT = { since: '41', text: '把改动说明写进 CHANGELOG' }
  const KEY = impliedKey(SESSION)
  /** A store whose reads of one key cannot be made. */
  const blindTo =
    (key: string) =>
    (store: GoalStore): GoalStore => ({
      commit: (tenant, command) => store.commit(tenant, command),
      latest: async (tenant, session) =>
        session === key ? UNAVAILABLE : store.latest(tenant, session),
      owing: tenant => store.owing(tenant),
      examinedBy: (tenant, examiner) => store.examinedBy(tenant, examiner),
    })
  /** A store that answers the commits a test picks as written over by somebody else. */
  const staleWhen =
    (pick: (next: GoalRecord, nth: number) => boolean) =>
    (store: GoalStore): GoalStore => {
      let seen = 0
      return {
        async commit(tenant, command) {
          seen += 1
          return pick(command.next, seen)
            ? { kind: 'committed', value: { kind: 'stale', current: null } }
            : store.commit(tenant, command)
        },
        latest: (tenant, session) => store.latest(tenant, session),
        owing: tenant => store.owing(tenant),
        examinedBy: (tenant, examiner) => store.examinedBy(tenant, examiner),
      }
    }
  const observe = (w: ReturnType<typeof world>, call = CALL, session = SESSION) =>
    w.goals.observe(CHECK, check(call, 'complete', session))

  it('has no basis when the goal of the session, or the one it implies, cannot be read; neither is taken for no goal', async () => {
    const own = world(blindTo(SESSION))
    expect(await observe(own)).toEqual({ kind: 'basis-unavailable' })
    expect(await own.goals.compacted(CHECK, SESSION)).toEqual({ kind: 'basis-unavailable' })
    const implied = world(blindTo(KEY))
    implied.sessions.drive(SESSION, INPUT)
    expect(await observe(implied)).toEqual({ kind: 'basis-unavailable' })
    expect(implied.decisions.asked).toEqual([])
  })

  it('lets a session nobody knows end its round: there are no facts to imply a goal from', async () => {
    const w = world()
    expect(value(await observe(w, CALL, 'a-session-nobody-knows'))).toEqual({ kind: 'pass' })
    expect(w.store.rows(TENANT)).toEqual([])
  })

  it('begins the implied goal again when somebody wrote over its beginning', async () => {
    const w = world(staleWhen((next, nth) => next.session === KEY && nth === 1))
    w.sessions.drive(SESSION, INPUT)
    w.decisions.answer(ask => replyOf(ask, 'fails'))
    expect(value(await observe(w))).toEqual({ kind: 'continue' })
    expect(w.decisions.asked).toHaveLength(1)
  })

  it('judges three times at most a goal that is written over each time, then has no basis', async () => {
    const w = world(staleWhen(next => next.observed !== null))
    const proposal = { kind: 'set', draft: READ } as const
    value(await w.goals.write(OWNER, w.direct({ proposal })))
    w.decisions.answer(ask => replyOf(ask, 'fails'))
    expect(await observe(w)).toEqual({ kind: 'basis-unavailable' })
    expect(w.decisions.asked).toHaveLength(3)
  })

  it('reads the number of a metric from the run that measured it, keeps it as the reading of the system, and reads none before any run', async () => {
    const draft: GoalDraft = {
      purpose: '把首页的加载时间降下来',
      criteria: [{ statement: 'p95 到 800 毫秒以内', evidence: { kind: 'metric', metric: 'M1' } }],
      metrics: [
        {
          statement: '首页 p95 加载时间，毫秒',
          measure: { command: 'pnpm bench:home --json', path: '.p95_ms' },
          direction: 'lower',
          target: 800,
        },
      ],
    }
    const w = world()
    const proposal = { kind: 'set', draft } as const
    value(await w.goals.write(OWNER, w.direct({ proposal })))
    expect(value(await observe(w, 'before-any-run'))).toEqual({ kind: 'continue' })
    expect(w.store.rows(TENANT).at(-1)?.readings.metrics).toEqual({})
    const bench = { ...write(1), tool: 'Shell execute', path: null, writes: false, exit: 0 }
    w.history.made({ ...bench, command: 'pnpm bench:home --json', output: '{"p95_ms": 780}' })
    expect(value(await observe(w))).toEqual({ kind: 'pass' })
    const record = w.store.rows(TENANT).at(-1)
    expect(record?.readings.metrics.M1).toEqual({ value: 780, source: 'system', ref: null })
    expect(record?.state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
    expect(w.decisions.asked).toEqual([])
  })

  it('shows an implied judging the calls alone when the agent said nothing, and has no basis when what it said cannot be read', async () => {
    const silent = world()
    silent.sessions.drive(SESSION, INPUT)
    silent.history.made(write(1))
    silent.decisions.answer(ask => replyOf(ask, 'holds'))
    value(await observe(silent))
    const state = silent.decisions.asked[0]?.request.state as {
      evidence: { A1: { ref: string }[] }
    }
    expect(state.evidence.A1.map(item => item.ref)).toEqual(['call-1'])
    const deaf = world()
    deaf.sessions.drive(SESSION, INPUT)
    deaf.history.hearable(false)
    expect(await observe(deaf)).toEqual({ kind: 'basis-unavailable' })
    expect(deaf.decisions.asked).toEqual([])
  })
})
