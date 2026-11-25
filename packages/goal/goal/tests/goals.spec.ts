import { describe, expect, it } from 'vitest'
import {
  renderBody,
  type GoalRecord,
  type ObservedCall,
  type Proposal,
  type Readings,
} from '@omne-harness/goal-contract'
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
    })
    for (const kind of ['pause', 'resume', 'cancel', 'abort'] as const)
      await goals.command(OWNER, { session: SESSION, command: { kind } })
    await goals.command(OWNER, {
      session: SESSION,
      command: { kind: 'settle-by-exit', exit: 'X1' },
    })
    await goals.read(OWNER, SESSION)
    await goals.track(OWNER, { session: SESSION, patch: {} })
    expect(authority.asked.map(asked => asked.action)).toEqual(
      ['set', 'revise', 'propose', 'confirm', 'pause', 'resume', 'cancel', 'abort'].concat([
        'settle-by-exit',
        'read',
        'track',
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
    expect([set.since, revised.since]).toEqual(['1', '1'])
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
    expect(next.since).toBe('2')
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
    ({ session: SESSION, card, proposal }) as const

  it('proposing writes nothing; it answers what the card shows and what it is drafted against', async () => {
    const { goals, store } = world()
    const proposed = value(await goals.propose(OWNER, { session: SESSION, proposal: SET }))
    expect(proposed).toMatchObject({
      kind: 'set',
      base: { generation: 0, revision: 0, live: false },
      changed: [],
    })
    expect(proposed.rendered).toContain('## 目的\n把首页的加载时间降下来')
    expect(proposed.digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(store.rows(TENANT)).toEqual([])
  })

  it('answered by a member for this content on this base, it writes the goal, drafted by the agent', async () => {
    const { goals, answered, sessions } = world()
    sessions.ask(SESSION, { at: '30', text: '/goal 把首页降下来' })
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
      {
        kind: 'start',
        request: 'start/1/1',
        session: SESSION,
        rendered: renderBody(set.body),
        open: '- [A1] 端到端用例全过：没读过',
        implied: false,
      },
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

describe('every way in asks the authority first', () => {
  it('a caller the authority denies proposes, confirms and commands nothing', async () => {
    const { goals, direct, authority, answered, store } = world()
    value(await goals.write(OWNER, direct()))
    await answered('card-1', ADD_RULE)
    authority.answer('denied')
    const denied = { kind: 'refused', reason: { kind: 'denied' } }
    expect(await goals.propose(OWNER, { session: SESSION, proposal: ADD_RULE })).toEqual(denied)
    const confirm = { session: SESSION, card: 'card-1', proposal: ADD_RULE }
    expect(await goals.confirm(OWNER, confirm)).toEqual(denied)
    expect(await goals.command(OWNER, { session: SESSION, command: { kind: 'cancel' } })).toEqual(
      denied,
    )
    expect(await goals.read(OWNER, SESSION)).toEqual(denied)
    expect(store.rows(TENANT)[0]?.state).toMatchObject({ status: 'active', revision: 1 })
  })
  it('an authority that cannot answer is no basis for any of them', async () => {
    const { goals, authority } = world()
    authority.answer('unavailable')
    const none = { kind: 'basis-unavailable' }
    expect(await goals.propose(OWNER, { session: SESSION, proposal: SET })).toEqual(none)
    const confirm = { session: SESSION, card: 'card-1', proposal: SET }
    expect(await goals.confirm(OWNER, confirm)).toEqual(none)
    expect(await goals.command(OWNER, { session: SESSION, command: { kind: 'pause' } })).toEqual(
      none,
    )
  })
  it('an authority that throws is no basis either', async () => {
    const { goals, authority } = world()
    authority.answer(() => {
      throw new Error('down')
    })
    expect(await goals.read(OWNER, SESSION)).toEqual({ kind: 'basis-unavailable' })
  })
})

describe('proposing', () => {
  const propose = (
    goals: ReturnType<typeof world>['goals'],
    proposal: Proposal,
    session = SESSION,
  ) => goals.propose(OWNER, { session, proposal })

  it('a revision is proposed on the live goal: the card shows the body it would come to', async () => {
    const { goals, direct } = world()
    expect(refusal(await propose(goals, ADD_RULE))).toEqual({
      kind: 'state',
      reason: 'no-live-goal',
    })
    value(await goals.write(OWNER, direct()))
    const proposed = value(await propose(goals, ADD_RULE))
    expect(proposed).toMatchObject({
      kind: 'revise',
      base: { generation: 1, revision: 1, live: true },
      changed: ['N2'],
    })
    const more = [
      { op: 'replace', id: 'N1', entry: { statement: '不改公共接口与事件名。' } },
      { op: 'remove', id: 'A1' },
      {
        op: 'add',
        section: 'criteria',
        entry: { statement: '新判据', evidence: { kind: 'file', path: 'a.md' } },
      },
      { op: 'purpose', text: '只降首页' },
      { op: 'method', lines: ['先量'] },
    ]
    const many = value(await propose(goals, { kind: 'revise', changes: more }))
    expect(many.changed).toEqual(['A1', 'N1', 'A2', 'purpose', 'method'])
    expect(proposed.rendered).toContain('- [N2] 每次提交前跑 lint。')
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'cancel' } }))
    expect(refusal(await propose(goals, ADD_RULE))).toEqual({
      kind: 'state',
      reason: 'no-live-goal',
    })
    expect(value(await propose(goals, SET))).toMatchObject({
      kind: 'set',
      changed: [],
      base: { generation: 1, revision: 1, live: false },
    })
  })
  it('a body that does not stand is refused with the entry and the field', async () => {
    const { goals, direct } = world()
    const draft = { purpose: '降下来', criteria: [] }
    expect(refusal(await propose(goals, { kind: 'set', draft }))).toMatchObject({
      kind: 'invalid',
      issues: [{ entry: null, field: 'criteria' }],
    })
    value(await goals.write(OWNER, direct()))
    const person = { statement: '人看过', evidence: { kind: 'person' } }
    const asks = { kind: 'revise', changes: [{ op: 'add', section: 'criteria', entry: person }] }
    expect(value(await propose(goals, asks as Proposal)).kind).toBe('revise')
  })
  it('nothing is proposed where nobody attends, or for a session nobody knows', async () => {
    const { goals } = world()
    expect(refusal(await propose(goals, SET, JOB))).toEqual({
      kind: 'state',
      reason: 'nobody-attends',
    })
    expect(refusal(await propose(goals, SET, 'nowhere'))).toEqual({ kind: 'no-such-session' })
  })
  it('no basis while the session or the store cannot be read', async () => {
    const { goals, sessions, store } = world()
    store.readable(false)
    expect(await propose(goals, SET)).toEqual({ kind: 'basis-unavailable' })
    store.readable(true)
    sessions.readable(false)
    expect(await propose(goals, SET)).toEqual({ kind: 'basis-unavailable' })
    const confirm = { session: SESSION, card: 'card-1', proposal: SET }
    expect(await goals.confirm(OWNER, confirm)).toEqual({ kind: 'basis-unavailable' })
  })
})

describe('what a revision keeps of the readings', () => {
  const READ: Readings = {
    criteria: { A1: { value: 'holds', source: 'system', ref: 'call-1' } },
    metrics: {},
    rules: { N1: { value: 'kept', source: 'judge', ref: null } },
  }
  async function withReadings() {
    const made = world()
    const set = value(await made.goals.write(OWNER, made.direct()))
    const read = await made.store.latest(TENANT, SESSION)
    const current = (read.kind === 'read' ? read.value : null) as GoalRecord
    await made.store.commit(TENANT, {
      session: SESSION,
      expected: current.version,
      next: { ...current, readings: READ },
    })
    return { ...made, set }
  }
  it('a reading stays while the entry it read stands as it was', async () => {
    const { goals, direct } = await withReadings()
    const revised = value(
      await goals.write(OWNER, direct({ operation: 'op-2', proposal: ADD_RULE })),
    )
    expect(revised.readings).toEqual(READ)
  })
  it('the reading of an entry that was replaced or removed is dropped; the others stay', async () => {
    const { goals, direct } = await withReadings()
    const replace = { op: 'replace', id: 'N1', entry: { statement: '不改公共接口与事件名。' } }
    const first = value(
      await goals.write(
        OWNER,
        direct({ operation: 'op-2', proposal: { kind: 'revise', changes: [replace] } }),
      ),
    )
    expect(first.readings).toEqual({ ...READ, rules: {} })
    const criterion = { statement: '新判据', evidence: { kind: 'file', path: 'a.md' } }
    const changes = [
      { op: 'add', section: 'criteria', entry: criterion },
      { op: 'remove', id: 'A1' },
    ]
    const second = value(
      await goals.write(
        OWNER,
        direct({ operation: 'op-3', proposal: { kind: 'revise', changes } }),
      ),
    )
    expect(second.readings).toEqual({ criteria: {}, metrics: {}, rules: {} })
  })
  it('a new goal starts with no readings', async () => {
    const { goals, direct } = await withReadings()
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'cancel' } }))
    const next = value(await goals.write(OWNER, direct({ operation: 'op-2' })))
    expect(next.readings).toEqual({ criteria: {}, metrics: {}, rules: {} })
  })
})

