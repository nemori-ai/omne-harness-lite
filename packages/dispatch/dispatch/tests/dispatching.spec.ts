import { describe, expect, it } from 'vitest'
import type { DispatchId } from '@omne-harness/dispatch-contract'
import { reportInputOf } from '@omne-harness/dispatch'
import { sessionNamed, tenantOf } from '@omne-harness/dispatch/testing'
import { ASKING, PARENT, TENANT, read, started, valueOf, world } from './world.ts'

const ASK = {
  mode: 'delegate',
  agent: 'helper',
  instruction: 'look into it',
  call: 'call-1',
} as const
const refused = (reason: string) => ({ kind: 'refused', reason })

describe('a dispatch is accepted once and creates one session (DP-06, DP-12)', () => {
  it('registers the dispatch, creates the session with the permission mode of the dispatcher now, and starts', async () => {
    const w = world()
    w.sessions.seat(TENANT, { session: PARENT, permission: 'never' })
    const outcome = await w.registry.dispatch(w.ctx(), { ...ASK, expectation: 'three bullets' })
    const dispatch = valueOf(outcome)
    expect(outcome).toMatchObject({ kind: 'done', recalled: false })
    expect(dispatch).toMatchObject({
      tenant: TENANT,
      dispatcher: PARENT,
      call: 'call-1',
      mode: 'delegate',
      agent: 'helper',
      expectation: 'three bullets',
      state: 'started',
      report: null,
      delivery: null,
    })
    expect(dispatch.id).toMatch(/^dsp_[0-9a-f]{64}$/u)
    expect(w.sessions.created).toHaveLength(1)
    expect(w.sessions.created[0]?.creation).toMatchObject({
      session: dispatch.session,
      permission: 'never',
      dispatch: {
        id: dispatch.id,
        mode: 'delegate',
        dispatcher: PARENT,
        instruction: 'look into it',
      },
    })
    expect(w.woken).toEqual([TENANT])
  })

  it('recalls the same dispatch when the same call asks again, and creates no second session', async () => {
    const w = world()
    const first = valueOf(await w.registry.dispatch(w.ctx(), ASK))
    const again = await w.registry.dispatch(w.ctx(), ASK)
    expect(again).toMatchObject({ kind: 'done', recalled: true, value: { id: first.id } })
    expect(w.sessions.created).toHaveLength(1)
    expect(w.store.rows(TENANT)).toHaveLength(1)
  })

  it('refuses another request under the identity of the same call', async () => {
    const w = world()
    await w.registry.dispatch(w.ctx(), ASK)
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, instruction: 'something else' })).toEqual(
      refused('conflict'),
    )
  })

  it('creates the same session again when the creation had no known result', async () => {
    const w = world()
    w.sessions.createNext('unknown-created')
    const accepted = valueOf(await w.registry.dispatch(w.ctx(), ASK))
    expect(accepted.state).toBe('accepted')
    await w.rebuilt().reconcile(TENANT)
    expect((await read(w, accepted.id)).state).toBe('started')
    expect(w.sessions.created).toHaveLength(1)
    expect(w.sessions.created[0]?.creation.session).toBe(accepted.session)
  })

  it('withdraws a dispatch whose dispatcher is archived or gone before its session is created, and creates none', async () => {
    for (const gone of [false, true]) {
      const w = world()
      w.sessions.createNext('unknown')
      const accepted = valueOf(await w.registry.dispatch(w.ctx(), ASK))
      if (gone) w.sessions.remove(TENANT, PARENT)
      else w.sessions.archive(TENANT, PARENT)
      await w.registry.reconcile(TENANT)
      expect(await read(w, accepted.id)).toMatchObject({ state: 'withdrawn', stop: 'not-needed' })
      expect(w.sessions.created).toEqual([])
    }
  })

  it('takes no step, and does not fail, while a fact it needs cannot be read', async () => {
    const w = world()
    w.sessions.createNext('unknown')
    const accepted = valueOf(await w.registry.dispatch(w.ctx(), ASK))
    const begun = await started(w, 'call-2')
    w.sessions.fate(begun.session, { kind: 'ended', reply: 'done' })
    w.sessions.readable(false)
    await expect(w.registry.advance(TENANT, accepted.id)).resolves.toBeUndefined()
    await expect(w.registry.advance(TENANT, begun.id)).resolves.toBeUndefined()
    w.store.readable(false)
    await expect(w.registry.advance(TENANT, begun.id)).resolves.toBeUndefined()
    w.store.readable(true)
    w.sessions.readable(true)
    expect((await read(w, accepted.id)).state).toBe('accepted')
    expect((await read(w, begun.id)).state).toBe('started')
    expect(w.sessions.created).toHaveLength(1)
  })

  it('fails the dispatch with the reason when the session cannot be created', async () => {
    const w = world()
    w.sessions.createNext('failed')
    expect(valueOf(await w.registry.dispatch(w.ctx(), ASK))).toMatchObject({
      state: 'failed',
      failure: { cause: 'session-not-created', detail: 'the session could not be created' },
    })
  })

  it('does not know the outcome when the commit of the acceptance has no known result, and recalls it afterwards', async () => {
    const w = world()
    w.store.failNext('unknown-after-commit')
    expect(await w.registry.dispatch(w.ctx(), ASK)).toEqual({ kind: 'unknown' })
    expect(await w.registry.dispatch(w.ctx(), ASK)).toMatchObject({ kind: 'done', recalled: true })
    expect(w.store.rows(TENANT)).toHaveLength(1)
  })
})

