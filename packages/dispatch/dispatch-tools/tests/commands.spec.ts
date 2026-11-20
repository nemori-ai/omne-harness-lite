import { describe, expect, it } from 'vitest'
import type { Dispatch } from '@omne-harness/dispatch-contract'
import { answerAgents } from '../src/author.ts'
import { attachAgents, type AgentsCallSource, type BoundAgents } from '../src/port.ts'
import type { AgentsArguments } from '../src/protocol.ts'
import { CONTEXT, SELF, dispatchOf, done, refused, world } from './world.ts'

type World = ReturnType<typeof world>

function attached(w: World, bound: BoundAgents = w.bound) {
  attachAgents({ context: w.context, limits: {}, finish: async () => undefined } as never, bound)
  return w.context
}
const ask = (w: World, args: Exclude<AgentsArguments, { command: 'dispatch' }>) =>
  answerAgents(args, attached(w))
const valueOf = (answer: Awaited<ReturnType<typeof answerAgents>>) => {
  if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
  const [head, ...rest] = answer.ok.split('\n')
  return { head, value: JSON.parse(rest.join('\n')) as Record<string, unknown> }
}
const reported: Dispatch = dispatchOf({
  state: 'reported',
  report: { text: 'all done', origin: 'report' },
  delivery: { kind: 'delivered', to: 'result' },
})
const PEER = 'b'.repeat(64)

describe('help', () => {
  it('gives the menu of all commands, and the usage of one command when it is named', async () => {
    const w = world()
    const all = await ask(w, { command: 'help', params: {} })
    if (!('ok' in all)) throw new Error('no help')
    for (const name of ['targets', 'dispatch', 'show', 'withdraw', 'report', 'message', 'list'])
      expect(all.ok).toContain(name)
    const one = await ask(w, { command: 'help', params: { name: 'dispatch' } })
    expect('ok' in one && one.ok).toContain('instruction')
    expect(w.asked).toEqual([])
  })
})

describe('targets', () => {
  it('lists the definitions the tenant sees now, each with the modes it can be dispatched in', async () => {
    const w = world()
    expect(valueOf(await ask(w, { command: 'targets', params: {} }))).toEqual({
      head: 'done Agents targets',
      value: {
        targets: [
          {
            agent: 'coding',
            type: 'master',
            summary: 'A coding agent.',
            modes: ['spawn', 'delegate', 'handoff'],
          },
          {
            agent: 'assistant',
            type: 'non-master',
            summary: 'A general assistant.',
            modes: ['spawn', 'delegate'],
          },
        ],
      },
    })
  })

  it('is unavailable when the definitions cannot be read', async () => {
    const w = world({}, { targets: async () => undefined })
    expect(await ask(w, { command: 'targets', params: {} })).toMatchObject({
      failure: { kind: 'unavailable', operation: 'Agents.targets' },
    })
  })
})