describe('settling by the exit that paused the goal', () => {
  async function pausedBy(exit: 'X1' | null) {
    const made = world()
    value(await made.goals.write(OWNER, made.direct()))
    const read = await made.store.latest(TENANT, SESSION)
    const current = (read.kind === 'read' ? read.value : null) as GoalRecord
    const state = { ...current.state, status: 'paused', pause: { by: 'verdict', row: 5, exit } }
    await made.store.commit(TENANT, {
      session: SESSION,
      expected: current.version,
      next: { ...current, state } as GoalRecord,
    })
    return made
  }
  const settle = (goals: ReturnType<typeof world>['goals'], exit: 'X1' | 'X9') =>
    goals.command(OWNER, { session: SESSION, command: { kind: 'settle-by-exit', exit } })

  it('settles as that exit, counted as the body says', async () => {
    const { goals } = await pausedBy('X1')
    expect(refusal(await settle(goals, 'X9'))).toEqual({ kind: 'state', reason: 'not-its-cause' })
    expect(value(await settle(goals, 'X1'))?.state).toMatchObject({
      status: 'settled',
      outcome: { kind: 'exit', exit: 'X1', counts: 'failure' },
    })
  })
  it('an exit the body does not have, or one that is not why it paused, settles nothing', async () => {
    const { goals } = await pausedBy(null)
    expect(refusal(await settle(goals, 'X9'))).toEqual({ kind: 'state', reason: 'not-its-cause' })
    expect(refusal(await settle(goals, 'X1'))).toEqual({ kind: 'state', reason: 'not-its-cause' })
    const fresh = world()
    expect(refusal(await settle(fresh.goals, 'X1'))).toEqual({
      kind: 'state',
      reason: 'no-live-goal',
    })
  })
})