describe('what is refused when it is asked for', () => {
  it.each([
    ['denied', refused('not-permitted')],
    ['unavailable', { kind: 'basis-unavailable' }],
    ['throws', { kind: 'basis-unavailable' }],
  ] as const)('an authority that answers %s', async (answer, expected) => {
    const w = world()
    w.authority.answer('dispatch', answer)
    expect(await w.registry.dispatch(w.ctx(), ASK)).toEqual(expected)
    expect(w.store.rows(TENANT)).toEqual([])
    expect(w.authority.asked.map(item => item.action)).toEqual(['dispatch'])
  })

  it('a request that does not parse, before anything is asked', async () => {
    const w = world()
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, mode: 'fork' } as never)).toEqual(
      refused('invalid-request'),
    )
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, instruction: '' })).toEqual(
      refused('invalid-request'),
    )
    expect(w.authority.asked).toEqual([])
  })

  it('a definition the tenant does not see, and a handoff to one that is not master (DP-09)', async () => {
    const w = world()
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, agent: 'nobody' })).toEqual(
      refused('unknown-agent'),
    )
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, mode: 'handoff' })).toEqual(
      refused('agent-not-master'),
    )
  })

  it('a spawn or a delegate from a session on layer 2, while a handoff still goes (DP-09)', async () => {
    const w = world()
    const deep = sessionNamed('deep')
    w.sessions.seat(TENANT, { session: deep, depth: 2 })
    expect(await w.registry.dispatch(w.ctx(deep), ASK)).toEqual(refused('too-deep'))
    expect(await w.registry.dispatch(w.ctx(deep), { ...ASK, mode: 'spawn' })).toEqual(
      refused('too-deep'),
    )
    expect(
      valueOf(await w.registry.dispatch(w.ctx(deep), { ...ASK, mode: 'handoff', agent: 'coding' })),
    ).toMatchObject({ state: 'handed-off' })
  })

  it('one more open dispatch than the limit, and the limit frees when one ends', async () => {
    const w = world(2)
    const first = await started(w, 'call-1')
    await started(w, 'call-2')
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, call: 'call-3' })).toEqual(
      refused('too-many-open'),
    )
    await w.registry.report(w.ctx(first.session), 'done')
    expect(valueOf(await w.registry.dispatch(w.ctx(), { ...ASK, call: 'call-3' })).state).toBe(
      'started',
    )
  })

  it('a spawn whose session has no moment to fork at, while a delegate needs none', async () => {
    const w = world()
    w.copies.answer({ kind: 'none' })
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, mode: 'spawn' })).toEqual(
      refused('context-unavailable'),
    )
    expect(valueOf(await w.registry.dispatch(w.ctx(), ASK)).state).toBe('started')
    expect(w.copies.asked).toEqual([[TENANT, PARENT, ASKING]])
  })

  it('fixes the moment of the conversation when a spawn is accepted, and keeps it when the same call asks again', async () => {
    const w = world()
    w.copies.answer({ kind: 'moment', moment: 'epoch-1#4' })
    const spawned = valueOf(await w.registry.dispatch(w.ctx(), { ...ASK, mode: 'spawn' }))
    expect(spawned.context).toBe('epoch-1#4')
    expect(w.sessions.created[0]?.creation.dispatch.context).toBe('epoch-1#4')
    w.copies.answer({ kind: 'moment', moment: 'epoch-1#9' })
    const again = await w.registry.dispatch(w.ctx(), { ...ASK, mode: 'spawn' })
    expect(again).toMatchObject({ kind: 'done', recalled: true, value: { context: 'epoch-1#4' } })
    expect(valueOf(await w.registry.dispatch(w.ctx(), { ...ASK, call: 'call-2' })).context).toBe(
      null,
    )
  })

  it('registers no spawn while the moment cannot be read', async () => {
    const w = world()
    w.copies.answer('unreadable')
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, mode: 'spawn' })).toEqual({
      kind: 'basis-unavailable',
    })
    expect(await w.store.unfinished(TENANT)).toEqual({ kind: 'read', value: [] })
    Object.assign(w.copies, { moment: () => Promise.reject(new Error('down')) })
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, mode: 'spawn' })).toEqual({
      kind: 'basis-unavailable',
    })
  })

  it('answers that its basis is unavailable when a fact it needs cannot be read', async () => {
    const w = world()
    w.definitions.readable(false)
    expect(await w.registry.dispatch(w.ctx(), ASK)).toEqual({ kind: 'basis-unavailable' })
    expect(w.store.rows(TENANT)).toEqual([])
  })
})

