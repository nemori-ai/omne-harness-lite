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
    for (const step of ['prepare', 'admit', 'inspect'] as const) {
      const w = world()
      w.state.fail.add(step)
      expect(await w.decisions.ask(ask())).toBeNull()
      expect(w.calls.size).toBe(0)
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

  it('is accepted for the call and the result it names', () => {
    expect(verifyDecisionHandoff(given)).toEqual(completion)
  })

  it('is refused for another owner, another kind of evidence, another call or another result', () => {
    const other = { ...consumer, owner: '@omne-harness/agent' }
    expect(verifyDecisionHandoff({ ...given, consumer: other })).toBeNull()
    expect(verifyDecisionHandoff({ ...given, evidence: { kind: 'retained' } })).toBeNull()
    expect(verifyDecisionHandoff({ ...given, result: 'v2' as ResultVersion })).toBeNull()
    const another = `${call.slice(0, -1)}8` as ModelCallId
    expect(verifyDecisionHandoff({ ...given, call: another })).toBeNull()
  })
})
