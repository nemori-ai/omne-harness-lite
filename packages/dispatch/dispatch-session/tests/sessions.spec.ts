import { describe, expect, it } from 'vitest'
import { reportInputOf } from '@omne-harness/dispatch'
import type { SessionRef } from '@omne-harness/dispatch-contract'
import {
  sourceRequestIdentities,
  type HistoryPage,
  type InputFate,
  type RunId,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { DISPATCH_SOURCES } from '../src/index.ts'
import {
  LEGAL_TENANT,
  MODES,
  OTHER_TENANT,
  PARENT,
  PEER,
  TENANT,
  dispatchOf,
  work,
  world,
} from './world.ts'

const RUN = 'run_1' as RunId
const failure = (kind: string): { failure: SessionFailure } =>
  ({ failure: { kind, action: 'x', owner: 'x', diagnostic: 'x', operation: 'x' } }) as never
const startOf = (id: string) =>
  sourceRequestIdentities({
    tenant: LEGAL_TENANT,
    source: DISPATCH_SOURCES.instruction,
    request: id,
  })

function entry(kind: string, payload: unknown) {
  const tree = (value: unknown): unknown =>
    value === null
      ? { kind: 'null' }
      : typeof value === 'string'
        ? { kind: 'string', value }
        : Array.isArray(value)
          ? { kind: 'array', items: value.map(tree) }
          : {
              kind: 'object',
              entries: Object.entries(value as object).map(([key, v]) => ({ key, value: tree(v) })),
            }
  return { id: `e-${kind}`, kind, payload: tree(payload) }
}
const page = (entries: unknown[], next: string | null = null): { ok: HistoryPage } =>
  ({ ok: { entries, next, exhausted: next === null } }) as never
const said = (...texts: string[]) =>
  entry('message.assistant', {
    message: { role: 'assistant', blocks: texts.map(text => ({ kind: 'text', text })) },
  })
const ended = (run: string, outcome = 'completed') =>
  entry('run.terminal', { terminal: { run, outcome } })

describe('the session of a dispatch', () => {
  it('has one identity for one dispatch of one tenant, the one Session derives for the request', () => {
    const { sessions } = world()
    const dispatch = dispatchOf()
    expect(sessions.sessionOf(TENANT, dispatch.id)).toBe(startOf(dispatch.id).session)
    expect(sessions.sessionOf(TENANT, dispatch.id)).toMatch(/^[0-9a-f]{64}$/u)
    expect(
      sessions.sessionOf(TENANT, dispatchOf({ id: `dsp_${'2'.repeat(64)}` as never }).id),
    ).not.toBe(sessions.sessionOf(TENANT, dispatch.id))
  })
})

describe('the row of a session', () => {
  it('reads the layer, the archive, the definition and the permission mode of now from the session itself', async () => {
    const { sessions, script, made } = world()
    script.works.set(PEER, {
      kind: 'read',
      value: work(PEER, { lifecycle: 'archived', tree: { root: PARENT as never, depth: 2 } }),
    })
    expect(await sessions.row(TENANT, PEER)).toEqual({
      kind: 'read',
      value: {
        session: PEER,
        depth: 2,
        archived: true,
        agent: 'coding',
        permission: 'auto_permission',
      },
    })
    expect(await sessions.row(TENANT, PARENT)).toMatchObject({
      value: { depth: 0, archived: false },
    })
    expect(made('work')).toEqual([
      { tenant: LEGAL_TENANT, session: PEER },
      { tenant: LEGAL_TENANT, session: PARENT },
    ])
  })

  it('answers that the tenant has no such session, and asks nothing more', async () => {
    const { sessions, made } = world()
    expect(await sessions.row(TENANT, PEER)).toEqual({ kind: 'read', value: null })
    expect(made('modes')).toEqual([])
  })

  it('answers no session for a tenant text that is no tenant, without asking Session', async () => {
    const { sessions, calls } = world()
    expect(await sessions.row(OTHER_TENANT, PARENT)).toEqual({ kind: 'read', value: null })
    expect(calls).toEqual([])
  })

  it('is unavailable when the session or its modes cannot be read', async () => {
    const first = world()
    first.script.works.set(PARENT, { kind: 'unavailable' })
    expect(await first.sessions.row(TENANT, PARENT)).toEqual({ kind: 'unavailable' })
    const second = world()
    second.script.modes = { kind: 'unavailable' }
    expect(await second.sessions.row(TENANT, PARENT)).toEqual({ kind: 'unavailable' })
  })
})

describe('creating the session of a dispatch', () => {
  it('creates an unattended child of the dispatching session with the instruction as its starting input', async () => {
    const { sessions, made } = world()
    const dispatch = dispatchOf({ expectation: 'three lines' })
    const identities = startOf(dispatch.id)
    const answer = await sessions.create(TENANT, {
      session: identities.session as unknown as SessionRef,
      dispatch,
      permission: 'never',
    })
    expect(answer).toEqual({ kind: 'created' })
    const [call] = made('create') as [{ creation: unknown }]
    expect(call).toMatchObject({
      tenant: LEGAL_TENANT,
      session: identities.session,
      operation: identities.create,
      creation: {
        agent: 'helper',
        workspace: null,
        modes: { ...MODES, permission: 'never' },
        standing: {
          relation: { kind: 'child', parent: PARENT },
          attendance: 'unattended',
          initial: {
            kind: 'ordinary',
            input: identities.input,
            source: 'dispatch.instruction',
            message: { role: 'system_reminder' },
          },
        },
      },
    })
    const text = JSON.stringify(call.creation)
    for (const part of [dispatch.instruction, 'three lines', dispatch.id, PARENT, 'report'])
      expect(text).toContain(part)
  })

  it('creates an attended main session handed over from the dispatching session, with the defaults of the tenant', async () => {
    const { sessions, made } = world()
    const dispatch = dispatchOf({ mode: 'handoff' })
    await sessions.create(TENANT, {
      session: startOf(dispatch.id).session as unknown as SessionRef,
      dispatch,
      permission: 'never',
    })
    expect(made('create')).toMatchObject([
      {
        creation: {
          modes: null,
          standing: { relation: { kind: 'handoff', origin: PARENT }, attendance: 'attended' },
        },
      },
    ])
    expect(made('modes')).toEqual([])
  })

  it.each(['delegate', 'handoff'] as const)(
    'gives the session of a %s the workspace the dispatching session stands at now',
    async mode => {
      const { sessions, script, made } = world()
      const attachment = { instance: 'i1', basis: 'b1' }
      const changed = { kind: 'workspace', value: 'ws_2', workspaceAttachment: attachment }
      const creation = { workspace: 'ws_1', workspaceAttachment: { instance: 'i0', basis: 'b0' } }
      script.works.set(PARENT, {
        kind: 'read',
        value: work(PARENT, { creation: creation as never, changes: [changed as never] }),
      })
      const dispatch = dispatchOf({ mode })
      await sessions.create(TENANT, { session: PEER, dispatch, permission: 'never' })
      expect(made('create')).toMatchObject([
        { creation: { workspace: { workspace: 'ws_2', attachment } } },
      ])
    },
  )

  it('does not create while the dispatching session cannot be read', async () => {
    const { sessions, script, made } = world()
    script.works.set(PARENT, { kind: 'unavailable' })
    const dispatch = dispatchOf()
    expect(await sessions.create(TENANT, { session: PEER, dispatch, permission: 'never' })).toEqual(
      {
        kind: 'unknown',
      },
    )
    expect(made('create')).toEqual([])
  })

  it.each([
    ['a refusal', failure('archived'), { kind: 'failed', detail: 'archived' }],
    ['a denial', failure('denied'), { kind: 'failed', detail: 'denied' }],
    [
      'an invalid creation',
      { failure: { kind: 'invalid', field: 'creation.relation', reason: 'depth' } },
      { kind: 'failed', detail: 'invalid: creation.relation: depth' },
    ],
    ['a commit of unknown result', failure('commit-unknown'), { kind: 'unknown' }],
    ['an unavailable session', failure('unavailable'), { kind: 'unknown' }],
    ['a quarantined session', failure('quarantined'), { kind: 'unknown' }],
    ['a call of unknown result', 'unknown', { kind: 'unknown' }],
    ['a thrown call', new Error('down'), { kind: 'unknown' }],
  ] as const)('answers %s of the creation as it is', async (_name, answer, expected) => {
    const { sessions, script } = world()
    script.create = answer as never
    const dispatch = dispatchOf()
    expect(await sessions.create(TENANT, { session: PEER, dispatch, permission: 'never' })).toEqual(
      expected,
    )
  })

  it('does not create while the modes of the dispatching session cannot be read', async () => {
    const { sessions, script, made } = world()
    script.modes = { kind: 'unavailable' }
    const dispatch = dispatchOf()
    expect(await sessions.create(TENANT, { session: PEER, dispatch, permission: 'never' })).toEqual(
      {
        kind: 'unknown',
      },
    )
    expect(made('create')).toEqual([])
  })
})

describe('where the starting input of the session is', () => {
  const fateOf = async (
    fate: InputFate | { failure: SessionFailure } | Error,
    pages: unknown[] = [],
    child: Partial<WorkSnapshot> = {},
  ) => {
    const { sessions, script, made } = world()
    const dispatch = dispatchOf()
    const identities = startOf(dispatch.id)
    script.fates.set(
      identities.input,
      fate instanceof Error || 'failure' in fate ? (fate as never) : { ok: fate },
    )
    script.works.set(identities.session, { kind: 'read', value: work(identities.session, child) })
    script.pages.push(...(pages as never[]))
    const session = identities.session as unknown as SessionRef
    const answer = await sessions.startFate(TENANT, { id: dispatch.id, session })
    return { answer, made, identities }
  }

  it.each([
    ['pending', { kind: 'pending', returnedFrom: null }, { kind: 'waiting' }],
    ['taken by a run', { kind: 'taken', run: RUN }, { kind: 'running' }],
    [
      'answered while the run goes on',
      { kind: 'answered', run: RUN, terminal: 'active' },
      { kind: 'running' },
    ],
    [
      'answered by a run that failed',
      { kind: 'answered', run: RUN, terminal: 'failed' },
      { kind: 'failed', detail: 'the run failed' },
    ],
    [
      'answered by a run that was cancelled',
      { kind: 'answered', run: RUN, terminal: 'cancelled' },
      { kind: 'cancelled', detail: 'the run was cancelled' },
    ],
    [
      'settled by a cancellation',
      { kind: 'settled', by: 'cancelled', run: RUN },
      { kind: 'cancelled', detail: 'settled by cancelled' },
    ],
    [
      'settled by the archive',
      { kind: 'settled', by: 'archived', run: null },
      { kind: 'cancelled', detail: 'settled by archived' },
    ],
    [
      'refused',
      { kind: 'refused', reason: 'too-large' },
      { kind: 'failed', detail: 'refused: too-large' },
    ],
  ] as const)('answers an input that is %s', async (_name, fate, expected) => {
    expect((await fateOf(fate as InputFate)).answer).toEqual({ kind: 'read', value: expected })
  })

  it('answers that the session has no such input', async () => {
    expect((await fateOf(failure('denied'))).answer).toEqual({
      kind: 'read',
      value: { kind: 'absent' },
    })
  })

  it.each([
    ['another failure', failure('unavailable')],
    ['a thrown read', new Error('down')],
  ])('is unavailable on %s', async (_name, answer) => {
    expect((await fateOf(answer)).answer).toEqual({ kind: 'unavailable' })
  })

  it('answers, once the session is quiet, with the text of the last assistant message of its latest run', async () => {
    const completed: InputFate = { kind: 'answered', run: RUN, terminal: 'completed' }
    const { answer, made } = await fateOf(completed, [
      page([ended('run_2')], 'c1'),
      page([said('first part', 'second part'), said('an earlier step'), entry('run.started', {})]),
    ])
    expect(answer).toEqual({
      kind: 'read',
      value: { kind: 'ended', reply: 'first part\nsecond part' },
    })
    expect(made('history')).toMatchObject([
      { kinds: ['message.assistant', 'run.started', 'run.terminal'], cursor: null },
      { cursor: 'c1' },
    ])
  })

  it.each([
    ['a run goes on', { run: { kind: 'active' } }],
    ['an input waits', { pending: ['input-1'] }],
    ['a call is in the background', { backgroundPlaceholders: ['consumption-1'] }],
  ] as const)(
    'answers that the work goes on while %s after its first run, and reads no history',
    async (_name, child) => {
      const completed: InputFate = { kind: 'answered', run: RUN, terminal: 'completed' }
      const { answer, made } = await fateOf(completed, [], child as Partial<WorkSnapshot>)
      expect(answer).toEqual({ kind: 'read', value: { kind: 'running' } })
      expect(made('history')).toEqual([])
    },
  )

  it.each([
    ['failed', { kind: 'failed', detail: 'the run failed' }],
    ['cancelled', { kind: 'cancelled', detail: 'the run was cancelled' }],
  ] as const)('answers by the latest run when it %s', async (outcome, expected) => {
    const completed: InputFate = { kind: 'answered', run: RUN, terminal: 'completed' }
    const { answer } = await fateOf(completed, [page([ended('run_2', outcome), said('x')])])
    expect(answer).toEqual({ kind: 'read', value: expected })
  })

  it('answers that the session is not there, and is unavailable when its work cannot be read', async () => {
    const completed: InputFate = { kind: 'answered', run: RUN, terminal: 'completed' }
    const { sessions, script } = world()
    const dispatch = dispatchOf()
    const identities = startOf(dispatch.id)
    script.fates.set(identities.input, { ok: completed })
    const session = identities.session as unknown as SessionRef
    script.works.set(identities.session, { kind: 'read', value: null })
    expect(await sessions.startFate(TENANT, { id: dispatch.id, session })).toEqual({
      kind: 'read',
      value: { kind: 'absent' },
    })
    script.works.set(identities.session, { kind: 'unavailable' })
    expect(await sessions.startFate(TENANT, { id: dispatch.id, session })).toEqual({
      kind: 'unavailable',
    })
  })

  it('answers a run that ended without a word with a text that says so', async () => {
    const completed: InputFate = { kind: 'answered', run: RUN, terminal: 'completed' }
    const silent = await fateOf(completed, [page([ended(RUN), entry('run.started', {})])])
    expect(silent.answer).toEqual({
      kind: 'read',
      value: { kind: 'ended', reply: 'The run ended without a final reply.' },
    })
  })

  it.each([
    ['the history cannot be read', [failure('unavailable')]],
    ['the end of the run is not in the history that can be read', [page([said('x')])]],
    [
      'the pages do not end within the bound',
      Array.from({ length: 9 }, () => page([said('x')], 'more')),
    ],
  ])('is unavailable when %s', async (_name, pages) => {
    const completed: InputFate = { kind: 'answered', run: RUN, terminal: 'completed' }
    expect((await fateOf(completed, pages)).answer).toEqual({ kind: 'unavailable' })
  })
})

describe('sending an input of a dispatch', () => {
  const report = (text = 'done') =>
    ({
      to: PARENT,
      input: reportInputOf(dispatchOf().id),
      source: 'dispatch.report',
      text,
      from: { session: PEER, agent: 'helper' },
    }) as const

  it('sends a report as a system reminder under the identity derived from the dispatch', async () => {
    const { sessions, made } = world()
    expect(await sessions.send(TENANT, report())).toEqual({ kind: 'sent' })
    const identities = sourceRequestIdentities({
      tenant: LEGAL_TENANT,
      source: DISPATCH_SOURCES.report,
      request: report().input,
      session: PARENT as never,
    })
    expect(made('accept')).toMatchObject([
      {
        tenant: LEGAL_TENANT,
        session: PARENT,
        operation: identities.accept,
        value: {
          kind: 'ordinary',
          input: identities.input,
          source: 'dispatch.report',
          message: { role: 'system_reminder' },
        },
      },
    ])
    const text = JSON.stringify(made('accept'))
    for (const part of ['done', PEER, 'helper']) expect(text).toContain(part)
  })

  it('sends a message with the session of the sender, its definition and what it is to the receiver', async () => {
    const { sessions, script, made } = world()
    script.works.set(PEER, {
      kind: 'read',
      value: work(PEER, {
        relation: { kind: 'child', parent: PARENT as never, basis: {} as never },
        tree: { root: PARENT as never, depth: 1 },
      }),
    })
    const message = { ...report('hello'), source: 'dispatch.message', input: 'message/1' } as const
    expect(await sessions.send(TENANT, message)).toEqual({ kind: 'sent' })
    const text = JSON.stringify(made('accept'))
    for (const part of ['hello', PEER, 'helper', 'child', 'dispatch.message'])
      expect(text).toContain(part)
  })

  it.each([
    ['an archived session', failure('archived'), { kind: 'refused', reason: 'archived' }],
    ['a frozen session', failure('frozen'), { kind: 'refused', reason: 'archived' }],
    [
      'a session the tenant does not have',
      failure('denied'),
      { kind: 'refused', reason: 'no-such-session' },
    ],
    [
      'a session that is not found',
      failure('not-found'),
      { kind: 'refused', reason: 'no-such-session' },
    ],
    ['a commit of unknown result', failure('commit-unknown'), { kind: 'unknown' }],
    ['a full queue', failure('limited'), { kind: 'unknown' }],
    ['a call of unknown result', 'unknown', { kind: 'unknown' }],
    ['a thrown call', new Error('down'), { kind: 'unknown' }],
  ] as const)('answers %s as it is', async (_name, answer, expected) => {
    const { sessions, script } = world()
    script.accept = answer as never
    expect(await sessions.send(TENANT, report())).toEqual(expected)
  })

  it('says whether the session has the input, by the identity the send would use', async () => {
    const { sessions, script, made } = world()
    const identities = sourceRequestIdentities({
      tenant: LEGAL_TENANT,
      source: DISPATCH_SOURCES.report,
      request: report().input,
      session: PARENT as never,
    })
    expect(await sessions.has(TENANT, PARENT, report().input)).toEqual({
      kind: 'read',
      value: false,
    })
    script.fates.set(identities.input, { ok: { kind: 'pending', returnedFrom: null } })
    expect(await sessions.has(TENANT, PARENT, report().input)).toEqual({
      kind: 'read',
      value: true,
    })
    script.fates.set(identities.input, failure('unavailable'))
    expect(await sessions.has(TENANT, PARENT, report().input)).toEqual({ kind: 'unavailable' })
    expect(made('fate')).toHaveLength(3)
  })
})

describe('stopping the run the starting input started', () => {
  const stop = async (fate: InputFate | { failure: SessionFailure }, cancel?: unknown) => {
    const { sessions, script, made } = world()
    const dispatch = dispatchOf()
    const identities = startOf(dispatch.id)
    script.fates.set(identities.input, 'failure' in fate ? fate : { ok: fate })
    if (cancel !== undefined) script.cancel = cancel as never
    const session = identities.session as unknown as SessionRef
    const answer = await sessions.cancelStart(TENANT, { id: dispatch.id, session })
    return { answer, made, identities }
  }

  it('asks Session to cancel the run that took the input, under one operation identity', async () => {
    const first = await stop({ kind: 'taken', run: RUN })
    expect(first.answer).toBe('requested')
    const [call] = first.made('cancelRun') as [{ operation: string; run: string; session: string }]
    expect(call).toMatchObject({
      tenant: LEGAL_TENANT,
      session: first.identities.session,
      run: RUN,
    })
    const again = await stop({ kind: 'answered', run: RUN, terminal: 'active' })
    expect((again.made('cancelRun') as [{ operation: string }])[0].operation).toBe(call.operation)
    expect(call.operation).toMatch(/^sop_[0-9a-f]{64}$/u)
  })

  it.each([
    ['the run ended', { kind: 'answered', run: RUN, terminal: 'cancelled' }],
    ['the run completed', { kind: 'answered', run: RUN, terminal: 'completed' }],
    ['the input was settled', { kind: 'settled', by: 'cancelled', run: RUN }],
    ['the input was refused', { kind: 'refused', reason: 'x' }],
    ['the session has no such input', failure('denied')],
  ] as const)('answers stopped, and cancels nothing, when %s', async (_name, fate) => {
    const { answer, made } = await stop(fate as InputFate)
    expect(answer).toBe('stopped')
    expect(made('cancelRun')).toEqual([])
  })

  it('answers requested while the input waits for a run, and cancels nothing yet', async () => {
    const { answer, made } = await stop({ kind: 'pending', returnedFrom: null })
    expect(answer).toBe('requested')
    expect(made('cancelRun')).toEqual([])
  })

  it.each([
    ['the cancellation has no known result', failure('commit-unknown')],
    ['the cancellation was refused', failure('denied')],
  ])('answers unknown when %s', async (_name, cancel) => {
    expect((await stop({ kind: 'taken', run: RUN }, cancel)).answer).toBe('unknown')
  })

  it('answers unknown when the fate cannot be read', async () => {
    expect((await stop(failure('unavailable'))).answer).toBe('unknown')
  })
})