describe('the one report and its one place (DP-01, DP-02, DP-03)', () => {
  it('hands the report to the call that still waits: it is the result of the call', async () => {
    const w = world()
    const dispatch = await started(w)
    const reported = valueOf(
      await w.registry.report(w.ctx(dispatch.session), 'here is what I found'),
    )
    expect(reported).toMatchObject({
      state: 'reported',
      report: { text: 'here is what I found', origin: 'report' },
      delivery: { kind: 'delivered', to: 'result' },
    })
    expect(w.waits.answers.get('call-1')).toMatchObject({
      id: dispatch.id,
      state: 'reported',
      report: { text: 'here is what I found' },
    })
    expect(w.sessions.sent).toEqual([])
  })

  it('recalls the same report and refuses another one', async () => {
    const w = world()
    const dispatch = await started(w)
    const child = w.ctx(dispatch.session)
    await w.registry.report(child, 'the report')
    expect(await w.registry.report(child, 'the report')).toMatchObject({
      kind: 'done',
      recalled: true,
    })
    expect(await w.registry.report(child, 'a second report')).toEqual(refused('already-reported'))
    expect((await read(w, dispatch.id)).report?.text).toBe('the report')
    expect(w.waits.answers.size).toBe(1)
  })

  it('sends the report into the dispatching session when the wait is closed, under one identity', async () => {
    const w = world()
    const dispatch = await started(w)
    w.waits.close('call-1')
    const reported = valueOf(await w.registry.report(w.ctx(dispatch.session), 'late report'))
    expect(reported.delivery).toEqual({ kind: 'delivered', to: 'input' })
    expect(w.sessions.sent).toEqual([
      {
        tenant: TENANT,
        to: PARENT,
        input: reportInputOf(dispatch.id),
        source: 'dispatch.report',
        text: 'late report',
        from: { session: dispatch.session, agent: 'helper' },
      },
    ])
    expect(w.waits.answers.size).toBe(0)
  })

  it('sends nothing while the wait cannot be read, and goes on when it can', async () => {
    const w = world()
    const dispatch = await started(w)
    w.waits.unreadable(true)
    const held = valueOf(await w.registry.report(w.ctx(dispatch.session), 'the report'))
    expect(held.delivery).toEqual({ kind: 'pending' })
    expect(w.sessions.sent).toEqual([])
    w.waits.unreadable(false)
    await w.registry.reconcile(TENANT)
    expect((await read(w, dispatch.id)).delivery).toEqual({ kind: 'delivered', to: 'result' })
    expect(w.sessions.sent).toEqual([])
  })

  it('sends the input again under the same identity when the first send had no known result', async () => {
    const w = world()
    const dispatch = await started(w)
    w.waits.close('call-1')
    w.sessions.sendNext('unknown-sent')
    const held = valueOf(await w.registry.report(w.ctx(dispatch.session), 'the report'))
    expect(held.delivery).toEqual({ kind: 'pending' })
    await w.rebuilt().reconcile(TENANT)
    expect((await read(w, dispatch.id)).delivery).toEqual({ kind: 'delivered', to: 'input' })
    expect(w.sessions.sent).toHaveLength(1)
    expect(w.sessions.counts().sends).toBe(1)
  })

  it('sends the input when the first send did not arrive, once', async () => {
    const w = world()
    const dispatch = await started(w)
    w.waits.close('call-1')
    w.sessions.sendNext('unknown')
    await w.registry.report(w.ctx(dispatch.session), 'the report')
    expect(w.sessions.sent).toEqual([])
    await w.registry.reconcile(TENANT)
    await w.registry.reconcile(TENANT)
    expect(w.sessions.sent).toHaveLength(1)
    expect((await read(w, dispatch.id)).delivery).toEqual({ kind: 'delivered', to: 'input' })
  })

  it('looks for the input only after the wait answered closed, and sends nothing while it cannot look', async () => {
    const w = world()
    const delivered = await started(w, 'call-1')
    await w.registry.report(w.ctx(delivered.session), 'to the waiting call')
    expect(w.sessions.counts()).toEqual({ sends: 0, looks: 0 })

    const late = await started(w, 'call-2')
    w.waits.close('call-2')
    w.sessions.readable(false)
    const held = valueOf(await w.registry.report(w.ctx(late.session), 'the report'))
    expect(held.delivery).toEqual({ kind: 'pending' })
    expect(w.sessions.counts()).toEqual({ sends: 0, looks: 1 })
    w.sessions.readable(true)
    await w.registry.reconcile(TENANT)
    expect((await read(w, late.id)).delivery).toEqual({ kind: 'delivered', to: 'input' })
    expect(w.sessions.counts().sends).toBe(1)
  })

  it('holds while it can read only one of the two facts of the second place', async () => {
    for (const blind of ['rows', 'looks'] as const) {
      const w = world()
      const dispatch = await started(w)
      w.waits.close('call-1')
      w.sessions.readable(false, blind)
      const held = valueOf(await w.registry.report(w.ctx(dispatch.session), 'the report'))
      expect(held.delivery, blind).toEqual({ kind: 'pending' })
      expect(w.sessions.counts().sends, blind).toBe(0)
      w.sessions.readable(true, blind)
      await w.registry.reconcile(TENANT)
      expect((await read(w, dispatch.id)).delivery).toEqual({ kind: 'delivered', to: 'input' })
    }
  })

  it('records the report as undeliverable when the dispatching session is gone', async () => {
    const w = world()
    const dispatch = await started(w)
    w.waits.close('call-1')
    w.sessions.remove(TENANT, PARENT)
    const reported = valueOf(await w.registry.report(w.ctx(dispatch.session), 'the report'))
    expect(reported.delivery).toEqual({ kind: 'undeliverable' })
    expect(w.sessions.counts().sends).toBe(0)
  })

  it('records nothing when the send is refused, and settles on the next pass', async () => {
    const w = world()
    const dispatch = await started(w)
    w.waits.close('call-1')
    w.sessions.sendNext('refused')
    const held = valueOf(await w.registry.report(w.ctx(dispatch.session), 'the report'))
    expect(held.delivery).toEqual({ kind: 'pending' })
    await w.registry.reconcile(TENANT)
    expect((await read(w, dispatch.id)).delivery).toEqual({ kind: 'delivered', to: 'input' })
  })

  it('records the report as undeliverable when the dispatching session is archived, and keeps it readable', async () => {
    const w = world()
    const dispatch = await started(w)
    await w.registry.report(w.ctx(dispatch.session), 'the report')
    const other = await started(w, 'call-2')
    w.waits.close('call-2')
    w.sessions.fate(other.session, { kind: 'ended', reply: 'the final reply' })
    w.sessions.archive(TENANT, PARENT)
    await w.registry.reconcile(TENANT)
    expect(await read(w, other.id)).toMatchObject({
      state: 'reported',
      report: { text: 'the final reply', origin: 'final-reply' },
      delivery: { kind: 'undeliverable' },
    })
    expect(w.sessions.sent).toEqual([])
    expect(w.sessions.counts().sends).toBe(0)
  })

  it('never leaves a report of an open dispatcher at neither place once the steps are taken', async () => {
    for (const closeWait of [false, true]) {
      const w = world()
      const dispatch = await started(w)
      if (closeWait) w.waits.close('call-1')
      await w.registry.report(w.ctx(dispatch.session), 'the report')
      await w.registry.reconcile(TENANT)
      const { delivery } = await read(w, dispatch.id)
      expect(delivery).toEqual({ kind: 'delivered', to: closeWait ? 'input' : 'result' })
      expect(w.waits.answers.size + w.sessions.sent.length).toBe(1)
    }
  })

  it('refuses a report of a session no dispatch created', async () => {
    const w = world()
    expect(await w.registry.report(w.ctx(), 'I was not dispatched')).toEqual(
      refused('not-dispatched'),
    )
  })
})

