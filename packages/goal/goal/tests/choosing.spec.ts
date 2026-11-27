import { describe, expect, it } from 'vitest'
import type { DecisionAsk } from '@omne-harness/goal'
import type { GoalDraft, JudgeAnswer, JudgeReply } from '@omne-harness/goal-contract'
import { DRAFT, JOB, OWNER, SESSION, SET, TENANT, value, world } from './world.ts'

const CHECK = { tenant: TENANT, subject: 'check' }
const CHEAP = 'typesafe/jev-1.14'
const DEFAULT = 'openai/gpt-6-luna-decisions'
const fails: JudgeAnswer = { type: 'choice', choice: 'fails', probabilities: { fails: 0.97 } }
/** Not done yet: the goal goes on, and is judged again the next time its round is about to end. */
const reply = (ask: DecisionAsk): JudgeReply =>
  Object.fromEntries(Object.keys(ask.request.questions).map(name => [name, fails]))
const SHOWN: GoalDraft = {
  purpose: '写一份说明',
  criteria: [{ statement: '写了说明', evidence: { kind: 'file', path: 'README.md' } }],
}
const EXAMINED: GoalDraft = {
  purpose: '做一个能玩的贪吃蛇',
  criteria: [
    { statement: '方向键能控制蛇', evidence: { kind: 'examination', method: '用 node 走一局' } },
  ],
}
const RERUN: GoalDraft = {
  purpose: '做一个能玩的贪吃蛇',
  criteria: [{ statement: '验收脚本通过', evidence: { kind: 'rerun', command: 'node accept.js' } }],
}
const budget = (examinations: number) => ({
  statement: '预算用尽',
  kind: 'budget' as const,
  limits: [
    { amount: 20, unit: 'rounds' as const },
    { amount: examinations, unit: 'examinations' as const },
  ],
  deliver: '做到哪一步',
  counts: 'failure' as const,
})

async function judgedWith(w: ReturnType<typeof world>, call: string) {
  w.decisions.answer(reply)
  const check = { session: SESSION, call, candidate: 'complete' }
  await w.goals.observe(CHECK, check as never)
  return w.decisions.asked.at(-1)?.model
}

