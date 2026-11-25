import { describe, expect, it } from 'vitest'
import { renderBody, type Proposal } from '@omne-harness/goal-contract'
import {
  ADD_RULE,
  JOB,
  OWNER,
  refusal,
  revisionOf,
  SESSION,
  SET,
  TENANT,
  value,
  world,
} from './world.ts'

describe('the direct way in', () => {
  it('sets a goal on the standing of the caller, and keeps where it came from', async () => {
    const { goals, direct } = world()
    const set = value(await goals.write(OWNER, direct()))
    expect(set.state).toMatchObject({ status: 'active', generation: 1, revision: 1, rounds: 0 })
    expect(set.history).toEqual([
      {
        revision: 1,
        via: 'direct',
        words: '把首页降下来',
        draftedBy: 'person',
        confirmedBy: 'acc-1',
        operation: 'op-1',
        at: '2026-11-25T00:00:01.000Z',
      },
    ])
    const { state, body, history } = set
    expect(value(await goals.read(OWNER, SESSION))).toMatchObject({ state, body, history })
  })

  it('asks the authority for the action on the session, and writes nothing when it says no', async () => {
    const { goals, direct, authority, store } = world()
    authority.answer('denied')
    expect(refusal(await goals.write(OWNER, direct()))).toEqual({ kind: 'denied' })
    expect(authority.asked).toEqual([{ caller: OWNER, session: SESSION, action: 'set' }])
    expect(store.rows(TENANT)).toEqual([])
    authority.answer('unavailable')
    expect(await goals.write(OWNER, direct())).toEqual({ kind: 'basis-unavailable' })
    expect(await goals.read(OWNER, SESSION)).toEqual({ kind: 'basis-unavailable' })
  })

  it('asks for each action by its own name', async () => {
    const { goals, direct, authority } = world()
    value(await goals.write(OWNER, direct()))
    value(await goals.write(OWNER, direct({ operation: 'op-2', proposal: ADD_RULE })))
    await goals.propose(OWNER, { session: SESSION, proposal: ADD_RULE })
    await goals.confirm(OWNER, {
      session: SESSION,
      card: 'card-9',
      proposal: ADD_RULE,
      words: null,
    })
    for (const kind of ['pause', 'resume', 'cancel', 'abort'] as const)
      await goals.command(OWNER, { session: SESSION, command: { kind } })
    await goals.command(OWNER, {
      session: SESSION,
      command: { kind: 'settle-by-exit', exit: 'X1' },
    })
    await goals.read(OWNER, SESSION)
    expect(authority.asked.map(asked => asked.action)).toEqual(
      ['set', 'revise', 'propose', 'confirm', 'pause', 'resume', 'cancel', 'abort'].concat([
        'settle-by-exit',
        'read',
      ]),
    )
  })

  it('a body that does not stand is refused with the entry and the field, and nothing is written', async () => {
    const { goals, direct, store } = world()
    const draft = { purpose: '降下来', criteria: [] }
    const reason = refusal(await goals.write(OWNER, direct({ proposal: { kind: 'set', draft } })))
    expect(reason).toMatchObject({ kind: 'invalid', issues: [{ entry: null, field: 'criteria' }] })
    expect(store.rows(TENANT)).toEqual([])
  })

  it('a revision takes the next revision, keeps its history and leaves the entries nobody named', async () => {
    const { goals, direct } = world()
    const set = value(await goals.write(OWNER, direct()))
    const revised = value(
      await goals.write(OWNER, direct({ operation: 'op-2', proposal: ADD_RULE, words: '加一条' })),
    )
    expect(revisionOf(revised)).toBe(2)
    expect(revised.body.rules.map(rule => rule.id)).toEqual(['N1', 'N2'])
    expect(revised.body.criteria).toEqual(set.body.criteria)
    expect(revised.history.map(entry => [entry.revision, entry.operation, entry.words])).toEqual([
      [1, 'op-1', '把首页降下来'],
      [2, 'op-2', '加一条'],
    ])
  })

  it('refuses a second goal while one is live, and a revision where none is', async () => {
    const { goals, direct } = world()
    const revise = direct({ operation: 'op-0', proposal: ADD_RULE })
    expect(refusal(await goals.write(OWNER, revise))).toEqual({
      kind: 'state',
      reason: 'no-live-goal',
    })
    value(await goals.write(OWNER, direct()))
    const second = direct({ operation: 'op-2' })
    expect(refusal(await goals.write(OWNER, second))).toEqual({
      kind: 'state',
      reason: 'goal-in-progress',
    })
  })

  it('after a goal settled, the next one is a new goal with a history of its own', async () => {
    const { goals, direct, store } = world()
    value(await goals.write(OWNER, direct()))
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'cancel' } }))
    const next = value(await goals.write(OWNER, direct({ operation: 'op-2' })))
    expect(next.state).toMatchObject({ status: 'active', generation: 2, revision: 1 })
    expect(next.history.map(entry => entry.operation)).toEqual(['op-2'])
    expect(store.rows(TENANT).map(row => row.state.status)).toEqual(['settled', 'active'])
  })

  it('a session nobody knows has no goal to set', async () => {
    const { goals, direct, sessions } = world()
    const nowhere = direct({ session: 'no-such-session' })
    expect(refusal(await goals.write(OWNER, nowhere))).toEqual({ kind: 'no-such-session' })
    sessions.readable(false)
    expect(await goals.write(OWNER, direct())).toEqual({ kind: 'basis-unavailable' })
  })

  it('in an unattended session the creator sets the goal and the body is frozen', async () => {
    const { goals, direct } = world()
    const job = { session: JOB, draftedBy: 'creator', by: 'schedule' } as const
    const set = value(await goals.write(OWNER, direct(job)))
    expect(set.state).toMatchObject({ status: 'active', attendance: 'unattended' })
    const revise = direct({ ...job, operation: 'op-2', proposal: ADD_RULE })
    expect(refusal(await goals.write(OWNER, revise))).toEqual({
      kind: 'state',
      reason: 'nobody-attends',
    })
    const person = {
      purpose: '做完',
      criteria: [{ statement: '人看过', evidence: { kind: 'person' } }],
    }
    const asks = direct({ session: 'job-2', proposal: { kind: 'set', draft: person } })
    const { goals: other, sessions } = world()
    sessions.add('job-2', 'unattended')
    expect(refusal(await other.write(OWNER, asks))).toMatchObject({
      kind: 'invalid',
      issues: [{ entry: 'A1', field: 'evidence' }],
    })
  })
})