describe('show', () => {
  it('reads one dispatch as the session of the call: state, report, delivery, stop and failure', async () => {
    const w = world({ show: async () => done(reported) })
    const shown = valueOf(await ask(w, { command: 'show', params: { dispatch: reported.id } }))
    expect(shown.head).toBe('done Agents show')
    expect(shown.value).toEqual({
      dispatch: reported.id,
      mode: 'delegate',
      agent: 'helper',
      session: reported.session,
      dispatcher: SELF,
      state: 'reported',
      report: { text: 'all done', origin: 'report' },
      delivery: 'delivered as the result of the dispatching call',
      expectation: null,
    })
    expect(w.made('show')).toEqual([[CONTEXT, reported.id]])
  })

  it.each([
    [{ delivery: { kind: 'pending' } }, 'not delivered yet'],
    [
      { delivery: { kind: 'delivered', to: 'input' } },
      'delivered as an input to the dispatching session',
    ],
    [
      { delivery: { kind: 'undeliverable' } },
      'not deliverable: the dispatching session is archived',
    ],
    [
      { delivery: { kind: 'wait-closed' } },
      'not delivered: the dispatching call had stopped waiting',
    ],
    [{ delivery: null }, null],
  ] as const)('says where the outcome went: %j', async (change, expected) => {
    const w = world({ show: async () => done({ ...reported, ...change } as Dispatch) })
    const { value } = valueOf(await ask(w, { command: 'show', params: { dispatch: reported.id } }))
    expect(value['delivery']).toBe(expected)
  })

  it('shows the failure of a failed dispatch and the stop of a withdrawn one', async () => {
    const failure = { cause: 'run-failed', detail: 'it broke' } as const
    const failed = world({ show: async () => done(dispatchOf({ state: 'failed', failure })) })
    expect(
      valueOf(await ask(failed, { command: 'show', params: { dispatch: reported.id } })).value,
    ).toMatchObject({
      state: 'failed',
      failure,
    })
    const withdrawn = world({
      show: async () => done(dispatchOf({ state: 'withdrawn', stop: 'requested' })),
    })
    expect(
      valueOf(await ask(withdrawn, { command: 'show', params: { dispatch: reported.id } })).value,
    ).toMatchObject({ state: 'withdrawn', stop: 'requested' })
  })

  it.each([
    ['no-such-dispatch', 'invalid'],
    ['not-permitted', 'unsupported'],
  ] as const)('fails with the reason %s', async (reason, kind) => {
    const w = world({ show: async () => refused(reason) })
    const answer = await ask(w, { command: 'show', params: { dispatch: reported.id } })
    expect(answer).toMatchObject({ failure: { kind } })
    expect('failure' in answer && answer.failure.reason.startsWith(`${reason}: `)).toBe(true)
  })
})

describe('withdraw', () => {
  it('takes back a dispatch and says how far the stop of its run got', async () => {
    const withdrawn = dispatchOf({
      state: 'withdrawn',
      stop: 'requested',
      delivery: { kind: 'pending' },
    })
    const w = world({ withdraw: async () => done(withdrawn) })
    expect(
      valueOf(await ask(w, { command: 'withdraw', params: { dispatch: withdrawn.id } })),
    ).toEqual({
      head: 'done Agents withdraw',
      value: {
        dispatch: withdrawn.id,
        state: 'withdrawn',
        stop: 'requested',
        recalled: false,
        note: 'The run of the session was asked to stop. That it stopped is confirmed later: see show. The session is not archived, and what it already did is not undone.',
      },
    })
    expect(w.made('withdraw')).toEqual([[CONTEXT, withdrawn.id]])
  })

  it.each([
    ['already-reported', 'conflict'],
    ['cannot-withdraw-a-handoff', 'unsupported'],
    ['no-such-dispatch', 'invalid'],
    ['not-permitted', 'unsupported'],
    ['failed', 'conflict'],
  ] as const)('fails with the reason %s', async (reason, kind) => {
    const w = world({ withdraw: async () => refused(reason) })
    expect(await ask(w, { command: 'withdraw', params: { dispatch: reported.id } })).toMatchObject({
      failure: { kind },
    })
  })

  it('says the result is not known when the registry does not answer whether it was written', async () => {
    const w = world({ withdraw: async () => ({ kind: 'unknown' }) })
    expect(await ask(w, { command: 'withdraw', params: { dispatch: reported.id } })).toMatchObject({
      failure: { kind: 'unknown', operation: 'Agents.withdraw' },
    })
    const thrown = world({ withdraw: async () => Promise.reject(new Error('down')) })
    expect(
      await ask(thrown, { command: 'withdraw', params: { dispatch: reported.id } }),
    ).toMatchObject({
      failure: { kind: 'unknown' },
    })
  })
})

