import { describe, expect, it } from 'vitest'
import type { ModelCallId, ResultVersion } from '@omne-harness/model-contract'
import {
  decisionCompletion,
  GOAL_DECISIONS_CONSUMER,
  GOAL_DECISIONS_SOURCE,
  verifyDecisionHandoff,
} from '../src/index.ts'
import { ANSWERS, ask, PRINCIPAL, sealed, TENANT, world } from './world.ts'

describe('one decision call of a judging', () => {
  it('is prepared for its model, admitted under identities derived from what is asked, read and acknowledged', async () => {
    const w = world()
    expect(await w.decisions.ask(ask())).toEqual(ANSWERS)
    expect(w.log).toEqual([
      'inspect',
      'prepare',
      'admit',
      'inspect',
      'beginRead',
      'closeRead',
      'acknowledge',
    ])
    const [prepared] = w.prepared
    expect(prepared).toMatchObject({
      principal: PRINCIPAL,
      model: 'openai/gpt-6-luna-decisions',
      ask: ask().request,
      source: GOAL_DECISIONS_SOURCE,
    })
    expect(prepared?.message).toMatch(/^msg_[0-9a-f]{40}$/u)
    const [id] = [...w.calls.keys()]
    expect(id).toMatch(/^mcall_goal_[0-9a-f]{40}$/u)
    expect(w.only().consumer).toEqual({
      owner: GOAL_DECISIONS_CONSUMER,
      work: 'session-1',
      position: '1.1.0/0/0/0',
      purpose: 'judge',
    })
    expect(w.only().acknowledged).toEqual([
      {
        result: 'v1',
        evidence: {
          kind: 'processed',
          completion: decisionCompletion(id as ModelCallId, 'v1' as ResultVersion),
        },
      },
    ])
  })

  it('reads under an operation of its own each time, whatever the clock reads', async () => {
    const w = world()
    w.state.time = 21072.058083
    expect(await w.decisions.ask(ask())).toEqual(ANSWERS)
    expect(await w.decisions.ask(ask())).toBeNull()
    expect(w.reads).toHaveLength(2)
    expect(new Set(w.reads).size).toBe(2)
    for (const operation of w.reads)
      expect(operation).toMatch(/^mop_goal_[0-9a-f]{40}_read_[0-9a-f]{32}$/u)
  })

  it('names each step of a call by an operation of its own under the identity of the call, and closes the read it began', async () => {
    const done = world()
    await done.decisions.ask(ask())
    const [id] = [...done.calls.keys()]
    const key = id?.slice('mcall_goal_'.length)
    expect(done.operations).toEqual([`mop_goal_${key}_admit`, `mop_goal_${key}_acknowledge`])
    expect(done.closed).toEqual([{ call: id, read: 'read-1' }])
    const late = world()
    late.state.next.looks = null
    await late.decisions.ask(ask())
    expect(late.operations.at(-1)).toMatch(/^mop_goal_[0-9a-f]{40}_cancel$/u)
  })

  it('gives no answer, and still hands the result over, when the read cannot begin or ends before its last page', async () => {
    const shut = world()
    shut.state.fail.add('beginRead')
    expect(await shut.decisions.ask(ask())).toBeNull()
    expect(shut.only().acknowledged).toHaveLength(1)
    expect(shut.closed).toEqual([])
    const cut = world()
    cut.state.next.pages = [[], sealed(ANSWERS)]
    cut.state.endsAt = 1
    expect(await cut.decisions.ask(ask())).toBeNull()
    expect(cut.closed).toHaveLength(1)
  })

  it('reads sixty-four pages of a result and no more: a longer one gives no answer', async () => {
    const pagesOf = (count: number) => [
      ...Array.from({ length: count - 1 }, () => []),
      sealed(ANSWERS),
    ]
    const whole = world()
    whole.state.next.pages = pagesOf(64)
    expect(await whole.decisions.ask(ask())).toEqual(ANSWERS)
    const long = world()
    long.state.next.pages = pagesOf(65)
    expect(await long.decisions.ask(ask())).toBeNull()
    expect(long.log.filter(step => step === 'readNext')).toHaveLength(64)
  })

  it('waits for a call that has not settled, a look at a time', async () => {
    const w = world()
    w.state.next.looks = 3
    expect(await w.decisions.ask(ask())).toEqual(ANSWERS)
    expect(w.log.filter(step => step === 'inspect')).toHaveLength(5)
    expect(w.state.time).toBe(40)
    expect(w.log).not.toContain('cancel')
  })

  it('past its deadline is cancelled and gives no answer', async () => {
    const w = world()
    w.state.next.looks = null
    expect(await w.decisions.ask(ask())).toBeNull()
    expect(w.only().cancelled).toBe(true)
    expect(w.state.time).toBe(100)
    expect(w.log).not.toContain('beginRead')
  })

  it('that Model has no room for yet is offered again, a look at a time, until it is taken', async () => {
    const w = world()
    w.state.full = 2
    expect(await w.decisions.ask(ask())).toEqual(ANSWERS)
    expect(w.log.filter(step => step === 'admit')).toHaveLength(3)
    expect(w.state.time).toBe(30)
    expect(w.calls.size).toBe(1)
  })

  it('that Model never has room for gives no answer at its deadline, and nothing is cancelled', async () => {
    const w = world()
    w.state.full = Number.POSITIVE_INFINITY
    expect(await w.decisions.ask(ask())).toBeNull()
    expect(w.state.time).toBe(100)
    expect(w.calls.size).toBe(0)
    expect(w.log).not.toContain('cancel')
  })

  it('that Model refuses for any other reason gives no answer at once', async () => {
    const w = world()
    w.state.refuse = true
    expect(await w.decisions.ask(ask())).toBeNull()
    expect(w.state.time).toBe(0)
    expect(w.log.filter(step => step === 'admit')).toHaveLength(1)
  })

  it('asked again under the same identity is the same call: it is not admitted twice', async () => {
    const w = world()
    w.state.next.looks = null
    expect(await w.decisions.ask(ask())).toBeNull()
    w.only().looks = 0
    w.only().acknowledged.length = 0
    expect(await w.decisions.ask(ask())).toEqual(ANSWERS)
    expect(w.log.filter(step => step === 'admit')).toHaveLength(1)
    expect(w.calls.size).toBe(1)
  })

  it('is another call under another identity, another session or another tenant', async () => {
    const w = world()
    await w.decisions.ask(ask())
    await w.decisions.ask(ask({ identity: '1.1.0/0/0/1' }))
    await w.decisions.ask(ask({ session: 'session-2' }))
    expect(w.calls.size).toBe(3)
  })

  it('whose result was already taken gives no answer: nothing is read twice', async () => {
    const w = world()
    await w.decisions.ask(ask())
    expect(await w.decisions.ask(ask())).toBeNull()
    expect(w.log.filter(step => step === 'admit')).toHaveLength(1)
  })

  it('that failed is acknowledged and gives no answer', async () => {
    const w = world()
    w.state.next.termination = {
      kind: 'failed',
      fault: { cause: 'upstream-unavailable', diagnostic: 'http-503', upstreamStatus: '503' },
    }
    expect(await w.decisions.ask(ask())).toBeNull()
    expect(w.log).not.toContain('beginRead')
    expect(w.only().acknowledged).toHaveLength(1)
  })

  it('reads a result of several pages in order, and gives no answer for one that is no decision block', async () => {
    const paged = world()
    paged.state.next.pages = [[], sealed(ANSWERS)]
    expect(await paged.decisions.ask(ask())).toEqual(ANSWERS)
    expect(paged.log.filter(step => step === 'readNext')).toHaveLength(1)
    const odd = world()
    odd.state.next.pages = [[{ kind: 'partial', content: 'text', value: '{}', trims: [] }]]
    expect(await odd.decisions.ask(ask())).toBeNull()
    expect(odd.only().acknowledged).toHaveLength(1)
  })
})