describe('the end of the run without a report', () => {
  it('makes the final reply the report when the run ends normally', async () => {
    const w = world()
    const dispatch = await started(w)
    w.sessions.fate(dispatch.session, { kind: 'ended', reply: 'all done' })
    await w.registry.reconcile(TENANT)
    expect(await read(w, dispatch.id)).toMatchObject({
      state: 'reported',
      report: { text: 'all done', origin: 'final-reply' },
      delivery: { kind: 'delivered', to: 'result' },
    })
  })

  it.each(['failed', 'cancelled'] as const)(
    'fails the dispatch when the run is %s, and the call gets the failure',
    async kind => {
      const w = world()
      const dispatch = await started(w)
      w.sessions.fate(dispatch.session, { kind, detail: 'the model refused' })
      await w.registry.reconcile(TENANT)
      expect(await read(w, dispatch.id)).toMatchObject({
        state: 'failed',
        failure: { cause: `run-${kind}`, detail: 'the model refused' },
        delivery: { kind: 'delivered', to: 'result' },
      })
      expect(w.waits.answers.get('call-1')).toMatchObject({ state: 'failed' })
    },
  )

  it('keeps the report that was handed back when the run ends afterwards', async () => {
    const w = world()
    const dispatch = await started(w)
    await w.registry.report(w.ctx(dispatch.session), 'the report')
    w.sessions.fate(dispatch.session, { kind: 'failed', detail: 'later failure' })
    await w.registry.reconcile(TENANT)
    expect(await read(w, dispatch.id)).toMatchObject({
      state: 'reported',
      report: { text: 'the report' },
    })
  })

  it('goes on waiting while the run goes on, and while its fate cannot be read', async () => {
    const w = world()
    const dispatch = await started(w)
    await w.registry.reconcile(TENANT)
    w.sessions.readable(false)
    await w.registry.reconcile(TENANT)
    w.sessions.readable(true)
    expect((await read(w, dispatch.id)).state).toBe('started')
  })
})