describe('report', () => {
  it('hands back the report of the work dispatched to this session', async () => {
    const w = world({ report: async () => done(reported) })
    expect(valueOf(await ask(w, { command: 'report', params: { text: 'all done' } }))).toEqual({
      head: 'done Agents report',
      value: {
        dispatch: reported.id,
        state: 'reported',
        recalled: false,
        note: 'The report is handed back. There is one report for this work: you can end your turn.',
      },
    })
    expect(w.made('report')).toEqual([[CONTEXT, 'all done']])
  })

  it.each([
    ['not-dispatched', 'unsupported'],
    ['already-reported', 'conflict'],
    ['withdrawn', 'conflict'],
    ['no-report-in-this-mode', 'unsupported'],
  ] as const)('fails with the reason %s', async (reason, kind) => {
    const w = world({ report: async () => refused(reason) })
    expect(await ask(w, { command: 'report', params: { text: 'x' } })).toMatchObject({
      failure: { kind },
    })
  })
})

describe('message', () => {
  it('sends one message under the identity the call gives, or under the identity of the call', async () => {
    const w = world({ message: async () => done({ to: PEER, input: 'message/1' } as never) })
    const named = { to: PEER as never, text: 'hello', id: 'note-1' }
    expect(valueOf(await ask(w, { command: 'message', params: named }))).toEqual({
      head: 'done Agents message',
      value: { to: PEER },
    })
    await ask(w, { command: 'message', params: { to: PEER as never, text: 'hello' } })
    expect(w.made('message')).toEqual([
      [CONTEXT, { to: PEER, text: 'hello', id: 'note-1' }],
      [CONTEXT, { to: PEER, text: 'hello', id: 'call-1' }],
    ])
  })

  it.each([
    ['no-such-session', 'invalid'],
    ['archived', 'unsupported'],
    ['to-self', 'invalid'],
    ['not-permitted', 'unsupported'],
  ] as const)(
    'fails with the reason %s, and gives nothing of the other session',
    async (reason, kind) => {
      const w = world({ message: async () => refused(reason) })
      const answer = await ask(w, {
        command: 'message',
        params: { to: PEER as never, text: 'secret' },
      })
      expect(answer).toMatchObject({ failure: { kind } })
      expect(JSON.stringify(answer)).not.toContain(PEER)
    },
  )
})

