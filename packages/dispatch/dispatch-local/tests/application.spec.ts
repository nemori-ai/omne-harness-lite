// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { afterEach, describe, expect, it } from 'vitest'
import type { Dispatch } from '@omne-harness/dispatch-contract'
import { DispatchPolicyError } from '@omne-harness/dispatch-local'
import { ASK, PARENT, T1, ctx, fakePorts, openApplication, policy, settled } from './fixture.ts'
import { openSqlWorld, type SqlWorld } from './storage/world.ts'

const worlds: SqlWorld[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
async function world(): Promise<SqlWorld> {
  const opened = await openSqlWorld()
  worlds.push(opened)
  return opened
}

function done(
  outcome: Awaited<
    ReturnType<
      Awaited<ReturnType<typeof openApplication>>['application']['dispatching']['dispatch']
    >
  >,
): Dispatch {
  if (outcome.kind !== 'done') throw new Error(JSON.stringify(outcome))
  return outcome.value
}

const stored = async (sql: SqlWorld, id: Dispatch['id']) => {
  const read = await sql.store.dispatch(T1, id)
  if (read.kind !== 'read' || read.value === null) throw new Error('the dispatch is not stored')
  return read.value
}

describe('the registry is in the storage of the tenant, and reconciliation goes on after a rebuild', () => {
  it('takes up, at its start, each of the four kinds of dispatch a stopped process left unfinished', async () => {
    const sql = await world()
    const ports = fakePorts()
    const first = await openApplication(sql, ports)
    const { dispatching } = first.application

    ports.sessions.createNext('unknown')
    const accepted = done(await dispatching.dispatch(ctx(), ASK))
    const started = done(await dispatching.dispatch(ctx(), { ...ASK, call: 'call-2' }))
    const reported = done(await dispatching.dispatch(ctx(), { ...ASK, call: 'call-3' }))
    ports.waits.unreadable(true)
    await dispatching.report(ctx(reported.session), 'the report')
    const withdrawn = done(await dispatching.dispatch(ctx(), { ...ASK, call: 'call-4' }))
    ports.sessions.cancelAnswers('requested')
    await dispatching.withdraw(ctx(), withdrawn.id)
    expect([
      (await stored(sql, accepted.id)).state,
      (await stored(sql, started.id)).state,
      (await stored(sql, reported.id)).delivery,
      (await stored(sql, withdrawn.id)).stop,
    ]).toEqual(['accepted', 'started', { kind: 'pending' }, 'requested'])
    await first.application.close()

    ports.waits.unreadable(false)
    ports.sessions.cancelAnswers('stopped')
    ports.sessions.fate(started.session, { kind: 'ended', reply: 'all done' })
    const second = await openApplication(sql, ports)
    expect(await stored(sql, accepted.id)).toMatchObject({ state: 'started' })
    expect(await stored(sql, started.id)).toMatchObject({
      state: 'reported',
      report: { text: 'all done', origin: 'final-reply' },
      delivery: { kind: 'delivered', to: 'result' },
    })
    expect(await stored(sql, reported.id)).toMatchObject({
      delivery: { kind: 'delivered', to: 'result' },
    })
    expect(await stored(sql, withdrawn.id)).toMatchObject({
      state: 'withdrawn',
      stop: 'confirmed',
      delivery: { kind: 'delivered', to: 'result' },
    })
    expect(ports.sessions.created.map(item => item.creation.session)).toEqual([
      started.session,
      reported.session,
      withdrawn.session,
      accepted.session,
    ])
    await second.application.close()
  })

  it('scans nothing while the tenants are not known, and scans on its interval afterwards', async () => {
    const sql = await world()
    const ports = fakePorts()
    const seed = await openApplication(sql, ports)
    ports.sessions.createNext('unknown')
    const accepted = done(await seed.application.dispatching.dispatch(ctx(), ASK))
    await seed.application.close()

    let known = false
    const { application, manual } = await openApplication(sql, ports, {
      sql: {
        storage: sql.storage,
        bind: tenant => sql.bind(tenant),
        tenants: async () => (known ? [T1] : null),
      },
    })
    expect((await stored(sql, accepted.id)).state).toBe('accepted')
    expect(manual.delays()).toEqual([60_000])
    known = true
    expect(manual.fire(60_000)).toBe(1)
    await settled()
    expect((await stored(sql, accepted.id)).state).toBe('started')
    expect(manual.delays()).toEqual([60_000])
    await application.close()
  })

  it('answers a change with one pass for its tenant, however many wake-ups came', async () => {
    const sql = await world()
    const ports = fakePorts()
    const { application, manual } = await openApplication(sql, ports)
    const first = done(await application.dispatching.dispatch(ctx(), ASK))
    done(await application.dispatching.dispatch(ctx(), { ...ASK, call: 'call-2' }))
    expect(manual.delays()).toEqual([0, 60_000])
    ports.sessions.fate(first.session, { kind: 'ended', reply: 'all done' })
    expect(manual.fire(0)).toBe(1)
    await settled()
    expect((await stored(sql, first.id)).state).toBe('reported')
    await application.close()
  })
})

describe('the lifecycle of the provider', () => {
  it('refuses to load with a policy that is missing a value', async () => {
    const sql = await world()
    await expect(
      openApplication(sql, fakePorts(), { policy: { maxOpen: 4 } }),
    ).rejects.toBeInstanceOf(DispatchPolicyError)
  })

  it('takes the limit of open dispatches from its policy', async () => {
    const sql = await world()
    const { application } = await openApplication(sql, fakePorts(), {
      policy: policy({ maxOpen: 1 }),
    })
    done(await application.dispatching.dispatch(ctx(), ASK))
    expect(await application.dispatching.dispatch(ctx(), { ...ASK, call: 'call-2' })).toEqual({
      kind: 'refused',
      reason: 'too-many-open',
    })
    await application.close()
  })

  it('when it is unloaded: admits nothing new, cancels no dispatch, archives no session, and keeps the registry', async () => {
    const sql = await world()
    const ports = fakePorts()
    const { application, manual } = await openApplication(sql, ports)
    const dispatch = done(await application.dispatching.dispatch(ctx(), ASK))
    await application.close()
    await application.close()

    expect(await application.dispatching.dispatch(ctx(), { ...ASK, call: 'call-2' })).toEqual({
      kind: 'basis-unavailable',
    })
    expect(await application.dispatching.show(ctx(), dispatch.id)).toEqual({
      kind: 'basis-unavailable',
    })
    expect(
      await application.dispatching.message(ctx(), { to: PARENT, text: 'hi', id: 'm' }),
    ).toEqual({ kind: 'basis-unavailable' })
    expect(await application.reconciling.reconcile(T1)).toBe('unavailable')
    expect(await application.reconciling.dispatcherArchived(T1, PARENT)).toBe('unavailable')
    await expect(application.reconciling.advance(T1, dispatch.id)).resolves.toBeUndefined()
    expect(manual.delays().includes(60_000)).toBe(false)
    expect(manual.fire(0)).toBeLessThanOrEqual(1)
    await settled()

    expect(ports.sessions.cancelled).toEqual([])
    expect(await stored(sql, dispatch.id)).toMatchObject({ state: 'started' })
    expect(ports.sessions.created).toHaveLength(1)
  })

  it('lets an operation in flight end before the unload is over', async () => {
    const sql = await world()
    const ports = fakePorts()
    const { application } = await openApplication(sql, ports)
    const flying = application.dispatching.dispatch(ctx(), ASK)
    const closing = application.close()
    const [outcome] = await Promise.all([flying, closing])
    expect(outcome).toMatchObject({ kind: 'done', value: { state: 'started' } })
  })
})