describe('a withdrawal and a report exclude each other (DP-04, DP-05)', () => {
  it('withdraws a started dispatch, answers the waiting call, and asks the run to stop', async () => {
    const w = world()
    const dispatch = await started(w)
    const withdrawn = valueOf(await w.registry.withdraw(w.ctx(), dispatch.id))
    expect(withdrawn).toMatchObject({
      state: 'withdrawn',
      stop: 'confirmed',
      delivery: { kind: 'delivered', to: 'result' },
    })
    expect(w.waits.answers.get('call-1')).toMatchObject({ state: 'withdrawn' })
    expect(w.sessions.cancelled).toEqual([dispatch.session])
  })

  it('reports the stop as asked for until it is confirmed', async () => {
    const w = world()
    const dispatch = await started(w)
    w.sessions.cancelAnswers('requested')
    expect(valueOf(await w.registry.withdraw(w.ctx(), dispatch.id)).stop).toBe('requested')
    w.sessions.cancelAnswers('stopped')
    await w.rebuilt().reconcile(TENANT)
    expect((await read(w, dispatch.id)).stop).toBe('confirmed')
  })

  it('refuses a report after the withdrawal, and a withdrawal after the report', async () => {
    const w = world()
    const first = await started(w, 'call-1')
    await w.registry.withdraw(w.ctx(), first.id)
    expect(await w.registry.report(w.ctx(first.session), 'too late')).toEqual(refused('withdrawn'))
    expect((await read(w, first.id)).report).toBeNull()
    const second = await started(w, 'call-2')
    await w.registry.report(w.ctx(second.session), 'in time')
    expect(await w.registry.withdraw(w.ctx(), second.id)).toEqual(refused('already-reported'))
    expect((await read(w, second.id)).state).toBe('reported')
  })

  it('recalls a withdrawal made twice, and lets only the dispatcher withdraw', async () => {
    const w = world()
    const dispatch = await started(w)
    expect(await w.registry.withdraw(w.ctx(dispatch.session), dispatch.id)).toEqual(
      refused('not-permitted'),
    )
    await w.registry.withdraw(w.ctx(), dispatch.id)
    expect(await w.registry.withdraw(w.ctx(), dispatch.id)).toMatchObject({
      kind: 'done',
      recalled: true,
    })
    expect(await w.registry.withdraw(w.ctx(), `dsp_${'0'.repeat(64)}` as DispatchId)).toEqual(
      refused('no-such-dispatch'),
    )
  })

  it('records that a withdrawn dispatch whose wait is closed has nowhere to go, and sends no input', async () => {
    const w = world()
    const dispatch = await started(w)
    w.waits.close('call-1')
    expect(valueOf(await w.registry.withdraw(w.ctx(), dispatch.id)).delivery).toEqual({
      kind: 'wait-closed',
    })
    expect(w.sessions.sent).toEqual([])
  })
})

