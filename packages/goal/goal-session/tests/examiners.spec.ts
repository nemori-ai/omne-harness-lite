import { describe, expect, it } from 'vitest'
import type { BatchToHand, PortRead } from '@omne-harness/goal'
import { sourceRequestIdentities, type SessionId } from '@omne-harness/session-contract'
import {
  CLOSE_LOOKS,
  CLOSE_WAIT_MS,
  createSessionExamining,
  EXAMINER_REUSE_MS,
  GOAL_SOURCES,
  type Called,
  type ExaminerCalls,
} from '../src/index.ts'
import { failure, LEGAL_TENANT, page, result, SESSION, TENANT, work, world } from './world.ts'

const BATCH = 'examine/1/1/call-1'
const BRIEF = `Batch: ${BATCH}\n\nExamine each of these criteria yourself.`
const EXAMINED = { id: 'A2', evidence: { kind: 'examination', method: '走一局' } } as const
const batchOf = (change: Partial<BatchToHand> = {}): BatchToHand => ({
  session: SESSION,
  request: BATCH,
  examiner: null,
  where: '/work',
  brief: BRIEF,
  criteria: [EXAMINED],
  ...change,
})
const idsOf = (request = BATCH, session?: string) =>
  sourceRequestIdentities({
    tenant: LEGAL_TENANT,
    source: GOAL_SOURCES.examine,
    request: `${SESSION}/${request}`,
    ...(session === undefined ? {} : { session: session as SessionId }),
  })

function examiners() {
  const w = world()
  const made: [string, Record<string, unknown>][] = []
  const state = {
    create: { ok: null } as Called<unknown> | Error,
    reminder: { kind: 'read', value: '17' } as PortRead<string | null> | Error,
  }
  const clock = { now: 1_000_000 }
  const own: ExaminerCalls = {
    async create(input) {
      made.push(['create', input])
      if (state.create instanceof Error) throw state.create
      return state.create
    },
    async cancelRun(input) {
      made.push(['cancelRun', input])
    },
    async archive(input) {
      made.push(['archive', input])
    },
    async reminderWith(input) {
      made.push(['reminderWith', input])
      if (state.reminder instanceof Error) throw state.reminder
      return state.reminder
    },
  }
  const waited: number[] = []
  const works: (typeof w.state.work)[] = []
  const wait = async (ms: number) => {
    waited.push(ms)
    const next = works.shift()
    if (next !== undefined) w.state.work = next
  }
  const open = () => createSessionExamining({ ...w.calls, ...own }, { now: () => clock.now, wait })
  return { ...w, made, own: state, clock, open, examining: open(), waited, works }
}

