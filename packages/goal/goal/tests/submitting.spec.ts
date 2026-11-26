import { describe, expect, it } from 'vitest'
import type { DecisionAsk } from '@omne-harness/goal'
import {
  UNCITED,
  type GoalDraft,
  type JudgeAnswer,
  type JudgeReply,
  type ObservedCall,
  type Submitted,
} from '@omne-harness/goal-contract'
import { OWNER, SESSION, TENANT, value, world } from './world.ts'

const CHECK = { tenant: TENANT, subject: 'check' }
const AGENT = { tenant: TENANT, subject: 'agent' }
const EXAMINER = `examiner-of-${SESSION}`
const BATCH = 'examine/1/1/call-1'
const SNAKE: GoalDraft = {
  purpose: '做一个能玩的贪吃蛇',
  criteria: [
    { statement: '验收脚本通过', evidence: { kind: 'rerun', command: 'node accept.js' } },
    { statement: '方向键能控制蛇', evidence: { kind: 'examination', method: '用 node 走一局' } },
    { statement: '写了说明', evidence: { kind: 'file', path: 'README.md' } },
  ],
}
const write = (order: number, path = 'README.md'): ObservedCall => ({
  ref: `call-${String(order)}`,
  order,
  tool: 'Files write',
  command: null,
  path,
  exit: null,
  output: '# 贪吃蛇\n方向键控制。',
  writes: true,
})
const holds: JudgeAnswer = { type: 'choice', choice: 'holds', probabilities: { holds: 0.97 } }
const reply = (ask: DecisionAsk): JudgeReply =>
  Object.fromEntries(Object.keys(ask.request.questions).map(name => [name, holds]))
const one = (criterion: string, change: Partial<Submitted> = {}) => ({
  criterion,
  value: 'holds',
  refs: ['x-1'],
  note: '看到了',
  ...change,
})
const BOTH = [one('A1'), one('A2')]

/** A goal whose two criteria that wait were handed over as one batch: the round ended and no round is going. */
async function handedOver(
  how: (w: ReturnType<typeof world>) => void = () => undefined,
  wrap: Parameters<typeof world>[0] = store => store,
) {
  const w = world(wrap)
  const proposal = { kind: 'set', draft: SNAKE } as const
  value(await w.goals.write(OWNER, w.direct({ proposal })))
  w.history.made(write(1))
  w.sessions.at(SESSION, '/work/snake')
  w.decisions.answer(reply)
  w.examining.made(EXAMINER, BATCH, ['x-1', 'x-2'])
  how(w)
  const check = {
    session: SESSION,
    call: 'exec-1/cand-1/before_terminal/call/0',
    candidate: 'complete',
  }
  const ended = value(await w.goals.observe(CHECK, check as never))
  w.sessions.woken.length = 0
  w.changed.length = 0
  const record = () => w.store.rows(TENANT).findLast(row => row.session === SESSION)!
  const submit = (readings: unknown = BOTH, batch = BATCH, examiner = EXAMINER) =>
    w.goals.submit(AGENT, { examiner, submission: { batch, readings } })
  return { ...w, ended, record, submit }
}

