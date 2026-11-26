// @module-tag slow
// Opens a real SQLite storage with its worker threads.
import { afterEach, describe, expect, it } from 'vitest'
import { createGoalLocalApplication, GoalPolicyError } from '@omne-harness/goal-local'
import {
  fakePorts,
  openApplication,
  optionsOf,
  OWNER,
  SESSION,
  SET,
  settled,
  T1,
} from './fixture.ts'
import { openSqlWorld, type SqlWorld } from './storage/world.ts'

describe('the local provider', () => {
  const open: SqlWorld[] = []
  const world = async () => {
    const opened = await openSqlWorld()
    open.push(opened)
    return opened
  }
  afterEach(async () => {
    await Promise.all(open.splice(0).map(entry => entry.close()))
  })

  it('refuses to load on a policy that is missing or invalid', async () => {
    const { options } = optionsOf(await world(), fakePorts(), { policy: {} })
    await expect(createGoalLocalApplication(options)).rejects.toBeInstanceOf(GoalPolicyError)
  })

  it('keeps a goal across a restart: the state is in the store, not in the running object', async () => {
    const sql = await world()
    const ports = fakePorts()
    const first = await openApplication(sql, ports)
    const set = await first.application.goals.write(OWNER, SET)
    expect(set).toMatchObject({ kind: 'done', value: { state: { status: 'active', revision: 1 } } })
    await first.application.close()
    const second = await openApplication(sql, ports)
    expect(await second.application.goals.read(OWNER, SESSION)).toMatchObject({
      kind: 'done',
      value: { state: { status: 'active', revision: 1 }, history: [{ operation: 'op-1' }] },
    })
    expect(await second.application.goals.write(OWNER, SET)).toMatchObject({ recalled: true })
    await second.application.close()
  })

  it('makes up a reminder nobody knows the fate of: on the wake-up, and on the scan at start', async () => {
    const sql = await world()
    const ports = fakePorts()
    const { woken } = ports.sessions
    ports.sessions.sendNext('unknown')
    const first = await openApplication(sql, ports)
    await first.application.goals.write(OWNER, SET)
    expect(await sql.store.owing(T1)).toMatchObject({ kind: 'read', value: [{ session: SESSION }] })
    first.manual.fire()
    await settled()
    expect(new Set(woken.map(wake => wake.request))).toEqual(new Set(['start/1/1']))
    expect(woken.length).toBeGreaterThan(1)
    expect(await sql.store.owing(T1)).toEqual({ kind: 'read', value: [] })

    await first.application.goals.command(OWNER, { session: SESSION, command: { kind: 'pause' } })
    ports.sessions.sendNext('unknown')
    await first.application.goals.command(OWNER, { session: SESSION, command: { kind: 'resume' } })
    await first.application.close()
    const sent = woken.length
    expect(await sql.store.owing(T1)).toMatchObject({
      kind: 'read',
      value: [{ wake: { kind: 'resume' } }],
    })
    const second = await openApplication(sql, ports)
    expect(woken).toHaveLength(sent + 1)
    expect(woken.at(-1)).toMatchObject({ kind: 'resume', session: SESSION })
    expect(await sql.store.owing(T1)).toEqual({ kind: 'read', value: [] })
    await second.application.close()
  })

  it('once closing began it admits nothing and settles no goal', async () => {
    const sql = await world()
    const { application, manual } = await openApplication(sql, fakePorts())
    await application.goals.write(OWNER, SET)
    await application.close()
    await application.close()
    expect(await application.goals.read(OWNER, SESSION)).toEqual({ kind: 'basis-unavailable' })
    await expect(application.reconciling.reconcile(T1)).resolves.toBeUndefined()
    manual.fire()
    expect(await sql.store.latest(T1, SESSION)).toMatchObject({
      kind: 'read',
      value: { state: { status: 'active' } },
    })
  })

  it('scans nothing while the tenants are not known', async () => {
    const sql = await world()
    const ports = fakePorts()
    const { options } = optionsOf(sql, ports)
    const application = await createGoalLocalApplication({
      ...options,
      sql: { ...options.sql, tenants: async () => null },
    })
    await expect(application.scan()).resolves.toBeUndefined()
    await application.close()
  })
})