describe('the dispatch, its session and the dispatching call live apart (DP-07)', () => {
  it('keeps the dispatch started and its session running when the wait of the call closes', async () => {
    const w = world()
    const dispatch = await started(w)
    w.waits.close('call-1')
    await w.rebuilt().reconcile(TENANT)
    expect((await read(w, dispatch.id)).state).toBe('started')
    expect(w.sessions.cancelled).toEqual([])
  })

  it('withdraws the open dispatches of a dispatcher that is archived, and leaves the ended ones', async () => {
    const w = world()
    const open = await started(w, 'call-1')
    const reported = await started(w, 'call-2')
    await w.registry.report(w.ctx(reported.session), 'done')
    w.sessions.archive(TENANT, PARENT)
    expect(await w.registry.dispatcherArchived(TENANT, PARENT)).toBe('done')
    expect(await read(w, open.id)).toMatchObject({ state: 'withdrawn' })
    expect(await read(w, reported.id)).toMatchObject({
      state: 'reported',
      delivery: { kind: 'delivered', to: 'result' },
    })
  })
  it('finds by itself, when it reconciles, that the dispatcher of a started dispatch is archived or gone', async () => {
    for (const gone of [false, true]) {
      const w = world()
      const open = await started(w, 'call-1')
      const reported = await started(w, 'call-2')
      await w.registry.report(w.ctx(reported.session), 'done')
      if (gone) w.sessions.remove(TENANT, PARENT)
      else w.sessions.archive(TENANT, PARENT)
      await w.rebuilt().reconcile(TENANT)
      expect(await read(w, open.id)).toMatchObject({ state: 'withdrawn' })
      expect(w.sessions.cancelled).toEqual([open.session])
      expect(await read(w, reported.id)).toMatchObject({ state: 'reported' })
    }
  })

  it('counts a run that was cancelled or failed after its dispatcher was archived as taken back, not as failed', async () => {
    for (const kind of ['cancelled', 'failed'] as const) {
      const w = world()
      const open = await started(w)
      w.sessions.fate(open.session, { kind, detail: 'the session was archived' })
      w.sessions.archive(TENANT, PARENT)
      await w.registry.reconcile(TENANT)
      expect(await read(w, open.id)).toMatchObject({ state: 'withdrawn', failure: null })
      const alive = world()
      const other = await started(alive)
      alive.sessions.fate(other.session, { kind, detail: 'it broke' })
      await alive.registry.reconcile(TENANT)
      expect(await read(alive, other.id)).toMatchObject({
        state: 'failed',
        failure: { cause: `run-${kind}`, detail: 'it broke' },
      })
    }
  })

  it('leaves a started dispatch where it is while the dispatcher cannot be read', async () => {
    const w = world()
    const open = await started(w)
    w.sessions.archive(TENANT, PARENT)
    w.sessions.readable(false)
    await w.registry.reconcile(TENANT)
    expect((await read(w, open.id)).state).toBe('started')
    w.sessions.readable(true)
    await w.registry.reconcile(TENANT)
    expect((await read(w, open.id)).state).toBe('withdrawn')
  })
})