describe('a batch handed to a session that examines', () => {
  it('goes into a session of its own, made beside the session of the goal, as a system reminder that is the brief; handed again, it names the same session and the same input', async () => {
    const w = examiners()
    const ids = idsOf()
    expect(ids.session).toMatch(/^[0-9a-f]{64}$/u)
    expect(await w.examining.hand(TENANT, batchOf())).toEqual({
      kind: 'handed',
      examiner: ids.session,
    })
    expect(w.made).toEqual([
      [
        'create',
        { tenant: LEGAL_TENANT, session: ids.session, operation: ids.create, beside: SESSION },
      ],
    ])
    const sent = idsOf(BATCH, ids.session)
    expect(w.accepted).toHaveLength(1)
    expect(w.accepted[0]).toMatchObject({
      tenant: LEGAL_TENANT,
      session: ids.session,
      operation: sent.accept,
      value: {
        kind: 'ordinary',
        input: sent.input,
        source: 'goal.examine',
        message: { role: 'system_reminder', blocks: [{ kind: 'text', text: BRIEF }] },
      },
    })
    await w.open().hand(TENANT, batchOf())
    expect(w.made[1]).toEqual(w.made[0])
    expect(w.accepted[1]).toEqual(w.accepted[0])
  })

  it('the next batch of the goal goes into the same session while the last one was handed less than a quarter of an hour ago, and into a new one after that or after a restart', async () => {
    const w = examiners()
    const first = idsOf().session
    await w.examining.hand(TENANT, batchOf())
    const NEXT = 'examine/1/1/call-7'
    const next = batchOf({ request: NEXT, examiner: first })
    w.clock.now += EXAMINER_REUSE_MS - 1
    expect(await w.examining.hand(TENANT, next)).toEqual({ kind: 'handed', examiner: first })
    expect(w.made.map(([name]) => name)).toEqual(['create'])
    expect(w.accepted[1]).toMatchObject({
      session: first,
      value: { input: idsOf(NEXT, first).input },
    })
    w.clock.now += EXAMINER_REUSE_MS
    const LATER = 'examine/1/1/call-9'
    const later = idsOf(LATER).session
    expect(await w.examining.hand(TENANT, batchOf({ request: LATER, examiner: first }))).toEqual({
      kind: 'handed',
      examiner: later,
    })
    expect(later).not.toBe(first)
    const restarted = await w.open().hand(TENANT, batchOf({ request: NEXT, examiner: later }))
    expect(restarted).toEqual({ kind: 'handed', examiner: idsOf(NEXT).session })
  })

  it('a kept session that takes no input any more is left for a new one', async () => {
    const w = examiners()
    const first = idsOf().session
    await w.examining.hand(TENANT, batchOf())
    const NEXT = 'examine/1/1/call-7'
    w.state.answer = failure('archived')
    const answer = await w.examining.hand(TENANT, batchOf({ request: NEXT, examiner: first }))
    expect(answer).toEqual({ kind: 'refused' })
    expect(w.made.map(([name, input]) => [name, input.session])).toEqual([
      ['create', first],
      ['create', idsOf(NEXT).session],
    ])
    expect(w.accepted.map(input => input.session)).toEqual([first, first, idsOf(NEXT).session])
  })

  it.each([
    ['is not known to be made', new Error('down'), 'unknown'],
    ['cannot be made now', failure('unavailable'), 'unknown'],
    ['is refused to this tenant', failure('denied'), 'refused'],
    ['is refused as written', failure('invalid'), 'refused'],
  ] as const)('a session that %s: %s, and no brief is sent', async (_name, answer, kind) => {
    const w = examiners()
    w.own.create = answer
    expect(await w.examining.hand(TENANT, batchOf())).toEqual({ kind })
    expect(w.accepted).toEqual([])
  })

  it('a brief whose sending is not known is not known to be handed; one the new session will not take is refused; a tenant that is none is refused', async () => {
    const w = examiners()
    w.state.answer = new Error('down')
    expect(await w.examining.hand(TENANT, batchOf())).toEqual({ kind: 'unknown' })
    w.state.answer = failure('unavailable')
    expect(await w.examining.hand(TENANT, batchOf())).toEqual({ kind: 'unknown' })
    w.state.answer = failure('archived')
    expect(await w.examining.hand(TENANT, batchOf())).toEqual({ kind: 'refused' })
    expect(await w.examining.hand('no-tenant', batchOf())).toEqual({ kind: 'refused' })
    w.state.answer = { ok: null }
    const NEXT = batchOf({ request: 'examine/1/1/call-7', examiner: idsOf().session })
    await w.examining.hand(TENANT, NEXT)
    expect(w.made.at(-1)?.[0]).toBe('create')
  })
})