describe('a write somebody else got ahead of', () => {
  /** A world whose first commits find that somebody wrote meanwhile. */
  function racing(times: number) {
    let left = times
    const commits: number[] = []
    const made = world(store => ({
      ...store,
      async commit(tenant, command) {
        commits.push(command.expected)
        if (left === 0) return store.commit(tenant, command)
        left -= 1
        return { kind: 'committed', value: { kind: 'stale', current: null } }
      },
    }))
    return { ...made, commits }
  }
  it('is decided again on what stands then, and written', async () => {
    const { goals, direct, commits, store } = racing(2)
    expect(await goals.write(OWNER, direct())).toMatchObject({ kind: 'done', recalled: false })
    expect(commits.slice(0, 3)).toEqual([0, 0, 0])
    expect(store.rows(TENANT)).toHaveLength(1)
  })
  it('gives up after three tries with no basis, never with a guess', async () => {
    const { goals, direct, commits, store } = racing(99)
    expect(await goals.write(OWNER, direct())).toEqual({ kind: 'basis-unavailable' })
    expect(commits).toHaveLength(3)
    expect(store.rows(TENANT)).toEqual([])
  })
})

describe('more of the reminder a change owes', () => {
  it('a send that throws stays owed like one nobody knows the fate of', async () => {
    const { goals, direct, sessions, store, hinted } = world()
    const { wake } = sessions
    let thrown = false
    Object.assign(sessions, {
      wake: async (...input: Parameters<typeof wake>) => {
        if (thrown) return wake(...input)
        thrown = true
        throw new Error('down')
      },
    })
    value(await goals.write(OWNER, direct()))
    expect(store.rows(TENANT)[0]?.wake).toEqual({ kind: 'start', request: 'start/1/1' })
    expect(hinted).toEqual([TENANT])
    await goals.reconcile(TENANT)
    expect(store.rows(TENANT)[0]?.wake).toBeNull()
  })
  it('a resume names the goal and the version it was written as', async () => {
    const { goals, direct, sessions } = world()
    value(await goals.write(OWNER, direct()))
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'pause' } }))
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'resume' } }))
    expect(sessions.woken.at(-1)).toMatchObject({ kind: 'resume', request: 'resume/1/4' })
  })
  it('reconciling sends nothing while the store cannot be read', async () => {
    const { goals, direct, sessions, store } = world()
    sessions.sendNext('unknown')
    value(await goals.write(OWNER, direct()))
    store.readable(false)
    await expect(goals.reconcile(TENANT)).resolves.toBeUndefined()
    expect(sessions.woken).toHaveLength(1)
  })
})