describe('list', () => {
  const line = (session: string, change: object = {}) => ({
    session,
    title: 'a title',
    relation: 'child',
    attendance: 'unattended',
    definition: 'coding',
    lifecycle: 'dormant',
    ...change,
  })

  it('lists one page of the directory and reads the dispatch states of its sessions in one read', async () => {
    const child = dispatchOf({ session: PEER as never, state: 'started' })
    const w = world({ list: async () => done([child]) })
    w.pages.push({
      ok: {
        items: [line(PEER), line(SELF, { relation: 'self', attendance: 'attended' })],
        next: 'c2',
        complete: false,
      },
    } as never)
    const listed = valueOf(
      await ask(w, { command: 'list', params: { attendance: 'unattended', limit: 10 } }),
    )
    expect(listed).toEqual({
      head: 'done Agents list',
      value: {
        sessions: [
          {
            session: PEER,
            title: 'a title',
            relation: 'child',
            attendance: 'unattended',
            definition: 'coding',
            lifecycle: 'dormant',
            dispatch: { id: child.id, state: 'started', mode: 'delegate' },
          },
          {
            session: SELF,
            title: 'a title',
            relation: 'self',
            attendance: 'attended',
            definition: 'coding',
            lifecycle: 'dormant',
            dispatch: null,
          },
        ],
        next: 'c2',
        complete: false,
      },
    })
    expect(w.filters).toEqual([
      {
        relation: null,
        attendance: 'unattended',
        definition: null,
        archived: false,
        cursor: null,
        limit: 10,
      },
    ])
    expect(w.made('list')).toEqual([[CONTEXT, { by: { sessions: [PEER, SELF] } }]])
  })

  it('does not ask the registry for an empty page', async () => {
    const w = world()
    w.pages.push({ ok: { items: [], next: null, complete: true } })
    expect(valueOf(await ask(w, { command: 'list', params: {} })).value).toEqual({
      sessions: [],
      next: null,
      complete: true,
    })
    expect(w.filters).toEqual([
      {
        relation: null,
        attendance: null,
        definition: null,
        archived: false,
        cursor: null,
        limit: 20,
      },
    ])
    expect(w.asked).toEqual([])
  })

  it('filters by dispatch state from the registry, with what each dispatch fixes of its session', async () => {
    const open = dispatchOf({ session: PEER as never, state: 'started' })
    const handed = dispatchOf({
      id: `dsp_${'2'.repeat(64)}` as never,
      mode: 'handoff',
      agent: 'coding',
      state: 'started',
    })
    const w = world({ list: async () => done([open, handed]) })
    const listed = valueOf(await ask(w, { command: 'list', params: { dispatch: 'started' } }))
    expect(listed.value).toEqual({
      sessions: [
        {
          session: PEER,
          relation: 'child',
          attendance: 'unattended',
          definition: 'helper',
          dispatch: { id: open.id, state: 'started', mode: 'delegate' },
        },
        {
          session: handed.session,
          relation: 'handed-off',
          attendance: 'attended',
          definition: 'coding',
          dispatch: { id: handed.id, state: 'started', mode: 'handoff' },
        },
      ],
      next: null,
      complete: true,
    })
    expect(w.made('list')).toEqual([[CONTEXT, { by: { dispatcher: SELF }, states: ['started'] }]])
    expect(w.filters).toEqual([])
  })

  it('narrows a list by dispatch state with the other filters it can judge from the dispatch', async () => {
    const open = dispatchOf({ session: PEER as never, state: 'started' })
    const w = world({ list: async () => done([open]) })
    const none = await ask(w, {
      command: 'list',
      params: { dispatch: 'started', attendance: 'attended' },
    })
    expect(valueOf(none).value).toMatchObject({ sessions: [] })
    const some = await ask(w, {
      command: 'list',
      params: { dispatch: 'started', relation: 'child', definition: 'helper' },
    })
    expect(valueOf(some).value).toMatchObject({ sessions: [{ session: PEER }] })
  })

  it.each([
    ['denied', 'unsupported'],
    ['invalid', 'invalid'],
    ['unavailable', 'unavailable'],
  ] as const)('fails when the directory answers %s', async (failure, kind) => {
    const w = world()
    w.pages.push({ failure })
    expect(await ask(w, { command: 'list', params: {} })).toMatchObject({ failure: { kind } })
  })

  it('is unavailable when the registry cannot give the states of the page', async () => {
    const w = world({ list: async () => ({ kind: 'basis-unavailable' }) })
    w.pages.push({ ok: { items: [line(PEER)], next: null, complete: true } } as never)
    expect(await ask(w, { command: 'list', params: {} })).toMatchObject({
      failure: { kind: 'unavailable', operation: 'Agents.list' },
    })
  })
})

const OUT_OF_REACH: readonly (readonly [string, Partial<AgentsCallSource> | undefined, string])[] =
  [
    ['no services are attached to the call', undefined, 'not attached'],
    ['the provider is not there', { dispatching: () => undefined }, 'not available now'],
    [
      'the session of the call is not verified',
      { context: async () => undefined },
      'not available now',
    ],
    [
      'the context is of another tenant',
      { context: async () => ({ ...CONTEXT, tenant: 'tenant-b' as never }) },
      'does not act',
    ],
  ]

describe('a call the services cannot be reached from', () => {
  it.each(OUT_OF_REACH)(
    'answers that the basis is unavailable when %s',
    async (_name, change, part) => {
      const w = world({}, change ?? {})
      const context: { signal: AbortSignal } = change === undefined ? w.context : attached(w)
      const answer = await answerAgents(
        { command: 'show', params: { dispatch: reported.id } },
        context,
      )
      expect(answer).toMatchObject({ failure: { kind: 'unavailable', operation: 'Agents.show' } })
      expect('failure' in answer && answer.failure.reason).toContain(part)
      expect(w.asked).toEqual([])
    },
  )
})