describe('a handoff is handed over when its session exists', () => {
  it('ends as handed-off with the session, and has no report and no withdrawal', async () => {
    const w = world()
    const handoff = valueOf(
      await w.registry.dispatch(w.ctx(), { ...ASK, mode: 'handoff', agent: 'coding' }),
    )
    expect(handoff).toMatchObject({
      state: 'handed-off',
      delivery: { kind: 'delivered', to: 'result' },
    })
    expect(w.sessions.created[0]?.creation.dispatch.mode).toBe('handoff')
    expect(await w.registry.report(w.ctx(handoff.session), 'a report')).toEqual(
      refused('no-report-in-this-mode'),
    )
    expect(await w.registry.withdraw(w.ctx(), handoff.id)).toEqual(
      refused('cannot-withdraw-a-handoff'),
    )
  })
})

describe('messages (DP-08, DP-10, DP-11)', () => {
  const other = sessionNamed('other')

  it('sends a message to any open session of the tenant, with who it is from', async () => {
    const w = world()
    w.sessions.seat(TENANT, { session: other, agent: 'helper' })
    const sent = await w.registry.message(w.ctx(), {
      to: other,
      text: 'how is it going?',
      id: 'm1',
    })
    expect(sent).toMatchObject({ kind: 'done', value: { to: other } })
    expect(w.sessions.sent).toMatchObject([
      {
        to: other,
        source: 'dispatch.message',
        text: 'how is it going?',
        from: { session: PARENT, agent: 'coding' },
      },
    ])
  })

  it('recalls the same message, and changes no dispatch', async () => {
    const w = world()
    const dispatch = await started(w)
    const ask = { to: dispatch.session, text: 'any news?', id: 'm1' }
    await w.registry.message(w.ctx(), ask)
    await w.registry.message(w.ctx(), ask)
    await w.registry.message(w.ctx(dispatch.session), { to: PARENT, text: 'not yet', id: 'm1' })
    expect(w.sessions.sent).toHaveLength(2)
    expect(await read(w, dispatch.id)).toMatchObject({ state: 'started', report: null })
  })

  it('answers the same for a session that does not exist and one of another tenant', async () => {
    const w = world()
    const foreign = tenantOf('2')
    w.sessions.seat(foreign, { session: other })
    const missing = await w.registry.message(w.ctx(), {
      to: sessionNamed('gone'),
      text: 'hi',
      id: 'm1',
    })
    const elsewhere = await w.registry.message(w.ctx(), { to: other, text: 'hi', id: 'm2' })
    expect(missing).toEqual(refused('no-such-session'))
    expect(elsewhere).toEqual(missing)
    expect(w.sessions.sent).toEqual([])
  })

  it('refuses a message to an archived session, to itself, and from a sender that may not send', async () => {
    const w = world()
    w.sessions.seat(TENANT, { session: other, archived: true })
    expect(await w.registry.message(w.ctx(), { to: other, text: 'hi', id: 'm1' })).toEqual(
      refused('archived'),
    )
    expect(await w.registry.message(w.ctx(), { to: PARENT, text: 'hi', id: 'm2' })).toEqual(
      refused('to-self'),
    )
    w.authority.answer('message', 'denied')
    expect(await w.registry.message(w.ctx(), { to: other, text: 'hi', id: 'm3' })).toEqual(
      refused('not-permitted'),
    )
  })

  it('does not know whether a message arrived when the send has no known result', async () => {
    const w = world()
    w.sessions.seat(TENANT, { session: other })
    w.sessions.sendNext('unknown-sent')
    const ask = { to: other, text: 'hi', id: 'm1' }
    expect(await w.registry.message(w.ctx(), ask)).toEqual({ kind: 'unknown' })
    expect(await w.registry.message(w.ctx(), ask)).toMatchObject({ kind: 'done' })
    expect(w.sessions.sent).toHaveLength(1)
  })
})