describe('the progress list', () => {
  const DONE = { criteria: { A1: { status: 'claimed-done', refs: ['call-44'], note: '全过' } } }
  const track = (goals: ReturnType<typeof world>['goals'], patch: unknown, session = SESSION) =>
    goals.track(OWNER, { session, patch })

  it('is kept with the goal and changes nothing of its state', async () => {
    const { goals, direct, calls } = world()
    const set = value(await goals.write(OWNER, direct()))
    calls.made('call-44')
    const tracked = value(await track(goals, DONE))
    expect(tracked.progress.criteria).toEqual(DONE.criteria)
    expect(tracked.state).toEqual(set.state)
    expect(tracked.history).toEqual(set.history)
    expect(value(await goals.read(OWNER, SESSION))?.progress.criteria).toEqual(DONE.criteria)
  })

  it('a reference that names no tool call of this session since the goal was set is refused on the spot', async () => {
    const { goals, direct, calls, store } = world()
    const set = value(await goals.write(OWNER, direct()))
    calls.made('call-44')
    const patch = {
      criteria: { A1: { status: 'claimed-done', refs: ['call-44', 'call-9'], note: '' } },
    }
    expect(refusal(await track(goals, patch))).toEqual({
      kind: 'invalid',
      issues: [
        {
          entry: null,
          field: 'refs',
          problem: 'no tool call of this session since the goal was set: call-9',
        },
      ],
    })
    expect(store.rows(TENANT)[0]?.progress.criteria).toEqual({})
    expect(set.since).toBe('1')
    expect(calls.asked).toEqual([['1', 'call-44', 'call-9']])
    const two = { criteria: { A1: { status: 'doing', refs: ['call-8', 'call-9'], note: '' } } }
    expect(refusal(await track(goals, two))).toMatchObject({
      issues: [{ problem: 'no tool call of this session since the goal was set: call-8, call-9' }],
    })
  })

  it('the refusal lists the calls that can be cited, the latest twelve, each by what it ran or touched', async () => {
    const { goals, direct, history } = world()
    value(await goals.write(OWNER, direct()))
    const seen = (order: number, more: Partial<ObservedCall>): ObservedCall => ({
      ref: `call-${String(order)}`,
      order,
      tool: 'Files read',
      command: null,
      path: null,
      exit: null,
      output: 'x',
      writes: false,
      ...more,
    })
    const long = `node bench.js   && ${'x'.repeat(80)}`
    history.made(
      seen(2, { path: 'CHANGELOG.md', tool: 'Files write', writes: true }),
      seen(3, { tool: 'Shell execute', command: long, exit: 0 }),
      seen(4, { tool: 'Shell info' }),
    )
    const patch = { criteria: { A1: { status: 'doing', refs: ['call-9'], note: '' } } }
    const problemOf = async () => {
      const refused = refusal(await track(goals, patch))
      return refused.kind === 'invalid' ? refused.issues[0]?.problem : refused.kind
    }
    expect(await problemOf()).toBe(
      'no tool call of this session since the goal was set: call-9. Those you can cite: ' +
        `call-2 Files write CHANGELOG.md; call-3 Shell execute \`node bench.js && ${'x'.repeat(43)}…\`; call-4 Shell info`,
    )
    history.made(...Array.from({ length: 12 }, (_, at) => seen(at + 5, { path: `f${String(at)}` })))
    const listed = (await problemOf())?.split('Those you can cite: ')[1]?.split('; ')
    expect(listed).toHaveLength(12)
    expect([listed?.[0], listed?.at(-1)]).toEqual([
      'call-5 Files read f0',
      'call-16 Files read f11',
    ])
    history.readable(false)
    expect(await problemOf()).toBe('no tool call of this session since the goal was set: call-9')
  })

  it('asks only about the references it has not checked before', async () => {
    const { goals, direct, calls } = world()
    value(await goals.write(OWNER, direct()))
    calls.made('call-44', 'call-45')
    value(await track(goals, DONE))
    value(
      await track(goals, {
        metrics: {},
        obstacle: { what: '挡住了', tried: ['call-44', 'call-45'], exit: null },
      }),
    )
    expect(calls.asked.map(asked => asked.slice(1))).toEqual([['call-44'], ['call-45']])
  })

  it('an update that does not stand says which entry and which field', async () => {
    const { goals, direct } = world()
    value(await goals.write(OWNER, direct()))
    const patch = { criteria: { A9: { status: 'doing', refs: [], note: '' } } }
    expect(refusal(await track(goals, patch))).toMatchObject({
      kind: 'invalid',
      issues: [{ entry: 'A9', field: 'id' }],
    })
  })

  it('there is nothing to track without a live goal, and no basis while the calls cannot be read', async () => {
    const { goals, direct, calls, authority } = world()
    expect(refusal(await track(goals, DONE))).toEqual({ kind: 'state', reason: 'no-live-goal' })
    value(await goals.write(OWNER, direct()))
    calls.readable(false)
    expect(await track(goals, DONE)).toEqual({ kind: 'basis-unavailable' })
    calls.readable(true)
    authority.answer('denied')
    expect(refusal(await track(goals, DONE))).toEqual({ kind: 'denied' })
    authority.answer('permitted')
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'cancel' } }))
    expect(refusal(await track(goals, DONE))).toEqual({ kind: 'state', reason: 'no-live-goal' })
  })

  it('a paused goal is still tracked; a revision drops what was said of the entries it changed', async () => {
    const { goals, direct, calls } = world()
    value(await goals.write(OWNER, direct()))
    calls.made('call-44')
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'pause' } }))
    value(await track(goals, { ...DONE, rules: { N1: { check: 'kept' } } }))
    const replace = { op: 'replace', id: 'N1', entry: { statement: '不改公共接口与事件名。' } }
    const revised = value(
      await goals.write(
        OWNER,
        direct({ operation: 'op-2', proposal: { kind: 'revise', changes: [replace] } }),
      ),
    )
    expect(revised.progress.criteria).toEqual(DONE.criteria)
    expect(revised.progress.rules).toEqual({})
  })
})

