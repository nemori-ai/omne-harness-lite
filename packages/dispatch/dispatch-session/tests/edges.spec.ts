import { describe, expect, it } from 'vitest'
import { reportInputOf } from '@omne-harness/dispatch'
import type { SessionRef } from '@omne-harness/dispatch-contract'
import {
  sourceRequestIdentities,
  type HistoryPage,
  type RunId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { DISPATCH_SOURCES } from '../src/index.ts'
import { lastReplyOf } from '../src/reply.ts'
import {
  LEGAL_TENANT,
  OTHER_TENANT,
  PARENT,
  PEER,
  TENANT,
  dispatchOf,
  work,
  world,
} from './world.ts'

const RUN = 'run_1' as RunId
const SILENT = { kind: 'read', value: 'The run ended without a final reply.' }
const str = (value: string) => ({ kind: 'string', value })
const obj = (members: Record<string, unknown>) => ({
  kind: 'object',
  entries: Object.entries(members).map(([key, value]) => ({ key, value })),
})
const arr = (...items: unknown[]) => ({ kind: 'array', items })
const entry = (kind: string, payload: unknown) => ({ id: `e-${kind}`, kind, payload })
const ended = (run: string = RUN) =>
  entry('run.terminal', obj({ terminal: obj({ run: str(run) }) }))
const said = (...blocks: unknown[]) =>
  entry('message.assistant', obj({ message: obj({ blocks: arr(...blocks) }) }))
const text = (value: string) => obj({ kind: str('text'), text: str(value) })
const page = (entries: unknown[], next: string | null = null): { ok: HistoryPage } =>
  ({ ok: { entries, next, exhausted: next === null } }) as never

function reading(pages: readonly (unknown | Error)[]) {
  const asked: (string | null)[] = []
  const left = [...pages]
  const read = async (cursor: string | null) => {
    asked.push(cursor)
    const next = left.shift()
    if (next instanceof Error) throw next
    return (next ?? 'unknown') as never
  }
  return { asked, reply: () => lastReplyOf(read, RUN) }
}

describe('the last reply of a run, read back from the end of the history', () => {
  it('takes the text blocks of the first assistant message after the end of the run, and no other block', async () => {
    const tool = obj({ kind: str('tool_use'), text: str('not said') })
    const { reply } = reading([page([ended(), said(text('one'), tool, text('two'))])])
    expect(await reply()).toEqual({ kind: 'read', value: 'one\ntwo' })
  })

  it('passes over what is neither a reply nor a start of the run', async () => {
    const note = entry('message.user', obj({}))
    const { reply } = reading([page([ended(), note, ended('run_0'), said(text('mine'))])])
    expect(await reply()).toEqual({ kind: 'read', value: 'mine' })
  })

  it('does not take an entry of another kind, or the end of another run, for the end of this run', async () => {
    const lookalike = entry('message.user', obj({ terminal: obj({ run: str(RUN) }) }))
    const { reply } = reading([page([lookalike, ended('run_2'), said(text('not mine'))])])
    expect(await reply()).toEqual({ kind: 'unavailable' })
  })

  it.each([
    ['a payload that is no object', entry('message.assistant', str('x'))],
    ['a message without blocks', entry('message.assistant', obj({ message: obj({}) }))],
    [
      'blocks that are no list',
      entry('message.assistant', obj({ message: obj({ blocks: str('x') }) })),
    ],
    ['a text block without its text', said(obj({ kind: str('text') }))],
    ['a block whose kind is no text', said(obj({ kind: arr(), text: str('x') }), str('x'))],
  ])('answers that the run ended without a reply for %s', async (_name, message) => {
    expect(await reading([page([ended(), message])]).reply()).toEqual(SILENT)
  })

  it('reads on by the cursor of each page, and stops where the history ends', async () => {
    const found = reading([page([ended()], 'c1'), page([], 'c2'), page([said(text('late'))])])
    expect(await found.reply()).toEqual({ kind: 'read', value: 'late' })
    expect(found.asked).toEqual([null, 'c1', 'c2'])
    const short = reading([page([ended()]), page([said(text('never read'))])])
    expect(await short.reply()).toEqual({ kind: 'unavailable' })
    expect(short.asked).toEqual([null])
  })

  it('reads eight pages at most', async () => {
    const pages = Array.from({ length: 8 }, (_, index) => page([], `c${String(index + 1)}`))
    const { asked, reply } = reading([
      page([ended()], 'c0'),
      ...pages.slice(1),
      page([said(text('ninth'))]),
    ])
    expect(await reply()).toEqual({ kind: 'unavailable' })
    expect(asked).toHaveLength(8)
  })

  it.each([
    ['is thrown', new Error('down')],
    ['has no known result', 'unknown'],
    ['fails', { failure: { kind: 'unavailable' } }],
  ])('is unavailable when a read %s', async (_name, answer) => {
    expect(await reading([page([ended()], 'c1'), answer]).reply()).toEqual({ kind: 'unavailable' })
  })
})

describe('a tenant text that is no tenant', () => {
  it('asks Session nothing, and answers as for a session the tenant does not have', async () => {
    const { sessions, calls } = world()
    const dispatch = dispatchOf()
    const started = { id: dispatch.id, session: PEER }
    expect(await sessions.startFate(OTHER_TENANT, started)).toEqual({
      kind: 'read',
      value: { kind: 'absent' },
    })
    expect(await sessions.has(OTHER_TENANT, PARENT, 'report/1')).toEqual({
      kind: 'read',
      value: false,
    })
    expect(await sessions.cancelStart(OTHER_TENANT, started)).toBe('stopped')
    expect(
      await sessions.create(OTHER_TENANT, { session: PEER, dispatch, permission: 'never' }),
    ).toEqual({ kind: 'failed', detail: 'not-a-tenant' })
    const input = { to: PARENT, input: 'm/1', source: 'dispatch.message', text: 'x' } as const
    expect(
      await sessions.send(OTHER_TENANT, { ...input, from: { session: PEER, agent: null } }),
    ).toEqual({ kind: 'refused', reason: 'no-such-session' })
    expect(calls).toEqual([])
  })
})

describe('a call to Session whose result is not known', () => {
  const identitiesOf = (source: 'instruction' | 'report', request: string, session?: string) =>
    sourceRequestIdentities({
      tenant: LEGAL_TENANT,
      source: DISPATCH_SOURCES[source],
      request,
      ...(session === undefined ? {} : { session: session as never }),
    })

  it.each([
    ['is thrown', new Error('down')],
    ['answers unknown', 'unknown'],
  ])('leaves the input unread when the read of its fate %s', async (_name, answer) => {
    const { sessions, script } = world()
    const input = reportInputOf(dispatchOf().id)
    script.fates.set(identitiesOf('report', input, PARENT).input, answer as never)
    expect(await sessions.has(TENANT, PARENT, input)).toEqual({ kind: 'unavailable' })
  })

  it.each([
    ['is thrown', new Error('down')],
    ['answers unknown', 'unknown'],
  ])(
    'leaves the stop unknown when the read of the fate %s, and when the cancellation does',
    async (_name, answer) => {
      const dispatch = dispatchOf()
      const identities = identitiesOf('instruction', dispatch.id)
      const started = { id: dispatch.id, session: identities.session as unknown as SessionRef }
      const unread = world()
      unread.script.fates.set(identities.input, answer as never)
      expect(await unread.sessions.cancelStart(TENANT, started)).toBe('unknown')
      expect(unread.made('cancelRun')).toEqual([])
      const unstopped = world()
      unstopped.script.fates.set(identities.input, { ok: { kind: 'taken', run: RUN } })
      unstopped.script.cancel = answer as never
      expect(await unstopped.sessions.cancelStart(TENANT, started)).toBe('unknown')
      expect(unstopped.made('cancelRun')).toHaveLength(1)
    },
  )

  it('is unavailable for the row of a session when the read of the session or of its modes is thrown', async () => {
    const broken = world()
    Object.assign(broken.port, { work: () => Promise.reject(new Error('down')) })
    expect(await broken.sessions.row(TENANT, PARENT)).toEqual({ kind: 'unavailable' })
    const modeless = world()
    Object.assign(modeless.port, { modes: () => Promise.reject(new Error('down')) })
    expect(await modeless.sessions.row(TENANT, PARENT)).toEqual({ kind: 'unavailable' })
    expect(modeless.made('work')).toEqual([{ tenant: LEGAL_TENANT, session: PARENT }])
  })
})

describe('what the sending session is to the receiving one, in a message', () => {
  const child = (session: string, parent: string): WorkSnapshot =>
    work(session, {
      relation: { kind: 'child', parent: parent as never, basis: {} as never },
      tree: { root: parent as never, depth: 1 },
    })
  const handed = (session: string, origin: string): WorkSnapshot =>
    work(session, { relation: { kind: 'handoff', origin: origin as never, basis: {} as never } })
  const relationIn = async (snapshots: readonly (WorkSnapshot | null | 'unreadable')[]) => {
    const { sessions, script, made } = world()
    const [sender, receiver] = snapshots
    for (const [session, snapshot] of [
      [PEER, sender],
      [PARENT, receiver],
    ] as const)
      script.works.set(
        session,
        snapshot === 'unreadable'
          ? { kind: 'unavailable' }
          : { kind: 'read', value: snapshot ?? null },
      )
    const input = { to: PARENT, input: 'm/1', source: 'dispatch.message', text: 'x' } as const
    await sessions.send(TENANT, { ...input, from: { session: PEER, agent: 'helper' } })
    const sent = JSON.stringify(made('accept'))
    return /What that session is to yours: ([a-z-]+)/u.exec(sent)?.[1]
  }

  it.each([
    ['its child', [child(PEER, PARENT), work(PARENT)], 'child'],
    ['its parent', [work(PEER), child(PARENT, PEER)], 'parent'],
    ['a session it handed work to', [handed(PEER, PARENT), work(PARENT)], 'handed-off'],
    ['the session it was handed work from', [work(PEER), handed(PARENT, PEER)], 'handed-from'],
    ['unrelated', [work(PEER), work(PARENT)], 'unrelated'],
  ] as const)('says %s', async (_name, snapshots, relation) => {
    expect(await relationIn(snapshots)).toBe(relation)
  })

  it.each([
    ['the sender cannot be read', ['unreadable', work(PARENT)]],
    ['the receiver cannot be read', [work(PEER), 'unreadable']],
    ['the sender is not there', [null, work(PARENT)]],
    ['the receiver is not there', [work(PEER), null]],
  ] as const)('says unknown when %s', async (_name, snapshots) => {
    expect(await relationIn(snapshots)).toBe('unknown')
  })
})

describe('the session a dispatch creates', () => {
  const created = async (mode: 'delegate' | 'handoff', dispatcher: WorkSnapshot | null) => {
    const { sessions, script, made } = world()
    script.works.set(PARENT, { kind: 'read', value: dispatcher })
    const dispatch = dispatchOf({ mode })
    await sessions.create(TENANT, { session: PEER, dispatch, permission: 'never' })
    const [call] = made('create') as [
      { creation: { workspace: unknown; standing: { relation: unknown } } },
    ]
    return { dispatch, creation: call.creation }
  }

  it.each(['delegate', 'handoff'] as const)(
    'names the dispatch as the basis of the relation of a %s',
    async mode => {
      const { dispatch, creation } = await created(mode, work(PARENT))
      expect(creation.standing.relation).toMatchObject({
        basis: {
          owner: '@omne-harness/dispatch-session',
          record: `dispatch/${dispatch.id}`,
          revision: '1',
          digest: `sha256:${dispatch.id.slice('dsp_'.length)}`,
        },
      })
    },
  )

  it('creates without a workspace when the dispatching session is not there to give one', async () => {
    expect((await created('delegate', null)).creation.workspace).toBeNull()
  })
})