describe('what became of the round an examining session gave a batch', () => {
  const out = { session: SESSION, request: BATCH, examiner: 'e'.repeat(64) }
  const active = (initial: readonly string[]) =>
    work({ run: { kind: 'active', run: 'run-3', initial } as never, pending: [] })
  const quiet = () => work({ pending: [], backgroundPlaceholders: [] })

  it('is over once nothing more comes of the session: no run, no input waiting, no call in the background; or the session is gone', async () => {
    const w = examiners()
    const ended = () => w.examining.ended(TENANT, out)
    w.state.work = { kind: 'read', value: quiet() }
    expect(await ended()).toBe('ended')
    w.state.work = { kind: 'read', value: work({ pending: [] }) }
    expect(await ended()).toBe('ended')
    for (const lifecycle of ['archived', 'frozen'] as const) {
      w.state.work = { kind: 'read', value: active(['in-1']) }
      w.state.work = { kind: 'read', value: { ...active(['in-1']), lifecycle } }
      expect(await ended()).toBe('ended')
    }
    w.state.work = { kind: 'read', value: null }
    expect(await ended()).toBe('ended')
    expect(await w.examining.ended('no-tenant', out)).toBe('ended')
  })

  it('is going while a run is, an input waits, or a call is in the background; and is not known while the session cannot be read or no session was named', async () => {
    const w = examiners()
    const ended = () => w.examining.ended(TENANT, out)
    w.state.work = { kind: 'read', value: active(['in-1']) }
    expect(await ended()).toBe('going')
    w.state.work = { kind: 'read', value: work({ pending: ['in-2'] as never }) }
    expect(await ended()).toBe('going')
    const background = { pending: [], backgroundPlaceholders: ['c-1'] } as never
    w.state.work = { kind: 'read', value: work(background) }
    expect(await ended()).toBe('going')
    w.state.work = { kind: 'unavailable' }
    expect(await ended()).toBe('unknown')
    expect(await w.examining.ended(TENANT, { ...out, examiner: null })).toBe('unknown')
  })

  it('a batch taken back stops the run its brief opened, and no other run', async () => {
    const w = examiners()
    const brief = idsOf(BATCH, out.examiner).input
    w.state.work = { kind: 'read', value: active([brief]) }
    await w.examining.cancel(TENANT, out)
    await w.examining.cancel(TENANT, out)
    expect(w.made).toHaveLength(2)
    expect(w.made[0]).toEqual(w.made[1])
    expect(w.made[0]).toMatchObject([
      'cancelRun',
      { tenant: LEGAL_TENANT, session: out.examiner, run: 'run-3' },
    ])
    expect(w.made[0]?.[1].operation).toMatch(/^sop_[0-9a-f]{64}$/u)
    w.made.length = 0
    w.state.work = { kind: 'read', value: active(['another-input']) }
    await w.examining.cancel(TENANT, out)
    for (const value of [quiet(), work({ pending: ['in-2'] as never }), null]) {
      w.state.work = { kind: 'read', value }
      await w.examining.cancel(TENANT, out)
    }
    w.state.work = { kind: 'unavailable' }
    await w.examining.cancel(TENANT, out)
    await w.examining.cancel(TENANT, { ...out, examiner: null })
    await w.examining.cancel('no-tenant', out)
    expect(w.made).toEqual([])
  })

  it('a goal that lets go of its examining session has it archived once nothing more comes of it, and the next batch goes into a new one', async () => {
    const w = examiners()
    const first = idsOf().session
    await w.examining.hand(TENANT, batchOf())
    w.state.work = { kind: 'read', value: quiet() }
    await w.examining.close(TENANT, { session: SESSION, examiner: first })
    await w.examining.close(TENANT, { session: SESSION, examiner: first })
    await w.examining.idle()
    const archives = w.made.filter(([name]) => name === 'archive')
    expect(archives).toHaveLength(2)
    expect(archives[0]).toEqual(archives[1])
    expect(archives[0]?.[1]).toMatchObject({ tenant: LEGAL_TENANT, session: first })
    expect(w.waited).toEqual([])
    await w.examining.close('no-tenant', { session: SESSION, examiner: first })
    await w.examining.idle()
    expect(w.made.filter(([name]) => name === 'archive')).toHaveLength(2)
    const NEXT = 'examine/1/1/call-7'
    expect(await w.examining.hand(TENANT, batchOf({ request: NEXT, examiner: first }))).toEqual({
      kind: 'handed',
      examiner: idsOf(NEXT).session,
    })
  })

  it('a session let go of from inside its own round is left to end that round first; one that is gone, or cannot be read, is left as it is', async () => {
    const w = examiners()
    const going = { kind: 'read', value: active(['in-1']) } as const
    w.state.work = going
    w.works.push(going, { kind: 'read', value: quiet() })
    await w.examining.close(TENANT, { session: SESSION, examiner: out.examiner })
    expect(w.made).toEqual([])
    await w.examining.idle()
    expect(w.waited).toEqual([CLOSE_WAIT_MS, CLOSE_WAIT_MS])
    expect(w.made.map(([name]) => name)).toEqual(['archive'])
    w.made.length = 0
    for (const work of [{ kind: 'read', value: null }, { kind: 'unavailable' }] as const) {
      w.state.work = work
      await w.examining.close(TENANT, { session: SESSION, examiner: out.examiner })
      await w.examining.idle()
    }
    expect(w.made).toEqual([])
  })

  it('a round that will not end is not waited for without end: the session is archived all the same', async () => {
    const w = examiners()
    w.state.work = { kind: 'read', value: active(['in-1']) }
    await w.examining.close(TENANT, { session: SESSION, examiner: out.examiner })
    await w.examining.idle()
    expect(w.waited).toHaveLength(CLOSE_LOOKS)
    expect(w.made.map(([name]) => name)).toEqual(['archive'])
  })
})

describe('the calls an examining session cites', () => {
  const EXAMINER = 'e'.repeat(64)
  const cited = (w: ReturnType<typeof examiners>, refs = ['x-1', 'x-9']) =>
    w.examining.cited(TENANT, EXAMINER, BATCH, refs)

  it('are of its examination when they were answered after the brief of that batch came in', async () => {
    const w = examiners()
    w.state.pages = [page([result('x-1'), result('x-2')], null)]
    expect(await cited(w)).toEqual({ kind: 'read', value: ['x-1'] })
    expect(w.made).toEqual([
      ['reminderWith', { tenant: LEGAL_TENANT, session: EXAMINER, line: `Batch: ${BATCH}` }],
    ])
    expect(w.asked).toEqual([{ after: '17', cursor: null }])
    expect(w.read).toEqual([{ tenant: LEGAL_TENANT, session: EXAMINER }])
  })

  it('are none when the session never took that brief, and cannot be told while its history cannot be read', async () => {
    const w = examiners()
    w.own.reminder = { kind: 'read', value: null }
    expect(await cited(w)).toEqual({ kind: 'read', value: [] })
    expect(w.asked).toEqual([])
    w.own.reminder = { kind: 'unavailable' }
    expect(await cited(w)).toEqual({ kind: 'unavailable' })
    w.own.reminder = new Error('down')
    expect(await cited(w)).toEqual({ kind: 'unavailable' })
    expect(await w.examining.cited('no-tenant', EXAMINER, BATCH, ['x-1'])).toEqual({
      kind: 'read',
      value: [],
    })
  })
})