describe('a command that says which goal it was given for', () => {
  it('is carried out on that goal, and refused untouched when the session has moved on to another', async () => {
    const { goals, direct, store } = world()
    value(await goals.write(OWNER, direct()))
    const seen = { session: SESSION, generation: 1 }
    const paused = value(await goals.command(OWNER, { ...seen, command: { kind: 'pause' } }))
    expect(paused?.state.status).toBe('paused')
    value(await goals.command(OWNER, { ...seen, command: { kind: 'cancel' } }))
    value(await goals.write(OWNER, direct({ operation: 'op-2' })))
    const late = await goals.command(OWNER, { ...seen, command: { kind: 'pause' } })
    expect(refusal(late)).toEqual({ kind: 'another-goal' })
    expect(store.rows(TENANT).at(-1)?.state).toMatchObject({ status: 'active', generation: 2 })
    const now = { session: SESSION, generation: 2, command: { kind: 'pause' } } as const
    expect(value(await goals.command(OWNER, now))?.state.status).toBe('paused')
  })

  it('is refused where there never was a goal, while a command that names none stays idempotent there', async () => {
    const { goals } = world()
    const named = { session: SESSION, generation: 1, command: { kind: 'cancel' } } as const
    expect(refusal(await goals.command(OWNER, named))).toEqual({ kind: 'another-goal' })
    const bare = await goals.command(OWNER, { session: SESSION, command: { kind: 'cancel' } })
    expect(bare).toEqual({ kind: 'done', value: null, recalled: false })
  })
})