describe('a batch handed over to the examining side', () => {
  it('goes out once the write that hands it over stood: the round ends uncounted, and the goal keeps which session examines for it', async () => {
    const w = await handedOver()
    expect(w.ended).toEqual({ kind: 'pass' })
    expect(w.record().state).toMatchObject({ status: 'active', rounds: 0 })
    expect(w.record().examination).toMatchObject({
      batch: {
        key: { revision: 1, written: 'call-1' },
        criteria: ['A1', 'A2'],
        delivery: 'handed',
      },
      used: 1,
      examiner: EXAMINER,
    })
    expect(w.examining.handed).toHaveLength(1)
    const [batch] = w.examining.handed
    expect(batch).toMatchObject({
      session: SESSION,
      request: BATCH,
      examiner: null,
      where: '/work/snake',
    })
    expect(batch?.criteria.map(entry => [entry.id, entry.evidence.kind])).toEqual([
      ['A1', 'rerun'],
      ['A2', 'examination'],
    ])
    expect(batch?.brief).toContain('Where the work is: /work/snake')
    expect(batch?.brief).toContain('Written since the last batch: README.md')
    expect(w.hinted).toEqual([])
    await w.goals.reconcile(TENANT)
    await w.goals.reconcile(TENANT)
    value(await w.goals.track(AGENT, { session: SESSION, patch: { notes: ['在等查验'] } }))
    expect(w.examining.asked).toEqual([BATCH])
  })

  it('is not handed over while what its brief needs cannot be read: it stays owed and is tried again', async () => {
    const w = await handedOver(world => world.examining.handNext('unknown'))
    expect(w.record().examination.examiner).toBeNull()
    w.sessions.readable(false)
    const version = w.record().version
    await w.goals.reconcile(TENANT)
    expect(w.record().examination.batch?.delivery).toBe('unknown')
    expect(w.record().version).toBe(version)
    expect(w.examining.asked).toEqual([BATCH])
    expect(w.hinted).toEqual([TENANT, TENANT])
    w.sessions.readable(true)
    w.history.readable(false)
    await w.goals.reconcile(TENANT)
    expect(w.examining.asked).toEqual([BATCH])
    w.history.readable(true)
    await w.goals.reconcile(TENANT)
    expect(w.examining.asked).toEqual([BATCH, BATCH])
    expect(w.record().examination.batch?.delivery).toBe('handed')
  })

  it('whose handing over is not known stays owed and is handed again as the same batch; the examining side takes it once', async () => {
    const w = await handedOver(world => world.examining.handNext('unknown'))
    expect(w.record().examination.batch?.delivery).toBe('unknown')
    expect(w.hinted).toEqual([TENANT])
    await w.goals.reconcile(TENANT)
    expect(w.record().examination).toMatchObject({
      batch: { delivery: 'handed', ran: {} },
      examiner: EXAMINER,
    })
    expect(w.examining.handed.map(batch => batch.request)).toEqual([BATCH])
    await w.goals.reconcile(TENANT)
    expect(w.examining.handed).toHaveLength(1)
  })

  it('written down and not handed over before a crash is handed over after it, once', async () => {
    const w = await handedOver(world => {
      const real = world.examining.hand
      let crashed = false
      Object.assign(world.examining, {
        hand: (...args: Parameters<typeof real>) => {
          if (crashed) return real(...args)
          crashed = true
          return Promise.reject(new Error('the process died'))
        },
      })
    })
    expect(w.record().examination.batch?.delivery).toBe('unknown')
    expect(w.examining.handed).toEqual([])
    await w.goals.reconcile(TENANT)
    expect(w.examining.handed.map(batch => batch.request)).toEqual([BATCH])
    expect(w.record().examination.batch?.delivery).toBe('handed')
  })

  it('that the examining side is taking stays owed and unwritten until it is known to be taken; a port that throws while the brief is read is no basis, not a crash', async () => {
    const w = await handedOver(world => world.examining.handNext('taking'))
    expect(w.record().examination).toMatchObject({ batch: { delivery: 'owed' }, examiner: null })
    expect(w.hinted).toEqual([])
    const version = w.record().version
    w.examining.handNext('taking')
    await w.goals.reconcile(TENANT)
    expect(w.record().version).toBe(version)
    const down = () => Promise.reject(new Error('down'))
    const real = { facts: w.sessions.facts, calls: w.history.calls }
    Object.assign(w.sessions, { facts: down })
    await w.goals.reconcile(TENANT)
    Object.assign(w.sessions, { facts: real.facts })
    Object.assign(w.history, { calls: down })
    await w.goals.reconcile(TENANT)
    Object.assign(w.history, { calls: real.calls })
    expect(w.record().version).toBe(version)
    expect(w.hinted).toEqual([TENANT, TENANT])
    await w.goals.reconcile(TENANT)
    expect(w.record().examination).toMatchObject({ batch: { delivery: 'handed' } })
  })

  it('is handed over with no place named when the session of the goal has none', async () => {
    const w = world()
    value(await w.goals.write(OWNER, w.direct({ proposal: { kind: 'set', draft: SNAKE } })))
    w.history.made(write(1))
    w.decisions.answer(reply)
    const check = { session: SESSION, call: 'exec-1/cand-1/before_terminal/call/0' }
    value(await w.goals.observe(CHECK, { ...check, candidate: 'complete' } as never))
    expect(w.examining.seen[0]).toMatchObject({ where: null })
    expect(w.examining.seen[0]?.brief).not.toContain('Where the work is')
  })

  it('that the examining side will not take cannot be told: the agent is sent on and reads why', async () => {
    const w = await handedOver(world => world.examining.handNext('refused'))
    expect(w.record().examination.batch).toBeNull()
    expect(w.record().readings.criteria.A2).toMatchObject({ value: 'cannot-tell' })
    expect(w.record().state).toMatchObject({ status: 'active', rounds: 1 })
  })
})