describe('reading (DP-08, DP-11)', () => {
  it('reads a dispatch of the tenant and lists by dispatcher, by session and by state', async () => {
    const w = world()
    const first = await started(w, 'call-1')
    const second = await started(w, 'call-2')
    await w.registry.report(w.ctx(second.session), 'done')
    const list = async (query: Parameters<typeof w.registry.list>[1]) =>
      valueOf(await w.registry.list(w.ctx(), query)).map(item => item.id)
    expect(await list({ by: { dispatcher: PARENT } })).toEqual([first.id, second.id])
    expect(await list({ by: { dispatcher: PARENT }, states: ['reported'] })).toEqual([second.id])
    expect(await list({ by: { sessions: [first.session, sessionNamed('x')] } })).toEqual([first.id])
  })

  it('answers that there is no such dispatch for one of another tenant, as for one that never was', async () => {
    const w = world()
    const dispatch = await started(w)
    const foreign = w.ctx(sessionNamed('theirs'), tenantOf('2'))
    const theirs = await w.registry.show(foreign, dispatch.id)
    expect(theirs).toEqual(refused('no-such-dispatch'))
    expect(await w.registry.show(w.ctx(), `dsp_${'0'.repeat(64)}` as DispatchId)).toEqual(theirs)
    expect(await w.registry.withdraw(foreign, dispatch.id)).toEqual(refused('no-such-dispatch'))
    expect(valueOf(await w.registry.list(foreign, { by: { dispatcher: PARENT } }))).toEqual([])
  })

  it('answers that its basis is unavailable when the registry cannot be read', async () => {
    const w = world()
    const dispatch = await started(w)
    w.store.readable(false)
    expect(await w.registry.show(w.ctx(), dispatch.id)).toEqual({ kind: 'basis-unavailable' })
    expect(await w.registry.reconcile(TENANT)).toBe('unavailable')
  })
})