describe('what is told after a goal was written', () => {
  it('names the tenant and the session once for each write that stood, and nothing for one that did not', async () => {
    const { goals, direct, changed } = world()
    value(await goals.write(OWNER, direct()))
    expect(changed).toEqual([`${TENANT}/${SESSION}`])
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'pause' } }))
    expect(changed).toHaveLength(2)
    value(await goals.command(OWNER, { session: SESSION, command: { kind: 'pause' } }))
    value(await goals.write(OWNER, direct()))
    await goals.command(OWNER, { session: SESSION, generation: 9, command: { kind: 'resume' } })
    value(await goals.read(OWNER, SESSION))
    expect(changed).toHaveLength(2)
  })

  it('does not undo or fail the write when the one told fails', async () => {
    const { goals, direct, listening, store } = world()
    listening.fails = true
    const set = await goals.write(OWNER, direct())
    expect(set.kind).toBe('done')
    expect(store.rows(TENANT)).toHaveLength(1)
  })
})

describe('the words of the person in the history of a goal confirmed on a card', () => {
  const MORE = { kind: 'revise', changes: [{ op: 'purpose', text: '只降首页' }] } as const
  const confirm = (card: string, proposal: Proposal = SET) => ({ session: SESSION, card, proposal })

  it('are what the person last said in the session, kept with where they stand; nothing the caller hands in is taken for them', async () => {
    const { goals, answered, sessions } = world()
    sessions.ask(SESSION, { at: '30', text: '/goal 把首页降下来' })
    await answered('card-1', SET)
    const handed = { ...confirm('card-1'), words: 'what the agent says I said' }
    const set = value(await goals.confirm(OWNER, handed))
    expect(set.history).toMatchObject([
      { revision: 1, via: 'card', draftedBy: 'agent', words: '/goal 把首页降下来', wordsAt: '30' },
    ])
  })

  it('belong to one revision: a revision the agent proposes without the person having said more has none', async () => {
    const { goals, answered, sessions } = world()
    sessions.ask(SESSION, { at: '30', text: '/goal 把首页降下来' })
    await answered('card-1', SET)
    value(await goals.confirm(OWNER, confirm('card-1')))
    await answered('card-2', ADD_RULE)
    const second = value(await goals.confirm(OWNER, confirm('card-2', ADD_RULE)))
    expect(second.history[1]).toMatchObject({ revision: 2, words: null })
    expect(second.history[1]).not.toHaveProperty('wordsAt')
    sessions.ask(SESSION, { at: '77', text: '只要首页，别的不管了' })
    await answered('card-3', MORE)
    const third = value(await goals.confirm(OWNER, confirm('card-3', MORE)))
    expect(third.history[2]).toMatchObject({
      revision: 3,
      words: '只要首页，别的不管了',
      wordsAt: '77',
    })
  })

  it('are null when the person said nothing, cut when they said very much, and no basis when what they said cannot be read now', async () => {
    const { goals, answered, sessions, store } = world()
    await answered('card-1', SET)
    sessions.askable(false)
    expect(await goals.confirm(OWNER, confirm('card-1'))).toEqual({ kind: 'basis-unavailable' })
    expect(store.rows(TENANT)).toEqual([])
    sessions.askable(true)
    const silent = value(await goals.confirm(OWNER, confirm('card-1')))
    expect(silent.history[0]).toMatchObject({ words: null })
    sessions.ask(SESSION, { at: '90', text: '字'.repeat(2500) })
    await answered('card-2', ADD_RULE)
    const long = value(await goals.confirm(OWNER, confirm('card-2', ADD_RULE)))
    expect([...(long.history[1]?.words ?? '')]).toHaveLength(2000)
  })

  it('are not asked after on the direct way: the caller says them there', async () => {
    const { goals, direct, sessions } = world()
    sessions.ask(SESSION, { at: '30', text: '别的话' })
    sessions.askable(false)
    const set = value(await goals.write(OWNER, direct()))
    expect(set.history[0]).toMatchObject({ words: '把首页降下来' })
    expect(set.history[0]).not.toHaveProperty('wordsAt')
  })
})