describe('the readings of a batch handed in with submit', () => {
  it('row 1: a caller that is not the examining session of a goal is refused, and nothing changes', async () => {
    const w = await handedOver()
    const before = w.record()
    expect(await w.submit(BOTH, BATCH, 'another-session')).toEqual({
      kind: 'refused',
      reason: { kind: 'denied' },
    })
    expect(await w.submit(BOTH, BATCH, SESSION)).toEqual({
      kind: 'refused',
      reason: { kind: 'denied' },
    })
    w.authority.answer(action => (action === 'submit' ? 'denied' : 'permitted'))
    expect(await w.submit()).toEqual({ kind: 'refused', reason: { kind: 'denied' } })
    expect(w.record()).toEqual(before)
    expect(w.authority.asked.at(-1)).toMatchObject({ session: EXAMINER, action: 'submit' })
  })

  it('row 2: a batch that is not the awaited one is taken as out of date and its readings do not count', async () => {
    const w = await handedOver()
    w.history.made(write(2, 'snake.js'))
    expect(value(await w.submit())).toEqual({ taken: 'stale' })
    expect(w.record().state.status).toBe('active')
    expect(w.record().examination).toMatchObject({ batch: null, read: {} })
    expect(value(await w.submit(BOTH, 'examine/1/1/call-0'))).toEqual({ taken: 'stale' })
  })

  it('rows 3 and 4: handed in again, the same content changes nothing and another content is refused', async () => {
    const w = await handedOver()
    w.sessions.run(SESSION, true)
    expect(value(await w.submit())).toEqual({ taken: 'counted' })
    const kept = w.record()
    expect(value(await w.submit([one('A2'), one('A1')]))).toEqual({ taken: 'repeat' })
    expect(w.record()).toEqual(kept)
    expect(await w.submit([one('A1'), one('A2', { value: 'fails' })])).toEqual({
      kind: 'refused',
      reason: { kind: 'differs' },
    })
    expect(w.record()).toEqual(kept)
  })

  it('row 5: one of the batch left out, or one that is not of it, is refused with which one', async () => {
    const w = await handedOver()
    const before = w.record()
    expect(await w.submit([one('A1')])).toEqual({
      kind: 'refused',
      reason: {
        kind: 'invalid',
        issues: [{ entry: 'A2', field: 'readings', problem: 'the batch asks for a reading of it' }],
      },
    })
    expect(await w.submit([...BOTH, one('A3')])).toMatchObject({
      reason: { kind: 'invalid', issues: [{ entry: 'A3' }] },
    })
    const unreadable = {
      kind: 'refused',
      reason: {
        kind: 'invalid',
        issues: [
          { entry: null, field: 'submission', problem: expect.stringContaining('readings') },
        ],
      },
    }
    expect(await w.submit('not readings')).toEqual(unreadable)
    expect(await w.submit(BOTH, 'no-batch')).toEqual(unreadable)
    expect(w.record()).toEqual(before)
  })

  it('row 6: a reading that cites a call which is not of this examination is taken as cannot tell, and the agent is sent on', async () => {
    const w = await handedOver()
    expect(value(await w.submit([one('A1'), one('A2', { refs: ['call-1'] })]))).toEqual({
      taken: 'counted',
    })
    expect(w.record().examination.read.A2).toMatchObject({ value: 'cannot-tell', note: UNCITED })
    expect(w.record().state).toMatchObject({ status: 'active', rounds: 1 })
    expect(w.sessions.woken.map(wake => [wake.kind, wake.session])).toEqual([['continue', SESSION]])
    expect(w.sessions.woken[0]?.open).toContain(UNCITED)
  })

  it('row 7: all right, with no round going: the goal is achieved at once and its session is told nothing to do', async () => {
    const w = await handedOver()
    expect(value(await w.submit())).toEqual({ taken: 'counted' })
    expect(w.record().state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
    expect(w.record().readings.criteria).toMatchObject({
      A1: { value: 'holds', source: 'system' },
      A2: { value: 'holds', source: 'examiner' },
    })
    expect(w.sessions.woken).toEqual([])
    expect(w.changed).toEqual([`${TENANT}/${SESSION}`])
  })

  it('while a round of the session is going, the readings are kept for that round and the goal stays as it is', async () => {
    const w = await handedOver()
    w.sessions.run(SESSION, true)
    expect(value(await w.submit())).toEqual({ taken: 'counted' })
    expect(w.record().state).toMatchObject({ status: 'active', rounds: 0 })
    expect(w.record().examination.read.A1).toMatchObject({ value: 'holds' })
    expect(w.record().examination.arrived).toBe(true)
    expect(w.hinted).toEqual([TENANT])
  })

  it('when that round was already past its observation, the verdict is given once it is over: nobody waits on a goal whose readings are in', async () => {
    const w = await handedOver()
    w.sessions.run(SESSION, true)
    value(await w.submit())
    await w.goals.reconcile(TENANT)
    expect(w.record().state.status).toBe('active')
    expect(w.record().examination.arrived).toBe(true)
    w.sessions.run(SESSION, false)
    await w.goals.reconcile(TENANT)
    expect(w.record().state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
    expect(w.record().examination.arrived).toBe(false)
    await w.goals.reconcile(TENANT)
    expect(w.sessions.woken).toEqual([])
  })

  it('the verdict that is owed sends the agent on when the readings found something not done', async () => {
    const w = await handedOver()
    w.sessions.run(SESSION, true)
    value(await w.submit([one('A1'), one('A2', { value: 'fails', note: '按右键蛇不转向' })]))
    w.sessions.run(SESSION, false)
    await w.goals.reconcile(TENANT)
    expect(w.record().state).toMatchObject({ status: 'active', rounds: 1 })
    expect(w.sessions.woken.map(wake => wake.kind)).toEqual(['continue'])
    expect(w.sessions.woken[0]?.open).toContain('按右键蛇不转向')
  })

  it('the verdict that is owed waits while the session or its history cannot be read', async () => {
    const w = await handedOver()
    w.sessions.run(SESSION, true)
    value(await w.submit())
    w.sessions.run(SESSION, false)
    w.history.readable(false)
    await w.goals.reconcile(TENANT)
    expect(w.record().state.status).toBe('active')
    w.history.readable(true)
    await w.goals.reconcile(TENANT)
    expect(w.record().state.status).toBe('settled')
  })

  it('has no basis when the calls of the examination, the session of the goal or its history cannot be read', async () => {
    const w = await handedOver()
    w.examining.readable(false)
    expect(await w.submit()).toEqual({ kind: 'basis-unavailable' })
    w.examining.readable(true)
    w.history.readable(false)
    expect(await w.submit()).toEqual({ kind: 'basis-unavailable' })
    w.history.readable(true)
    w.sessions.readable(false)
    expect(await w.submit()).toEqual({ kind: 'basis-unavailable' })
    w.sessions.readable(true)
    w.store.readable(false)
    expect(await w.submit()).toEqual({ kind: 'basis-unavailable' })
    w.store.readable(true)
    expect(w.record().examination.batch).not.toBeNull()
    expect(w.record().examination.submitted).toBeNull()
  })

  it('is refused when the goal no longer has this session examine for it by the time the readings are written', async () => {
    const swapped = { on: false }
    const w = await handedOver(undefined, store => ({
      ...store,
      commit: (tenant, command) => store.commit(tenant, command),
      owing: tenant => store.owing(tenant),
      examinedBy: (tenant, examiner) => store.examinedBy(tenant, examiner),
      async latest(tenant, session) {
        const read = await store.latest(tenant, session)
        if (!swapped.on || read.kind !== 'read' || read.value === null) return read
        const examination = { ...read.value.examination, examiner: 'another-examiner' }
        return { kind: 'read', value: { ...read.value, examination } }
      },
    }))
    swapped.on = true
    expect(await w.submit()).toEqual({ kind: 'refused', reason: { kind: 'denied' } })
    swapped.on = false
    expect(w.record().examination.read).toEqual({})
  })

  it('has no basis when the port that knows the calls of the examination throws', async () => {
    const w = await handedOver()
    Object.assign(w.examining, { cited: () => Promise.reject(new Error('down')) })
    expect(await w.submit()).toEqual({ kind: 'basis-unavailable' })
  })

  it('keeps the identity of the batch and a digest of what was handed in, so a repeat is known', async () => {
    const w = await handedOver()
    w.sessions.run(SESSION, true)
    value(await w.submit())
    expect(w.record().examination.submitted).toEqual({
      key: { revision: 1, written: 'call-1' },
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    })
  })
})

describe('the exit codes of the commands run again, handed in by the program', () => {
  const SYSTEM = { tenant: TENANT, subject: 'goal-system' }
  const ran = (exit: number | null) => [{ criterion: 'A1', exit, note: `exit ${String(exit)}` }]
  const hand = (
    w: Awaited<ReturnType<typeof handedOver>>,
    results: unknown = ran(0),
    request = BATCH,
  ) => w.goals.reran(SYSTEM, { session: SESSION, request, results })

  it('with every command passing and an examination left, the batch stays out and the answer names what is left to examine', async () => {
    const w = await handedOver()
    expect(value(await hand(w))).toEqual({ examine: ['A2'] })
    expect(w.record().examination.batch).toMatchObject({
      ran: { A1: { value: 'holds', note: 'exit 0' } },
    })
    expect(w.authority.asked.at(-1)).toMatchObject({ session: SESSION, action: 'rerun' })
    expect(value(await w.submit([one('A2')]))).toEqual({ taken: 'counted' })
    expect(w.record().state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
  })

  it('with a command that did not pass, the batch is back at once: the agent is sent on and nothing is left to examine', async () => {
    const w = await handedOver()
    expect(value(await hand(w, ran(1)))).toEqual({ examine: [] })
    expect(w.record().examination.batch).toBeNull()
    expect(w.record().readings.criteria.A1).toMatchObject({
      value: 'fails',
      source: 'system',
      note: 'exit 1',
    })
    expect(w.sessions.woken.map(wake => wake.kind)).toEqual(['continue'])
    expect(w.sessions.woken[0]?.open).toContain('exit 1')
  })

  it('of a batch that is no longer out changes nothing and leaves nothing to examine', async () => {
    const w = await handedOver()
    const before = w.record()
    expect(value(await hand(w, ran(0), 'examine/1/1/call-0'))).toEqual({ examine: [] })
    expect(w.record()).toEqual(before)
  })

  it('is refused to a caller the authority does not let hand in, when its shape is wrong, and when the session has no goal', async () => {
    const w = await handedOver()
    const before = w.record()
    expect(await hand(w, 'not results')).toMatchObject({ reason: { kind: 'invalid' } })
    expect(await hand(w, ran(0), 'no-batch')).toMatchObject({ reason: { kind: 'invalid' } })
    w.authority.answer(action => (action === 'rerun' ? 'denied' : 'permitted'))
    expect(await hand(w)).toEqual({ kind: 'refused', reason: { kind: 'denied' } })
    w.authority.answer('permitted')
    expect(
      await w.goals.reran(SYSTEM, { session: 'no-such', request: BATCH, results: ran(0) }),
    ).toEqual({
      kind: 'refused',
      reason: { kind: 'state', reason: 'no-live-goal' },
    })
    expect(w.record()).toEqual(before)
  })

  it('has no basis while the history or the session of the goal cannot be read', async () => {
    const w = await handedOver()
    for (const port of [w.history, w.sessions, w.store]) {
      port.readable(false)
      expect(await hand(w)).toEqual({ kind: 'basis-unavailable' })
      port.readable(true)
    }
    expect(w.record().examination.batch?.ran).toEqual({})
  })

  it('once the commands passed, the batch is handed on with only the criteria left to examine', async () => {
    const w = await handedOver(world => world.examining.handNext('unknown'))
    value(await hand(w))
    await w.goals.reconcile(TENANT)
    expect(w.examining.handed).toHaveLength(1)
    expect(w.record().examination.batch).toMatchObject({ delivery: 'handed', ran: { A1: {} } })
    expect(w.examining.seen.map(batch => batch.criteria.map(entry => entry.id))).toEqual([
      ['A1', 'A2'],
      ['A2'],
    ])
    expect(w.examining.seen.at(-1)?.brief).not.toContain('node accept.js')
  })

  it('an examination whose round ended without its readings leaves the rest untold: with a command passed, the agent is sent on for the examined one alone', async () => {
    const w = await handedOver()
    value(await hand(w))
    await w.goals.reconcile(TENANT)
    expect(w.record().examination.batch).not.toBeNull()
    w.examining.end(BATCH)
    await w.goals.reconcile(TENANT)
    expect(w.record().examination.batch).toBeNull()
    expect(w.record().readings.criteria).toMatchObject({
      A1: { value: 'holds' },
      A2: { value: 'cannot-tell', note: 'the examination ended without handing in its readings' },
    })
    expect(w.sessions.woken.map(wake => wake.kind)).toEqual(['continue'])
    expect(w.examining.cancelled).toEqual([])
    const kept = w.record()
    await w.goals.reconcile(TENANT)
    expect(w.record()).toEqual(kept)
  })

  it('a round that ended is not acted on while it cannot be told: the port fails, or where the work stands cannot be read; a batch not taken yet is not asked about', async () => {
    const w = await handedOver()
    const before = w.record()
    Object.assign(w.examining, { ended: () => Promise.reject(new Error('down')) })
    await w.goals.reconcile(TENANT)
    expect(w.record()).toEqual(before)
    Object.assign(w.examining, { ended: async () => 'ended' })
    w.history.readable(false)
    await w.goals.reconcile(TENANT)
    expect(w.record()).toEqual(before)
    expect(w.hinted).toEqual([TENANT])
    w.history.readable(true)
    const owed = await handedOver(world => world.examining.handNext('unknown'))
    const asked: string[] = []
    Object.assign(owed.examining, {
      ended: async (_tenant: string, batch: { request: string }) => {
        asked.push(batch.request)
        return 'ended'
      },
      hand: async () => ({ kind: 'unknown' }),
    })
    await owed.goals.reconcile(TENANT)
    expect(asked).toEqual([])
    expect(owed.record().examination.batch?.delivery).toBe('unknown')
  })
})

describe('what a write takes from the examining side', () => {
  const cancel = (w: Awaited<ReturnType<typeof handedOver>>) =>
    w.goals.command(OWNER, { session: SESSION, command: { kind: 'cancel' } })

  it('a goal that settles before any session examined for it has none to let go of', async () => {
    const w = await handedOver(world => world.examining.handNext('unknown'))
    value(await cancel(w))
    expect(w.examining.cancelled).toEqual([BATCH])
    expect(w.examining.closed).toEqual([])
  })

  it('the session of the examiner before is let go of only when the write that names the new one stood', async () => {
    const stale = {
      on: false,
      answers: [
        { kind: 'committed', value: { kind: 'stale' } },
        { kind: 'rolled-back' },
        { kind: 'unknown' },
      ] as unknown[],
    }
    const w = await handedOver(undefined, store => ({
      ...store,
      latest: (tenant, session) => store.latest(tenant, session),
      owing: tenant => store.owing(tenant),
      examinedBy: (tenant, examiner) => store.examinedBy(tenant, examiner),
      async commit(tenant, command) {
        const naming = command.next.examination.examiner === 'a-new-examiner'
        if (stale.on && naming) return stale.answers.shift() as never
        return store.commit(tenant, command)
      },
    }))
    value(await w.submit([one('A1'), one('A2', { value: 'fails' })]))
    w.history.made(write(2, 'snake.js'))
    const real = w.examining.hand
    Object.assign(w.examining, {
      hand: async (...args: Parameters<typeof real>) => {
        await real(...args)
        return { kind: 'handed', examiner: 'a-new-examiner' }
      },
    })
    stale.on = true
    const check = { session: SESSION, call: 'exec-2/cand-1/before_terminal/call/0' }
    value(await w.goals.observe(CHECK, { ...check, candidate: 'complete' } as never))
    await w.goals.reconcile(TENANT)
    await w.goals.reconcile(TENANT)
    expect(stale.answers).toEqual([])
    expect(w.record().examination.examiner).toBe(EXAMINER)
    expect(w.examining.closed).toEqual([])
  })

  it('a batch taken back is told to it, as the batch it was handed: the goal was cancelled, so it lets go of the session too', async () => {
    const w = await handedOver()
    value(await cancel(w))
    expect(w.examining.cancelled).toEqual([BATCH])
    expect(w.examining.closed).toEqual([EXAMINER])
  })

  it('a batch that came back with its readings is not: when they settle the goal, the examining side lets go of the session, once', async () => {
    const w = await handedOver()
    value(await w.submit())
    expect(w.record().state.status).toBe('settled')
    expect(w.examining.cancelled).toEqual([])
    expect(w.examining.closed).toEqual([EXAMINER])
    await w.goals.reconcile(TENANT)
    expect(w.examining.closed).toEqual([EXAMINER])
  })

  it('readings that leave the goal going keep the session for the next batch', async () => {
    const w = await handedOver()
    value(await w.submit([one('A1'), one('A2', { value: 'fails' })]))
    expect(w.record().state.status).toBe('active')
    expect([w.examining.cancelled, w.examining.closed]).toEqual([[], []])
  })

  it('a batch replaced by a later one is told to it before the new one is handed over', async () => {
    const w = await handedOver()
    w.history.made(write(2, 'snake.js'))
    const check = { session: SESSION, call: 'exec-2/cand-1/before_terminal/call/0' }
    value(await w.goals.observe(CHECK, { ...check, candidate: 'complete' } as never))
    expect(w.record().examination.batch?.key.written).toBe('call-2')
    expect(w.examining.cancelled).toEqual([BATCH])
    expect(w.examining.asked).toEqual([BATCH, 'examine/1/1/call-2'])
    expect(w.examining.closed).toEqual([])
  })

  it('telling it is best effort: a port that fails changes nothing of what was written', async () => {
    const w = await handedOver()
    const down = () => Promise.reject(new Error('down'))
    Object.assign(w.examining, { cancel: down, close: down })
    expect(value(await cancel(w))).toMatchObject({ state: { status: 'settled' } })
  })

  it('a goal handed to another examining session lets go of the one before', async () => {
    const w = await handedOver()
    value(await w.submit([one('A1'), one('A2', { value: 'fails' })]))
    w.history.made(write(2, 'snake.js'))
    const real = w.examining.hand
    Object.assign(w.examining, {
      hand: async (...args: Parameters<typeof real>) => {
        await real(...args)
        return { kind: 'handed', examiner: 'a-new-examiner' }
      },
    })
    const check = { session: SESSION, call: 'exec-2/cand-1/before_terminal/call/0' }
    value(await w.goals.observe(CHECK, { ...check, candidate: 'complete' } as never))
    expect(w.record().examination.examiner).toBe('a-new-examiner')
    expect(w.examining.closed).toEqual([EXAMINER])
  })
})

describe('who may ask what of a goal that is examined', () => {
  it('the examining session reads the brief of the batch that is out; no other session does', async () => {
    const w = await handedOver()
    const brief = value(await w.goals.brief(AGENT, { examiner: EXAMINER }))
    expect(brief).toContain(`Batch: ${BATCH}`)
    expect(brief).toContain('- [A2] 方向键能控制蛇')
    const DENIED = { kind: 'refused', reason: { kind: 'denied' } }
    for (const other of [SESSION, 'another-session'])
      expect(await w.goals.brief(AGENT, { examiner: other })).toEqual(DENIED)
    w.authority.answer(action => (action === 'brief' ? 'denied' : 'permitted'))
    expect(await w.goals.brief(AGENT, { examiner: EXAMINER })).toEqual(DENIED)
    expect(w.authority.asked.at(-1)).toMatchObject({ session: EXAMINER, action: 'brief' })
  })

  it('the brief has no basis while the goal, its session or its history cannot be read; with no batch out there is none to read', async () => {
    const w = await handedOver()
    const read = () => w.goals.brief(AGENT, { examiner: EXAMINER })
    for (const port of [w.store, w.sessions, w.history]) {
      port.readable(false)
      expect(await read()).toEqual({ kind: 'basis-unavailable' })
      port.readable(true)
    }
    w.sessions.run(SESSION, true)
    value(await w.submit())
    expect(await read()).toEqual({ kind: 'refused', reason: { kind: 'denied' } })
  })

  it('a session examines for a goal while that goal is not settled; no other session does, and one of a settled goal does not', async () => {
    const w = await handedOver()
    const examines = (examiner: string) => w.goals.examines(AGENT, { examiner })
    expect(value(await examines(EXAMINER))).toBe(true)
    expect(w.authority.asked.at(-1)).toMatchObject({ session: EXAMINER, action: 'brief' })
    expect(value(await examines(SESSION))).toBe(false)
    w.store.readable(false)
    expect(await examines(EXAMINER)).toEqual({ kind: 'basis-unavailable' })
    w.store.readable(true)
    w.authority.answer('denied')
    expect(value(await examines(EXAMINER))).toBe(false)
    w.authority.answer('permitted')
    value(await w.submit())
    expect(value(await examines(EXAMINER))).toBe(false)
  })

  it('the examining session is refused what the working agent does: propose and track', async () => {
    const w = await handedOver()
    w.sessions.add(EXAMINER, 'unattended')
    const proposal = { kind: 'set', draft: SNAKE } as const
    expect(await w.goals.propose(AGENT, { session: EXAMINER, proposal })).toEqual({
      kind: 'refused',
      reason: { kind: 'denied' },
    })
    expect(await w.goals.track(AGENT, { session: EXAMINER, patch: {} })).toEqual({
      kind: 'refused',
      reason: { kind: 'denied' },
    })
  })

  it('no command of either session writes a state: the working agent has no way to hand in a reading of its own goal', async () => {
    const w = await handedOver()
    const before = w.record().state
    expect(await w.submit(BOTH, BATCH, SESSION)).toMatchObject({ kind: 'refused' })
    await w.goals.track(AGENT, { session: SESSION, patch: { notes: ['都做完了'] } })
    expect(w.record().state).toEqual(before)
    expect(w.record().examination.read).toEqual({})
  })
})