describe('a result nobody knows', () => {
  it('is answered as unknown; the same operation again is recalled, not written twice', async () => {
    const { goals, direct, store } = world()
    store.failNext('unknown-after-commit')
    expect(await goals.write(OWNER, direct())).toEqual({ kind: 'unknown' })
    const again = await goals.write(OWNER, direct())
    expect(again).toMatchObject({ kind: 'done', recalled: true })
    expect(store.rows(TENANT)).toHaveLength(1)
  })
  it('when nothing was written, the same operation again writes it', async () => {
    const { goals, direct, store } = world()
    store.failNext('unknown-before-commit')
    expect(await goals.write(OWNER, direct())).toEqual({ kind: 'unknown' })
    expect(await goals.write(OWNER, direct())).toMatchObject({ kind: 'done', recalled: false })
  })
  it('a commit that rolled back and a store that cannot be read are no basis, not a refusal', async () => {
    const { goals, direct, store } = world()
    store.failNext('rolled-back')
    expect(await goals.write(OWNER, direct())).toEqual({ kind: 'basis-unavailable' })
    store.readable(false)
    expect(await goals.write(OWNER, direct())).toEqual({ kind: 'basis-unavailable' })
    expect(await goals.read(OWNER, SESSION)).toEqual({ kind: 'basis-unavailable' })
  })
})