describe('the decision model a session chooses for the judging of its goals', () => {
  it('is none until a person chooses one; from the next judging on that model judges, and choosing none gives the tenant its say back', async () => {
    const w = world()
    value(await w.goals.write(OWNER, w.direct({ proposal: { kind: 'set', draft: SHOWN } })))
    expect(value(await w.goals.judgeOf(OWNER, { session: SESSION }))).toBeNull()
    expect(await judgedWith(w, 'exec-1/cand-1/before_terminal/call/0')).toBe(DEFAULT)
    const chosen = await w.goals.chooseJudge(OWNER, { session: SESSION, model: CHEAP })
    expect(value(chosen)).toBe(CHEAP)
    expect(w.authority.asked.at(-1)).toMatchObject({ session: SESSION, action: 'choose-judge' })
    expect(value(await w.goals.judgeOf(OWNER, { session: SESSION }))).toBe(CHEAP)
    expect(await judgedWith(w, 'exec-2/cand-1/before_terminal/call/0')).toBe(CHEAP)
    expect(value(await w.goals.chooseJudge(OWNER, { session: SESSION, model: null }))).toBeNull()
    expect(await judgedWith(w, 'exec-3/cand-1/before_terminal/call/0')).toBe(DEFAULT)
  })

  it('is of that session alone, and does not stand over a setting the tenant locked', async () => {
    const w = world()
    value(await w.goals.write(OWNER, w.direct({ proposal: { kind: 'set', draft: SHOWN } })))
    value(await w.goals.chooseJudge(OWNER, { session: JOB, model: CHEAP }))
    expect(value(await w.goals.judgeOf(OWNER, { session: SESSION }))).toBeNull()
    expect(await judgedWith(w, 'exec-1/cand-1/before_terminal/call/0')).toBe(DEFAULT)
    value(await w.goals.chooseJudge(OWNER, { session: SESSION, model: CHEAP }))
    w.judging.lock(true)
    expect(await judgedWith(w, 'exec-2/cand-1/before_terminal/call/0')).toBe(DEFAULT)
  })

  it('is refused when it names no model that was measured, for a session that is not there, and to a caller the authority does not let', async () => {
    const w = world()
    const refusal = await w.goals.chooseJudge(OWNER, { session: SESSION, model: 'openai/gpt-9' })
    expect(refusal).toMatchObject({
      kind: 'refused',
      reason: { kind: 'invalid', issues: [{ entry: null, field: 'model' }] },
    })
    for (const model of [undefined, 3, { name: CHEAP }])
      expect(await w.goals.chooseJudge(OWNER, { session: SESSION, model })).toMatchObject({
        reason: { kind: 'invalid' },
      })
    expect(await w.goals.chooseJudge(OWNER, { session: 'no-such', model: CHEAP })).toEqual({
      kind: 'refused',
      reason: { kind: 'no-such-session' },
    })
    w.authority.answer(action => (action === 'choose-judge' ? 'denied' : 'permitted'))
    expect(await w.goals.chooseJudge(OWNER, { session: SESSION, model: CHEAP })).toEqual({
      kind: 'refused',
      reason: { kind: 'denied' },
    })
    w.authority.answer(action => (action === 'read' ? 'denied' : 'permitted'))
    expect(await w.goals.judgeOf(OWNER, { session: SESSION })).toEqual({
      kind: 'refused',
      reason: { kind: 'denied' },
    })
    w.authority.answer('permitted')
    expect(value(await w.goals.judgeOf(OWNER, { session: SESSION }))).toBeNull()
  })

  it('is not known to be written when the store cannot tell, and has no basis while the store cannot be read or written', async () => {
    const w = world()
    w.store.failNext('unknown-after-commit')
    expect(await w.goals.chooseJudge(OWNER, { session: SESSION, model: CHEAP })).toEqual({
      kind: 'unknown',
    })
    expect(value(await w.goals.judgeOf(OWNER, { session: SESSION }))).toBe(CHEAP)
    w.store.failNext('rolled-back')
    expect(await w.goals.chooseJudge(OWNER, { session: SESSION, model: null })).toEqual({
      kind: 'basis-unavailable',
    })
    expect(value(await w.goals.judgeOf(OWNER, { session: SESSION }))).toBe(CHEAP)
    w.store.readable(false)
    expect(await w.goals.judgeOf(OWNER, { session: SESSION })).toEqual({
      kind: 'basis-unavailable',
    })
  })

  it('a judging has no basis while the choice of its session cannot be read', async () => {
    const w = world()
    value(await w.goals.write(OWNER, w.direct({ proposal: { kind: 'set', draft: SHOWN } })))
    w.decisions.answer(reply)
    const real = w.store.chosen
    Object.assign(w.store, { chosen: async () => ({ kind: 'unavailable' }) })
    const check = { session: SESSION, call: 'exec-1/cand-1/before_terminal/call/0' }
    const answer = await w.goals.observe(CHECK, { ...check, candidate: 'complete' } as never)
    expect(answer).toEqual({ kind: 'basis-unavailable' })
    expect(w.decisions.asked).toEqual([])
    Object.assign(w.store, { chosen: real })
  })
})

