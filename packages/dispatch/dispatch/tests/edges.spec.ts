import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Dispatch } from '@omne-harness/dispatch-contract'
import {
  createDispatching,
  dispatchIdOf,
  isUnfinished,
  reportInputOf,
  type AuthorityAction,
} from '@omne-harness/dispatch'
import {
  createMemoryDispatchStore,
  fakeAuthority,
  fakeClock,
  fakeCopies,
  fakeDefinitions,
  fakeSessions,
  fakeWaits,
  sessionNamed,
} from '@omne-harness/dispatch/testing'
import { PARENT, TENANT, started, valueOf, world, type World } from './world.ts'

const ASK = {
  mode: 'delegate',
  agent: 'helper',
  instruction: 'look into it',
  call: 'call-1',
} as const
const refused = (reason: string) => ({ kind: 'refused', reason })
const UNAVAILABLE = { kind: 'basis-unavailable' }
const other = sessionNamed('other')
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const only = (w: World): Dispatch => {
  const [row] = w.store.rows(TENANT)
  if (row === undefined) throw new Error('no dispatch is registered')
  return row
}

type Run = (w: World, dispatch: Dispatch) => Promise<unknown>
const OPERATIONS: readonly (readonly [string, AuthorityAction, Run])[] = [
  ['a withdrawal', 'withdraw', (w, d) => w.registry.withdraw(w.ctx(), d.id)],
  ['a report', 'report', (w, d) => w.registry.report(w.ctx(d.session), 'done')],
  ['reading one dispatch', 'read', (w, d) => w.registry.show(w.ctx(), d.id)],
  ['a list', 'read', w => w.registry.list(w.ctx(), { by: { dispatcher: PARENT } })],
  [
    'a message',
    'message',
    (w, d) => w.registry.message(w.ctx(), { to: d.session, text: 'hi', id: 'm1' }),
  ],
]

describe('every operation asks the authority under its own action', () => {
  it.each(OPERATIONS)(
    '%s is refused or has no basis as the authority answers',
    async (_name, action, run) => {
      const w = world()
      const dispatch = await started(w)
      w.authority.answer(action, 'denied')
      expect(await run(w, dispatch)).toEqual(refused('not-permitted'))
      w.authority.answer(action, 'unavailable')
      expect(await run(w, dispatch)).toEqual(UNAVAILABLE)
      expect(only(w)).toMatchObject({ state: 'started', report: null })
      expect(w.sessions.sent).toEqual([])
    },
  )

  it('refuses a report and a message that do not parse, before the authority is asked', async () => {
    const w = world()
    const dispatch = await started(w)
    const before = w.authority.asked.length
    expect(await w.registry.report(w.ctx(dispatch.session), '')).toEqual(refused('invalid-request'))
    expect(await w.registry.message(w.ctx(), { to: dispatch.session, text: '', id: 'm1' })).toEqual(
      refused('invalid-request'),
    )
    expect(w.authority.asked).toHaveLength(before)
    expect(only(w).report).toBeNull()
  })
})

describe('a request while a fact cannot be read, or holds no longer', () => {
  it('registers nothing while the registry cannot be read', async () => {
    const w = world()
    w.store.readable(false)
    expect(await w.registry.dispatch(w.ctx(), ASK)).toEqual(UNAVAILABLE)
    expect(w.store.rows(TENANT)).toEqual([])
  })

  it('registers nothing while the dispatching session cannot be read', async () => {
    const w = world()
    w.sessions.readable(false, 'rows')
    expect(await w.registry.dispatch(w.ctx(), ASK)).toEqual(UNAVAILABLE)
    expect(w.store.rows(TENANT)).toEqual([])
  })

  it('registers nothing while the count of the open dispatches cannot be read', async () => {
    const w = world()
    Object.assign(w.store, { openOf: async () => ({ kind: 'unavailable' }) })
    expect(await w.registry.dispatch(w.ctx(), ASK)).toEqual(UNAVAILABLE)
    expect(w.store.rows(TENANT)).toEqual([])
  })

  it('refuses a request of a session that is not there, as of an archived one', async () => {
    const w = world()
    expect(await w.registry.dispatch(w.ctx(sessionNamed('ghost')), ASK)).toEqual(
      refused('dispatcher-archived'),
    )
  })

  it('recalls a registered dispatch without judging it again', async () => {
    const w = world()
    const dispatch = await started(w)
    w.definitions.readable(false)
    w.sessions.archive(TENANT, PARENT)
    expect(await w.registry.dispatch(w.ctx(), ASK)).toMatchObject({
      kind: 'done',
      recalled: true,
      value: { id: dispatch.id },
    })
  })

  it('has no basis when the acceptance is rolled back, and registers nothing', async () => {
    const w = world()
    w.store.failNext('rolled-back')
    expect(await w.registry.dispatch(w.ctx(), ASK)).toEqual(UNAVAILABLE)
    expect(w.store.rows(TENANT)).toEqual([])
  })

  it('is refused by the registry when another request took the last place first', async () => {
    const w = world(1)
    await started(w, 'call-1')
    Object.assign(w.store, { openOf: async () => ({ kind: 'read', value: 0 }) })
    expect(await w.registry.dispatch(w.ctx(), { ...ASK, call: 'call-2' })).toEqual(
      refused('too-many-open'),
    )
    expect(w.store.rows(TENANT)).toHaveLength(1)
  })
})