describe('a confirmation card', () => {
  const confirm = (card: string, proposal: Proposal = SET) =>
    ({ session: SESSION, card, proposal, words: '/goal 把首页降下来' }) as const

  it('proposing writes nothing; it answers what the card shows and what it is drafted against', async () => {
    const { goals, store } = world()
    const proposed = value(await goals.propose(OWNER, { session: SESSION, proposal: SET }))
    expect(proposed).toMatchObject({
      kind: 'set',
      base: { generation: 0, revision: 0, live: false },
    })
    expect(proposed.rendered).toContain('## 目的\n把首页的加载时间降下来')
    expect(proposed.digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(store.rows(TENANT)).toEqual([])
  })

  it('answered by a member for this content on this base, it writes the goal, drafted by the agent', async () => {
    const { goals, answered, sessions } = world()
    await answered('card-1', SET)
    const set = value(await goals.confirm(OWNER, confirm('card-1')))
    expect(set.state).toMatchObject({ status: 'active', revision: 1 })
    expect(set.history).toEqual([
      expect.objectContaining({
        via: 'card',
        draftedBy: 'agent',
        confirmedBy: 'acc-1',
        operation: 'card-1',
        words: '/goal 把首页降下来',
      }),
    ])
    expect(sessions.woken).toEqual([])
  })

  it('refused: answered by someone who is no member of the session', async () => {
    const { goals, answered, store } = world()
    await answered('card-1', SET, { byMember: false })
    expect(refusal(await goals.confirm(OWNER, confirm('card-1')))).toEqual({
      kind: 'card',
      reason: 'not-a-member',
    })
    expect(store.rows(TENANT)).toEqual([])
  })

  it('refused: what the card showed is not the data to be written', async () => {
    const { goals, answered, store } = world()
    await answered('card-1', SET)
    const other = { kind: 'set', draft: { ...SET.draft, purpose: '把列表页降下来' } } as const
    expect(refusal(await goals.confirm(OWNER, confirm('card-1', other)))).toEqual({
      kind: 'card',
      reason: 'content-differs',
    })
    expect(store.rows(TENANT)).toEqual([])
  })

  it('refused: the goal was revised after the card was drafted', async () => {
    const { goals, answered, direct } = world()
    value(await goals.write(OWNER, direct()))
    await answered('card-1', ADD_RULE)
    const meanwhile = { kind: 'revise', changes: [{ op: 'purpose', text: '只降首页' }] } as const
    value(await goals.write(OWNER, direct({ operation: 'op-2', proposal: meanwhile })))
    expect(refusal(await goals.confirm(OWNER, confirm('card-1', ADD_RULE)))).toEqual({
      kind: 'card',
      reason: 'stale-base',
    })
    expect(revisionOf(value(await goals.read(OWNER, SESSION)))).toBe(2)
  })

  it('refused: answered with something other than the confirm option, or not held at all', async () => {
    const { goals, answered } = world()
    await answered('card-1', SET, { confirmed: false })
    expect(refusal(await goals.confirm(OWNER, confirm('card-1')))).toEqual({
      kind: 'card',
      reason: 'not-confirmed',
    })
    expect(refusal(await goals.confirm(OWNER, confirm('card-2')))).toEqual({ kind: 'no-such-card' })
  })

  it('takes effect once: the same card again is recalled, and it writes no second proposal', async () => {
    const { goals, answered, store, direct } = world()
    value(await goals.write(OWNER, direct()))
    await answered('card-1', ADD_RULE)
    expect(revisionOf(value(await goals.confirm(OWNER, confirm('card-1', ADD_RULE))))).toBe(2)
    const again = await goals.confirm(OWNER, confirm('card-1', ADD_RULE))
    expect(again).toMatchObject({ kind: 'done', recalled: true })
    expect(revisionOf(value(again))).toBe(2)
    const more = { kind: 'revise', changes: [{ op: 'purpose', text: '别的' }] } as const
    const reused = await goals.confirm(OWNER, confirm('card-1', more))
    expect(revisionOf(value(reused))).toBe(2)
    expect(store.rows(TENANT)[0]?.body.purpose).toBe('把首页的加载时间降下来')
  })

  it('a revision confirmed on a card resumes a paused goal; one by the direct way leaves it paused', async () => {
    const { goals, answered, direct } = world()
    value(await goals.write(OWNER, direct()))
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'pause' } }))
    const stays = value(await goals.write(OWNER, direct({ operation: 'op-2', proposal: ADD_RULE })))
    expect(stays.state.status).toBe('paused')
    const more = { kind: 'revise', changes: [{ op: 'purpose', text: '只降首页' }] } as const
    await answered('card-1', more)
    const resumed = value(await goals.confirm(OWNER, confirm('card-1', more)))
    expect(resumed.state).toMatchObject({ status: 'active', revision: 3 })
  })

  it('there is no card where nobody attends, and no basis while the card cannot be read', async () => {
    const { goals, answered, cards } = world()
    const card = await answered('card-1', SET)
    cards.readable(false)
    expect(await goals.confirm(OWNER, confirm('card-1'))).toEqual({ kind: 'basis-unavailable' })
    cards.readable(true)
    cards.answer({ ...card, card: 'card-j' })
    const onJob = { ...confirm('card-j'), session: JOB }
    expect(refusal(await goals.confirm(OWNER, onJob))).toEqual({
      kind: 'state',
      reason: 'nobody-attends',
    })
  })
})