describe('what the settings of a tenant say of examinations, where a goal is written', () => {
  const limitsOf = (record: { body: { exits: readonly { limits: unknown }[] } }) =>
    record.body.exits[0]?.limits

  it('one goal uses as many examinations as the settings allow at most: the budget nobody wrote takes the smaller of three and that, and one written above it is refused', async () => {
    const w = world()
    w.judging.rule({ maxExaminations: 2 })
    const set = value(
      await w.goals.write(OWNER, w.direct({ proposal: { kind: 'set', draft: EXAMINED } })),
    )
    expect(limitsOf(set)).toEqual([
      { amount: 50, unit: 'rounds' },
      { amount: 2, unit: 'examinations' },
    ])
    const more = { ...EXAMINED, exits: [budget(3)] }
    const refusal = await w.goals.write(
      OWNER,
      w.direct({ session: JOB, operation: 'op-2', proposal: { kind: 'set', draft: more } }),
    )
    expect(refusal).toEqual({
      kind: 'refused',
      reason: {
        kind: 'invalid',
        issues: [
          { entry: 'X1', field: 'limits', problem: 'the settings allow 2 examinations at most' },
        ],
      },
    })
    w.judging.rule({ maxExaminations: 5 })
    const five = value(
      await w.goals.write(
        OWNER,
        w.direct({ session: JOB, operation: 'op-3', proposal: { kind: 'set', draft: more } }),
      ),
    )
    expect(limitsOf(five)).toEqual(budget(3).limits)
  })

  it('the goal an agent proposes is checked against the same limit', async () => {
    const w = world()
    w.judging.rule({ maxExaminations: 1 })
    const proposal = { kind: 'set', draft: { ...EXAMINED, exits: [budget(2)] } } as const
    expect(await w.goals.propose(OWNER, { session: SESSION, proposal })).toMatchObject({
      reason: { kind: 'invalid', issues: [{ entry: 'X1', field: 'limits' }] },
    })
  })

  it('the goal of a job waits only for what the settings let it: by default a command run again, not an examination; a person who sets the same goal is not bound by it', async () => {
    const w = world()
    const job = { session: JOB, draftedBy: 'creator', by: 'schedule-job:1' } as const
    const examined = { kind: 'set', draft: EXAMINED } as const
    expect(await w.goals.write(OWNER, w.direct({ ...job, proposal: examined }))).toEqual({
      kind: 'refused',
      reason: {
        kind: 'invalid',
        issues: [
          {
            entry: 'A1',
            field: 'evidence',
            problem:
              'the settings of this tenant do not let the goal of a job use an examination: it costs model calls',
          },
        ],
      },
    })
    const rerun = { kind: 'set', draft: RERUN } as const
    value(await w.goals.write(OWNER, w.direct({ ...job, proposal: rerun })))
    value(await w.goals.write(OWNER, w.direct({ proposal: examined })))
    const other = world()
    other.judging.rule({ job: 'all' })
    value(await other.goals.write(OWNER, other.direct({ ...job, proposal: examined })))
    const none = world()
    none.judging.rule({ job: 'none' })
    expect(await none.goals.write(OWNER, none.direct({ ...job, proposal: rerun }))).toMatchObject({
      reason: { kind: 'invalid', issues: [{ entry: 'A1', field: 'evidence' }] },
    })
  })

  it('a session that examines for a goal cannot be given a goal that itself waits for a run again or an examination', async () => {
    const w = world()
    value(await w.goals.write(OWNER, w.direct({ proposal: { kind: 'set', draft: EXAMINED } })))
    w.history.made({
      ref: 'call-1',
      order: 1,
      tool: 'Files write',
      command: null,
      path: 'snake.js',
      exit: null,
      output: '',
      writes: true,
    })
    const check = { session: SESSION, call: 'exec-1/cand-1/before_terminal/call/0' }
    await w.goals.observe(CHECK, { ...check, candidate: 'complete' } as never)
    const examiner = w.store.rows(TENANT).at(-1)?.examination.examiner ?? ''
    expect(examiner).not.toBe('')
    w.sessions.add(examiner, 'unattended')
    const there = { session: examiner, operation: 'op-9' }
    const rerun = { kind: 'set', draft: RERUN } as const
    expect(await w.goals.write(OWNER, w.direct({ ...there, proposal: rerun }))).toMatchObject({
      reason: {
        kind: 'invalid',
        issues: [
          {
            entry: 'A1',
            field: 'evidence',
            problem: 'a session that examines for a goal does not wait for an examination itself',
          },
        ],
      },
    })
    const shown = { kind: 'set', draft: SHOWN } as const
    value(await w.goals.write(OWNER, w.direct({ ...there, proposal: shown })))
  })

  it('settings that cannot be read are no basis for a write or a proposal, never their defaults; the port throwing is the same', async () => {
    const w = world()
    w.judging.readable(false)
    expect(await w.goals.write(OWNER, w.direct())).toEqual({ kind: 'basis-unavailable' })
    expect(await w.goals.propose(OWNER, { session: SESSION, proposal: SET })).toEqual({
      kind: 'basis-unavailable',
    })
    w.judging.readable(true)
    Object.assign(w.judging, { examination: () => Promise.reject(new Error('down')) })
    expect(await w.goals.write(OWNER, w.direct())).toEqual({ kind: 'basis-unavailable' })
    expect(w.store.rows(TENANT)).toEqual([])
    expect(DRAFT.criteria).toHaveLength(1)
  })
})