describe('an outcome whose commit fails or has no known result', () => {
  it.each([
    ['a withdrawal', (w: World, d: Dispatch) => w.registry.withdraw(w.ctx(), d.id)],
    ['a report', (w: World, d: Dispatch) => w.registry.report(w.ctx(d.session), 'done')],
  ] as const)('%s is unknown, then recalled; rolled back, it has no basis', async (_name, run) => {
    const w = world()
    const dispatch = await started(w)
    w.store.failNext('rolled-back')
    expect(await run(w, dispatch)).toEqual(UNAVAILABLE)
    expect(only(w).state).toBe('started')
    w.store.failNext('unknown-after-commit')
    expect(await run(w, dispatch)).toEqual({ kind: 'unknown' })
    expect(await run(w, dispatch)).toMatchObject({ kind: 'done', recalled: true })
  })

  it('says of a first report, a read, a list and a message that they are not recalled', async () => {
    const w = world()
    const dispatch = await started(w)
    const reported = await w.registry.report(w.ctx(dispatch.session), 'done')
    expect(reported).toMatchObject({ kind: 'done', recalled: false })
    const row = only(w)
    expect(await w.registry.show(w.ctx(), dispatch.id)).toEqual({
      kind: 'done',
      value: row,
      recalled: false,
    })
    expect(await w.registry.list(w.ctx(), { by: { dispatcher: PARENT } })).toEqual({
      kind: 'done',
      value: [row],
      recalled: false,
    })
    const input = `message/${sha(JSON.stringify(['message', PARENT, 'm1']))}`
    expect(
      await w.registry.message(w.ctx(), { to: dispatch.session, text: 'hi', id: 'm1' }),
    ).toEqual({ kind: 'done', value: { to: dispatch.session, input }, recalled: false })
    expect(w.sessions.sent.map(item => item.input)).toEqual([input])
    expect(reportInputOf(dispatch.id)).toBe(`report/${dispatch.id}`)
  })

  it('has no basis for a withdrawal or a list while the registry cannot be read', async () => {
    const w = world()
    const dispatch = await started(w)
    w.store.readable(false)
    expect(await w.registry.withdraw(w.ctx(), dispatch.id)).toEqual(UNAVAILABLE)
    expect(await w.registry.list(w.ctx(), { by: { dispatcher: PARENT } })).toEqual(UNAVAILABLE)
  })
})

describe('a message while its sessions cannot be read, or is not taken', () => {
  it('has no basis while the sessions cannot be read, and sends nothing', async () => {
    const w = world()
    w.sessions.seat(TENANT, { session: other })
    w.sessions.readable(false, 'rows')
    expect(await w.registry.message(w.ctx(), { to: other, text: 'hi', id: 'm1' })).toEqual(
      UNAVAILABLE,
    )
    expect(w.sessions.sent).toEqual([])
  })

  it('answers the refusal of the session that would not take it', async () => {
    const w = world()
    w.sessions.seat(TENANT, { session: other })
    w.sessions.sendNext('refused')
    expect(await w.registry.message(w.ctx(), { to: other, text: 'hi', id: 'm1' })).toEqual(
      refused('archived'),
    )
  })

  it('names no definition for a sender whose session is not there', async () => {
    const w = world()
    w.sessions.seat(TENANT, { session: other })
    const ghost = sessionNamed('ghost')
    await w.registry.message(w.ctx(ghost), { to: other, text: 'hi', id: 'm1' })
    expect(w.sessions.sent.map(item => item.from)).toEqual([{ session: ghost, agent: null }])
  })
})

describe('the steps after a change', () => {
  const parts = () => {
    const store = createMemoryDispatchStore()
    const sessions = fakeSessions()
    sessions.seat(TENANT, { session: PARENT })
    const deps = {
      authority: fakeAuthority(),
      store,
      sessions,
      waits: fakeWaits(),
      copies: fakeCopies(),
      definitions: fakeDefinitions(),
      clock: fakeClock(),
      limits: { maxOpen: 4 },
    }
    const ctx = { tenant: TENANT, subject: { verified: PARENT }, session: PARENT, asking: null }
    return { store, deps, ctx }
  }

  it('needs nobody to wake', async () => {
    const { deps, ctx } = parts()
    expect(valueOf(await createDispatching(deps).dispatch(ctx, ASK)).state).toBe('started')
  })

  it('answers the dispatch as it was registered when it cannot be read after its steps', async () => {
    const { store, deps, ctx } = parts()
    const registry = createDispatching({ ...deps, hints: { wake: () => store.readable(false) } })
    expect(await registry.dispatch(ctx, ASK)).toMatchObject({
      kind: 'done',
      recalled: false,
      value: { id: dispatchIdOf(TENANT, PARENT, 'call-1'), state: 'accepted' },
    })
  })

  it('takes back the open dispatches of a dispatcher it is told is archived, before the session says so', async () => {
    const w = world()
    await started(w)
    expect(await w.registry.dispatcherArchived(TENANT, PARENT)).toBe('done')
    expect(only(w).state).toBe('withdrawn')
  })

  it('takes no step, and does not fail, while the run goes on or only the dispatcher cannot be read', async () => {
    const w = world()
    const dispatch = await started(w)
    await expect(w.registry.advance(TENANT, dispatch.id)).resolves.toBeUndefined()
    w.sessions.fate(dispatch.session, { kind: 'failed', detail: 'the model refused' })
    w.sessions.readable(false, 'rows')
    await expect(w.registry.advance(TENANT, dispatch.id)).resolves.toBeUndefined()
    expect(only(w).state).toBe('started')
  })

  it('has no step left for a handoff that is handed over', async () => {
    const w = world()
    const handoff = valueOf(
      await w.registry.dispatch(w.ctx(), { ...ASK, mode: 'handoff', agent: 'coding' }),
    )
    expect(isUnfinished(handoff)).toBe(false)
    expect(await w.registry.reconcile(TENANT)).toBe('done')
  })
})
