import { describe, expect, it } from 'vitest'
import type { SessionFailure, SessionId } from '@omne-harness/session-contract'
import { loginEntryOrigin, modeOperation } from '../src/derivation.ts'
import {
  DEFINITION,
  createWorld,
  fixtureLogin,
  loginIdentity,
  type World,
} from './fixtures/world.ts'

const signal = new AbortController().signal
const ops = (world: World) => world.contribution.operations
const as = <P>(principal: P) => ({ principal, messageId: 'm-1', signal })
const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')

async function created(world: World) {
  const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId: 'create-1',
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const read = (world: World, session: string, who = ALICE) =>
  ops(world)['read-permission-mode'](as(loginIdentity(who)), { tenant: who.tenant, session })
const change = (
  world: World,
  session: string,
  mode: 'never' | 'auto_permission' | 'bypass-permissions',
  expectedRevision = '0',
  who = ALICE,
) =>
  ops(world)['change-permission-mode'](as(loginIdentity(who)), {
    tenant: who.tenant,
    session,
    mode,
    expectedRevision,
  })
const changes = (world: World) =>
  world.session.controls.calls().filter(call => call.method === 'change')

describe('read-permission-mode', () => {
  it('answers the mode in force with its permission revision, read for the admitted session', async () => {
    const world = createWorld()
    const session = await created(world)
    world.modes.answer({ kind: 'read', mode: 'auto_permission', revision: '4' })
    expect(await read(world, session)).toEqual({
      outcome: 'succeeded',
      body: { mode: 'auto_permission', revision: '4' },
    })
    expect(world.modes.calls().at(-1)).toMatchObject({ tenant: ALICE.tenant, session })
  })

  it.each([
    ['answers unavailable', { kind: 'unavailable' } as const],
    ['throws', 'throw' as const],
  ])('is basis-unavailable when the reading %s', async (_label, script) => {
    const world = createWorld()
    const session = await created(world)
    world.modes.answer(script)
    expect(await read(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })

  it.each(['denied', 'basis-unavailable'] as const)(
    'a refusal of the login for the tenant (%s) is the answer, and nothing is read',
    async refusal => {
      const world = createWorld()
      const session = await created(world)
      world.refuseTargets(refusal)
      expect(await read(world, session)).toEqual({ outcome: refusal })
      expect(world.modes.calls()).toHaveLength(0)
    },
  )

  it('is basis-unavailable when the port is not there', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('permissionModes')
    expect(await read(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('change-permission-mode', () => {
  it('asks Session for the change at the revision read, under the derived mode operation', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await change(world, session, 'auto_permission')).toEqual({
      outcome: 'succeeded',
      body: { mode: 'auto_permission', revision: '1' },
    })
    const [call] = changes(world)
    expect(call?.operation).toBe(
      modeOperation(ALICE.loginText, ALICE.tenantText, session, {
        mode: 'auto_permission',
        expectedRevision: '0',
      }),
    )
    expect(call?.input).toEqual({
      kind: 'permission-mode',
      value: 'auto_permission',
      expectedRevision: '0',
      authorization: loginEntryOrigin(ALICE.account.text, ALICE.loginText),
    })
  })

  it('the same value answers no-change and commits nothing', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await change(world, session, 'bypass-permissions')).toEqual({
      outcome: 'no-change',
      body: { mode: 'bypass-permissions', revision: '0' },
    })
    expect(changes(world)).toHaveLength(0)
  })

  it('a mode that cannot be read now is basis-unavailable, and nothing is committed', async () => {
    const world = createWorld()
    const session = await created(world)
    world.modes.answer({ kind: 'unavailable' })
    expect(await change(world, session, 'never')).toEqual({ outcome: 'basis-unavailable' })
    expect(changes(world)).toHaveLength(0)
  })

  it('a revision other than the one in force answers conflict and commits nothing', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await change(world, session, 'never', '3')).toEqual({ outcome: 'conflict', body: {} })
    expect(changes(world)).toHaveLength(0)
  })

  it('a revision that moved before the commit answers conflict', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failNext({ kind: 'changed', revision: '9' } as SessionFailure)
    expect(await change(world, session, 'never')).toEqual({ outcome: 'conflict', body: {} })
  })

  it('a repeat of the same change is recalled under the same operation, not done twice', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.loseAnswers(1)
    expect(await change(world, session, 'never')).toEqual({ outcome: 'unknown' })
    expect(await change(world, session, 'never')).toEqual({
      outcome: 'succeeded',
      body: { mode: 'never', revision: '1' },
    })
    const [first, second] = changes(world)
    expect(second?.operation).toBe(first?.operation)
  })

  it.each(['denied', 'basis-unavailable'] as const)(
    'a refusal of the login for the tenant (%s) is the answer, and nothing is read or asked',
    async refusal => {
      const world = createWorld()
      const session = await created(world)
      world.refuseTargets(refusal)
      expect(await change(world, session, 'never')).toEqual({ outcome: refusal })
      expect(world.modes.calls()).toHaveLength(0)
      expect(changes(world)).toHaveLength(0)
    },
  )

  it('a session of another login is denied by Session; a throw is unknown', async () => {
    const world = createWorld()
    const session = await created(world)
    world.issue(BOB)
    expect(await change(world, session, 'never', '0', BOB)).toEqual({ outcome: 'denied' })
    world.session.controls.throwOn('change', new Error('lost'))
    expect(await change(world, session, 'never')).toEqual({ outcome: 'unknown' })
  })

  it('a login that names no caller is basis-unavailable', async () => {
    const world = createWorld()
    const session = await created(world)
    world.breakFacts('undescribed')
    expect(await change(world, session, 'never')).toEqual({ outcome: 'basis-unavailable' })
  })
})