describe("the owner's commands", () => {
  const send = (
    goals: ReturnType<typeof world>['goals'],
    kind: 'pause' | 'resume' | 'cancel' | 'abort',
  ) => goals.command(OWNER, { session: SESSION, command: { kind } })

  it('pause, resume and cancel go by the transition table; a command that changes nothing writes nothing', async () => {
    const { goals, direct, store } = world()
    expect(await send(goals, 'cancel')).toEqual({ kind: 'done', value: null, recalled: false })
    expect(refusal(await send(goals, 'pause'))).toEqual({ kind: 'state', reason: 'no-live-goal' })
    value(await goals.write(OWNER, direct()))
    expect(value(await send(goals, 'pause'))?.state).toMatchObject({ status: 'paused' })
    const version = store.rows(TENANT)[0]?.version
    expect(value(await send(goals, 'pause'))?.state.status).toBe('paused')
    expect(store.rows(TENANT)[0]?.version).toBe(version)
    expect(value(await send(goals, 'resume'))?.state.status).toBe('active')
    expect(refusal(await send(goals, 'abort'))).toEqual({ kind: 'state', reason: 'attended' })
    const cancelled = value(await send(goals, 'cancel'))
    expect(cancelled?.state).toMatchObject({ status: 'settled', outcome: { kind: 'cancelled' } })
  })

  it('settling by an exit needs that exit to be why the goal stands paused', async () => {
    const { goals, direct } = world()
    value(await goals.write(OWNER, direct()))
    const settle = (exit: 'X1' | 'X9') =>
      goals.command(OWNER, { session: SESSION, command: { kind: 'settle-by-exit', exit } })
    expect(refusal(await settle('X9'))).toEqual({ kind: 'state', reason: 'not-its-cause' })
    expect(refusal(await settle('X1'))).toEqual({ kind: 'state', reason: 'not-its-cause' })
  })
})

describe('the reminder a change owes its session', () => {
  it('a goal set by the direct way wakes the session with the body, once', async () => {
    const { goals, direct, sessions, store } = world()
    const set = value(await goals.write(OWNER, direct()))
    expect(sessions.woken).toEqual([
      { kind: 'start', request: 'start/1/1', session: SESSION, rendered: renderBody(set.body) },
    ])
    expect(store.rows(TENANT)[0]?.wake).toBeNull()
    await goals.reconcile(TENANT)
    expect(sessions.woken).toHaveLength(1)
  })

  it('a send nobody knows the fate of stays owed; reconciling sends the same request again', async () => {
    const { goals, direct, sessions, store, hinted } = world()
    sessions.sendNext('unknown')
    value(await goals.write(OWNER, direct()))
    expect(store.rows(TENANT)[0]?.wake).toEqual({ kind: 'start', request: 'start/1/1' })
    expect(hinted).toEqual([TENANT])
    await goals.reconcile(TENANT)
    expect(sessions.woken.map(wake => wake.request)).toEqual(['start/1/1', 'start/1/1'])
    expect(store.rows(TENANT)[0]?.wake).toBeNull()
  })

  it('a session that takes no input any more clears the debt', async () => {
    const { goals, direct, sessions, store } = world()
    sessions.sendNext('refused')
    value(await goals.write(OWNER, direct()))
    expect(store.rows(TENANT)[0]?.wake).toBeNull()
  })

  it('each resume owes a reminder of its own', async () => {
    const { goals, direct, sessions } = world()
    value(await goals.write(OWNER, direct()))
    for (const kind of ['pause', 'resume', 'pause', 'resume'] as const)
      value(await goals.command(OWNER, { session: SESSION, command: { kind } }))
    const resumes = sessions.woken.filter(wake => wake.kind === 'resume').map(wake => wake.request)
    expect(resumes).toHaveLength(2)
    expect(new Set(resumes).size).toBe(2)
  })
})
