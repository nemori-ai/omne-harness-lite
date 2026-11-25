import { describe, expect, it } from 'vitest'
import { DROP_OPTION, readConfirmOption } from '@omne-harness/goal-contract'
import { cardOf, PROPOSE_CLOSED_RESULT, proposeExecutor, replyOf, shown } from '../src/index.ts'
import { ADD_RULE, CALL, DRAFT, selection, SESSION, TENANT, words, world } from './world.ts'

type Question = {
  cardId: string
  kind: string
  title: string
  description: string
  declineConsequence: string
  options: { id: string; label: string; description: string }[]
}
const cardOfRequest = (request: unknown) => (request as { questions: Question[] }).questions[0]!
const ok = (answer: { ok: string } | { failure: unknown }): string => {
  if (!('ok' in answer)) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

/** Sets the goal of the world through a confirmed card, as a person and an agent do. */
async function standing(made: ReturnType<typeof world>) {
  const first = await made.proposed({ body: DRAFT })
  if ('failure' in first) throw new Error(JSON.stringify(first.failure))
  const card = cardOfRequest(first.request)
  await made.answer(first.state, card as never, selection(card.options[0]!.id))
}

describe('show', () => {
  it('says so when the session has no goal', async () => {
    const { run } = world()
    expect(ok(await run({ command: 'show', params: {} }))).toBe(
      'done Goal show\nThis session has no goal. If the person wants one, draft it and call propose.',
    )
  })
  it('gives where the goal stands, the body, the gap of each entry and the progress list', async () => {
    const made = world()
    await standing(made)
    const text = ok(await made.run({ command: 'show', params: {} }))
    expect(text).toContain('Goal: in progress (revision 1, 0 rounds used)')
    expect(text).toContain('## 目的\n把首页的加载时间降下来')
    expect(text).toContain('- [A1] 端到端用例全过')
    expect(text).toContain('## Gap\n')
    expect(text).toContain('## Your progress list\n{"criteria":{}')
    const record = made.record()
    if (record === null) throw new Error('no goal')
    const body = '## 目的\n把首页的加载时间降下来\n\n## 达成\n- [A1] 端到端用例全过'
    expect(
      shown(record).startsWith(`Goal: in progress (revision 1, 0 rounds used)\n\n${body}`),
    ).toBe(true)
    expect(shown(record)).toMatch(/\S\n\n## Gap\n\S[^]*\S\n\n## Your progress list\n\{/u)
  })
  it('says where a paused goal and a settled one stand', async () => {
    const made = world()
    await standing(made)
    await made.goals.command(made.caller, { session: SESSION, command: { kind: 'pause' } })
    expect(ok(await made.run({ command: 'show', params: {} }))).toContain(
      'Goal: paused by person (revision 1, 0 rounds used)',
    )
    await made.goals.command(made.caller, { session: SESSION, command: { kind: 'cancel' } })
    expect(ok(await made.run({ command: 'show', params: {} }))).toContain(
      'Goal: settled: cancelled (revision 1, 0 rounds used)',
    )
  })
  it('a read that throws has no basis; an update of the list that throws has an unknown result', async () => {
    const made = world()
    await standing(made)
    const down = async () => {
      throw new Error('down')
    }
    Object.assign(made.goals, { read: down, track: down })
    expect(await made.run({ command: 'show', params: {} })).toMatchObject({
      failure: { kind: 'unavailable', operation: 'Goal.show' },
    })
    expect(await made.run({ command: 'track', params: { notes: ['x'] } })).toMatchObject({
      failure: { kind: 'unknown', operation: 'Goal.track' },
    })
  })
})

describe('propose', () => {
  it('puts up one card that shows the whole body and carries what it was drafted against; nothing is set by it', async () => {
    const made = world()
    const first = await made.proposed({ body: DRAFT })
    if ('failure' in first) throw new Error('refused')
    const card = cardOfRequest(first.request)
    expect(card).toMatchObject({
      cardId: 'goal',
      kind: 'question',
      title: '确认这个目标',
      declineConsequence: '不设目标，会话照常进行。',
    })
    expect(card.description).toContain('## 达成\n- [A1] 端到端用例全过')
    expect(card.options.map(option => option.label)).toEqual(['确认', '不设了'])
    expect(readConfirmOption(card.options[0]!.id)).toMatchObject({
      base: { generation: 0, revision: 0, live: false },
    })
    expect(card.options[1]!.id).toBe(DROP_OPTION)
    expect(first.wait).toMatchObject({ kind: 'ask', key: 'propose' })
    expect(first.closed).toBe(PROPOSE_CLOSED_RESULT)
    expect(PROPOSE_CLOSED_RESULT).toContain('The card is still open and nothing was set')
    expect(made.record()).toBeNull()
  })

  it('a body that does not stand comes back at once with the entry and the field, and no card', async () => {
    const made = world()
    const bad = {
      ...DRAFT,
      criteria: [{ statement: '到目标', evidence: { kind: 'metric', metric: 'M9' } }],
    }
    const first = await made.proposed({ body: bad })
    expect(first).toEqual({
      failure: {
        kind: 'invalid',
        reason: 'invalid: A1.evidence: there is no metric M9. Fix these and send it again.',
      },
    })
  })

  it('confirmed: the goal stands on that card, drafted by the agent, and the call says to go on', async () => {
    const made = world()
    const first = await made.proposed({ body: DRAFT })
    if ('failure' in first) throw new Error('refused')
    const card = cardOfRequest(first.request)
    const done = await made.answer(first.state, card as never, selection(card.options[0]!.id))
    expect(done).toEqual({
      text: 'done Goal propose\nThe person confirmed. The goal stands as revision 1. Go on with the work in this turn; use show to read it and how far you are.',
    })
    expect(made.record()).toMatchObject({
      state: { status: 'active', revision: 1 },
      history: [
        { via: 'card', draftedBy: 'agent', operation: CALL, confirmedBy: 'entry:tenant-1' },
      ],
    })
    expect(made.sessions.woken).toEqual([])
  })

  it('their own words instead of a choice are changes they want: handed back, nothing set', async () => {
    const made = world()
    const first = await made.proposed({ body: DRAFT })
    if ('failure' in first) throw new Error('refused')
    const done = await made.answer(first.state, {} as never, words('预算改成 20 轮'))
    expect(done.text).toContain('They answered with what they want changed:\n预算改成 20 轮\n')
    expect(made.record()).toBeNull()
  })

  it.each([
    ['the other option', selection(DROP_OPTION)],
    ['a skip', { kind: 'declined' } as const],
    ['no answer', { kind: 'no-answer' } as const],
    [
      'no answer on the card',
      { kind: 'answer', value: { answers: [{ cardId: 'goal', kind: 'no-answer' }] } } as const,
    ],
  ])('%s sets nothing', async (_name, response) => {
    const made = world()
    const first = await made.proposed({ body: DRAFT })
    if ('failure' in first) throw new Error('refused')
    const done = await made.answer(first.state, {} as never, response)
    expect(done.text).toBe(
      'done Goal propose\nThe person chose not to. Nothing was set and the goal, if there is one, stands as it was.',
    )
    expect(made.record()).toBeNull()
  })

  it('changes to a goal that stands are proposed by number; the title names what changes', async () => {
    const made = world()
    await standing(made)
    const second = world(SESSION, 'call-ref-2')
    void second
    const first = await made.proposed({ changes: ADD_RULE })
    if ('failure' in first) throw new Error(JSON.stringify(first.failure))
    const card = cardOfRequest(first.request)
    expect(card.title).toBe('修改目标：N2')
    const base = { generation: 1, revision: 1, live: true }
    const two = cardOf({ kind: 'revise', rendered: 'x', digest: 'd', base, changed: ['N1', 'N2'] })
    expect(two.title).toBe('修改目标：N1、N2')
    const changed = Array.from({ length: 200 }, (_, index) => `A${String(index + 1)}`)
    const many = cardOf({ kind: 'revise', rendered: 'x', digest: 'd', base, changed })
    expect([...many.title]).toHaveLength(256)
    expect(card.declineConsequence).toBe('目标保持原样。')
    expect(readConfirmOption(card.options[0]!.id)?.base).toEqual({
      generation: 1,
      revision: 1,
      live: true,
    })
  })

  it('a card drafted before the goal changed writes nothing: the call fails and says to propose again', async () => {
    const made = world()
    const first = await made.proposed({ body: DRAFT })
    if ('failure' in first) throw new Error('refused')
    const card = cardOfRequest(first.request)
    const direct = {
      session: SESSION,
      operation: 'op-direct',
      proposal: { kind: 'set', draft: DRAFT },
      words: null,
      draftedBy: 'person',
      by: 'acc-1',
    } as const
    await made.goals.write(made.caller, direct)
    const done = await made.answer(first.state, card as never, selection(card.options[0]!.id))
    expect(done).toEqual({
      failure: {
        kind: 'conflict',
        reason:
          'stale-base: the goal changed after this card was drafted; read it with show and propose again',
      },
    })
    expect(made.record()?.history.map(entry => entry.operation)).toEqual(['op-direct'])
  })

  it('an answer that is not the answer to its card, or a kept state it cannot read, fails the call', async () => {
    const made = world()
    const first = await made.proposed({ body: DRAFT })
    if ('failure' in first) throw new Error('refused')
    const other = {
      kind: 'answer',
      value: { answers: [{ cardId: 'q1', kind: 'selection', optionId: 'x' }] },
    } as const
    expect(await made.answer(first.state, {} as never, other)).toMatchObject({
      failure: { kind: 'invalid' },
    })
    const broken = new TextEncoder().encode('{')
    expect(await made.answer(broken, {} as never, selection(DROP_OPTION))).toMatchObject({
      failure: { kind: 'invalid' },
    })
    const odd = [
      null,
      { answers: [] },
      { answers: [{ cardId: 'goal', kind: 'selection' }] },
      { answers: [{ cardId: 'goal', kind: 'text', text: 5 }] },
      { answers: [{ cardId: 'goal', kind: 'ranking', optionId: 'drop', text: 'x' }] },
    ]
    for (const value of odd) expect(replyOf({ kind: 'answer', value })).toBeUndefined()
    expect(replyOf(selection('confirm/0.0.0/x'))).toEqual({ kind: 'confirmed' })
    expect(replyOf(words('改'))).toEqual({ kind: 'words', text: '改' })
    const unknownKind = new TextEncoder().encode(JSON.stringify({ kind: 'pause' }))
    expect(await made.answer(unknownKind, {} as never, selection(DROP_OPTION))).toEqual({
      failure: { kind: 'invalid', reason: 'the answer is not the answer to the card of this call' },
    })
  })

  it('where nobody attends the domain refuses a proposal even if the command were offered', async () => {
    const made = world('job-1')
    expect(await made.proposed({ body: DRAFT })).toEqual({
      failure: {
        kind: 'unsupported',
        reason: 'nobody-attends: nobody attends this session, so its goal is not changed here',
      },
    })
  })
})

describe('track', () => {
  it('updates the list by number and answers the list as it stands', async () => {
    const made = world()
    await standing(made)
    made.calls.made('call-44')
    const patch = { criteria: { A1: { status: 'claimed-done', refs: ['call-44'], note: '全过' } } }
    const text = ok(await made.run({ command: 'track', params: patch as never }))
    expect(text).toContain(
      'done Goal track\n{"criteria":{"A1":{"status":"claimed-done","refs":["call-44"],"note":"全过"}}',
    )
    expect(ok(await made.run({ command: 'show', params: {} }))).toContain(
      '"A1":{"status":"claimed-done"',
    )
  })
  it('a reference that names no call of this session since the goal was set fails at once', async () => {
    const made = world()
    await standing(made)
    const patch = { criteria: { A1: { status: 'claimed-done', refs: ['call-9'], note: '' } } }
    expect(await made.run({ command: 'track', params: patch as never })).toEqual({
      failure: {
        kind: 'invalid',
        reason:
          'invalid: body.refs: no tool call of this session since the goal was set: call-9. Fix these and send it again.',
      },
    })
  })
  it('there is nothing to track without a goal', async () => {
    const made = world()
    expect(await made.run({ command: 'track', params: { notes: ['x'] } })).toMatchObject({
      failure: { kind: 'conflict', reason: expect.stringContaining('no-live-goal') },
    })
  })
})

describe('no command changes the state of a goal', () => {
  it('show, track, help and an unconfirmed proposal leave the state as it was, in progress and paused', async () => {
    const made = world()
    await standing(made)
    for (const pause of [false, true]) {
      if (pause)
        await made.goals.command(made.caller, { session: SESSION, command: { kind: 'pause' } })
      const before = made.record()?.state
      await made.run({ command: 'show', params: {} })
      await made.run({ command: 'help', params: {} })
      await made.run({ command: 'track', params: { notes: ['still here'] } })
      const first = await made.proposed({ changes: ADD_RULE })
      if ('failure' in first) throw new Error(JSON.stringify(first.failure))
      await made.answer(first.state, {} as never, selection(DROP_OPTION))
      expect(made.record()?.state).toEqual(before)
    }
    expect(made.record()?.state.status).toBe('paused')
  })
})

describe('a call that cannot reach the goal services', () => {
  it('fails as unavailable: unattached, the services absent, or the context of another tenant', async () => {
    const { answerGoal, bindGoal, attachGoal } = await import('../src/index.ts')
    const context = { signal: new AbortController().signal }
    expect(await answerGoal({ command: 'show', params: {} }, context)).toMatchObject({
      failure: { kind: 'unavailable', reason: 'the goal services are not attached to this call' },
    })
    const scope = { context, limits: {}, finish: async () => {} } as never
    const caller = { tenant: 'tenant-2', subject: 'work' }
    const made = world()
    attachGoal(
      scope,
      bindGoal({
        tenant: TENANT,
        call: CALL,
        goals: () => made.goals,
        context: async () => ({ caller, session: SESSION }),
      }),
    )
    expect(await answerGoal({ command: 'show', params: {} }, context)).toMatchObject({
      failure: { reason: 'this call does not act as a session of the tenant' },
    })
    const absent = { signal: new AbortController().signal }
    attachGoal(
      { context: absent, limits: {}, finish: async () => {} } as never,
      bindGoal({
        tenant: TENANT,
        call: CALL,
        goals: () => undefined,
        context: async () => undefined,
      }),
    )
    expect(await answerGoal({ command: 'show', params: {} }, absent)).toMatchObject({
      failure: { reason: 'the goal services are not available now' },
    })
  })
})

describe('propose when the goal services cannot be reached or do not answer', () => {
  const args = { command: 'propose', params: { body: DRAFT } } as never
  it('fails as unavailable before any card when the call is not attached', async () => {
    const context = { signal: new AbortController().signal } as never
    expect(await proposeExecutor.initial(args, null, context)).toEqual({
      failure: {
        kind: 'unavailable',
        operation: 'Goal.propose',
        reason: 'the goal services are not attached to this call',
      },
    })
    const state = new TextEncoder().encode(JSON.stringify({ kind: 'set', draft: DRAFT }))
    const resumed = await proposeExecutor.resume(
      { checkpoint: state, response: selection('confirm/0.0.0/x') },
      null,
      context,
    )
    expect(resumed).toMatchObject({ failure: { kind: 'unavailable', operation: 'Goal.propose' } })
  })
  it('puts up no card when the services have no basis or throw', async () => {
    const made = world()
    made.store.readable(false)
    expect(await made.proposed({ body: DRAFT })).toMatchObject({
      failure: { kind: 'unavailable', operation: 'Goal.propose' },
    })
    made.store.readable(true)
    Object.assign(made.goals, {
      propose: async () => {
        throw new Error('down')
      },
    })
    expect(await made.proposed({ body: DRAFT })).toMatchObject({
      failure: { kind: 'unavailable', operation: 'Goal.propose' },
    })
  })
  it('a confirmation whose write throws has an unknown result: the call says to read before sending again', async () => {
    const made = world()
    const first = await made.proposed({ body: DRAFT })
    if ('failure' in first) throw new Error('refused')
    const card = cardOfRequest(first.request)
    Object.assign(made.goals, {
      confirm: async () => {
        throw new Error('down')
      },
    })
    const done = await made.answer(first.state, card as never, selection(card.options[0]!.id))
    expect(done).toMatchObject({ failure: { kind: 'unknown', operation: 'Goal.propose' } })
  })
})