describe('what a decision call stands on', () => {
  it('gives no answer, and admits nothing, while Model or its preparation is away or refuses', async () => {
    const away = world()
    away.state.modelAway = true
    expect(await away.decisions.ask(ask())).toBeNull()
    expect(away.log).toEqual([])
    const unprepared = world()
    unprepared.state.preparationAway = true
    expect(await unprepared.decisions.ask(ask())).toBeNull()
    expect(unprepared.log).toEqual(['inspect'])
    for (const step of ['prepare', 'inspect'] as const) {
      const w = world()
      w.state.fail.add(step)
      expect(await w.decisions.ask(ask())).toBeNull()
      expect(w.calls.size).toBe(0)
      expect(w.state.time).toBe(0)
    }
  })

  it('gives no answer for a text that names no tenant, or a caller that is no principal of Model: nothing is asked', async () => {
    const w = world()
    const caller = { tenant: 'not-a-tenant', subject: PRINCIPAL }
    expect(await w.decisions.ask(ask({ caller }))).toBeNull()
    const stranger = { tenant: TENANT, subject: { subject: 'somebody else' } }
    expect(await w.decisions.ask(ask({ caller: stranger }))).toBeNull()
    expect(w.log).toEqual([])
  })
})

describe('the proof of a handoff', () => {
  const call = 'mcall_goal_0123456789abcdef0123456789abcdef01234567' as ModelCallId
  const result = 'v1' as ResultVersion
  const consumer = { owner: GOAL_DECISIONS_CONSUMER, work: 's', position: 'p', purpose: 'judge' }
  const completion = decisionCompletion(call, result)
  const given = { call, result, consumer, evidence: { kind: 'processed', completion } }

  it('names the call under the owner of the decisions, and the source of a request by its name and revision', () => {
    expect(completion).toMatchObject({
      owner: '@omne-harness/goal-decisions',
      record: call,
      revision: '1',
    })
    expect(completion.digest).toMatch(/^[0-9a-f]{64}$/u)
    expect(decisionCompletion(call, 'v2' as ResultVersion).digest).not.toBe(completion.digest)
    expect(GOAL_DECISIONS_SOURCE).toMatchObject({
      owner: '@omne-harness/goal-decisions',
      name: 'judge-request',
      revision: '1',
    })
    expect(GOAL_DECISIONS_SOURCE.digest).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('is accepted for the call and the result it names', () => {
    expect(verifyDecisionHandoff(given)).toEqual(completion)
  })

  it('is refused for another owner, another kind of evidence, another call or another result', () => {
    const other = { ...consumer, owner: '@omne-harness/agent' }
    expect(verifyDecisionHandoff({ ...given, consumer: other })).toBeNull()
    expect(verifyDecisionHandoff({ ...given, evidence: { kind: 'retained' } })).toBeNull()
    expect(
      verifyDecisionHandoff({ ...given, evidence: { kind: 'retained', completion } }),
    ).toBeNull()
    expect(verifyDecisionHandoff({ ...given, result: 'v2' as ResultVersion })).toBeNull()
    const another = `${call.slice(0, -1)}8` as ModelCallId
    expect(verifyDecisionHandoff({ ...given, call: another })).toBeNull()
  })
})
