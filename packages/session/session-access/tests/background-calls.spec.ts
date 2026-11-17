import { describe, expect, it } from 'vitest'
import type { SessionFailure, SessionId } from '@omne-harness/session-contract'
import { controlOperation } from '../src/derivation.ts'
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
const producer = { kind: 'tool', call: 'call-9' } as const

async function created(world: World) {
  const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId: 'create-1',
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const background = (world: World, session: string, who = ALICE) =>
  ops(world)['background-call'](as(loginIdentity(who)), {
    tenant: who.tenant,
    session,
    controlId: 'control-1',
    producer,
  })

const list = (world: World, session: string, who = ALICE) =>
  ops(world)['list-background-calls'](as(loginIdentity(who)), { tenant: who.tenant, session })

describe('background-call', () => {
  it('asks Session for a background control of the call under the control operation of the login', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await background(world, session)).toEqual({
      outcome: 'succeeded',
      body: { kind: 'requested', controlId: 'control-1', producer },
    })
    const call = world.session.controls.calls()[1]
    expect(call).toMatchObject({
      method: 'control',
      input: { kind: 'background-tool', producer },
    })
    expect(call?.operation).toBe(
      controlOperation(ALICE.loginText, ALICE.tenantText, session, 'control-1'),
    )
  })

  it('answers background when Session reconciled the control at once: the call is already there', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.settleBackgroundAt('reconciled')
    expect(await background(world, session)).toEqual({
      outcome: 'succeeded',
      body: { kind: 'background', controlId: 'control-1', producer },
    })
  })

  it.each([
    [
      { kind: 'invalid', field: 'intent', reason: 'the producer is not bound' },
      { outcome: 'invalid', body: {} },
    ],
    [
      { kind: 'conflict', operation: 'op' },
      { outcome: 'conflict', body: {} },
    ],
    [{ kind: 'commit-unknown', operation: 'op' }, { outcome: 'unknown' }],
    [{ kind: 'denied', action: 'control' }, { outcome: 'denied' }],
    [{ kind: 'archived' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'unavailable', owner: 'x', diagnostic: 'y' }, { outcome: 'basis-unavailable' }],
  ] as const)('maps the Session failure %j', async (failure, expected) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failure as SessionFailure)
    expect(await background(world, session)).toEqual(expected)
  })

  it('answers unknown when Session throws after the call began', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('control', new Error('boom'))
    expect(await background(world, session)).toEqual({ outcome: 'unknown' })
  })

  it('answers denied to a session that does not exist and to a tenant of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await background(world, '0'.repeat(64))).toEqual({ outcome: 'denied' })
    expect(await background(world, session, BOB)).toEqual({ outcome: 'denied' })
  })

  it('answers basis-unavailable while Session is not on the tree', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    expect(await background(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('list-background-calls', () => {
  it('answers the backgrounded calls of the session by their references', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await list(world, session)).toEqual({ outcome: 'succeeded', body: { calls: [] } })
    world.session.controls.listBackground([producer, { kind: 'tool', call: 'call-10' }])
    expect(await list(world, session)).toEqual({
      outcome: 'succeeded',
      body: { calls: [{ producer }, { producer: { kind: 'tool', call: 'call-10' } }] },
    })
  })

  it('a Session failure is invalid or basis-unavailable; a throw is basis-unavailable, never unknown', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith({ kind: 'invalid', field: 'session', reason: 'x' })
    expect(await list(world, session)).toEqual({ outcome: 'invalid', body: {} })
    world.session.controls.failWith({ kind: 'unavailable', owner: 'x', diagnostic: 'y' })
    expect(await list(world, session)).toEqual({ outcome: 'basis-unavailable' })
    world.session.controls.restore()
    world.session.controls.throwOn('readBackgroundCalls', new Error('boom'))
    expect(await list(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('answers denied to a session that does not exist and to a tenant of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await list(world, '0'.repeat(64))).toEqual({ outcome: 'denied' })
    expect(await list(world, session, BOB)).toEqual({ outcome: 'denied' })
  })
})

describe('refusals before Session is asked', () => {
  it.each(['denied', 'basis-unavailable'] as const)(
    'a refusal of acting for the tenant (%s) answers both operations without a Session call',
    async refusal => {
      const world = createWorld()
      const session = await created(world)
      const before = world.session.controls.calls().length
      world.refuseTargets(refusal)
      expect(await background(world, session)).toEqual({ outcome: refusal })
      expect(await list(world, session)).toEqual({ outcome: refusal })
      expect(world.session.controls.calls()).toHaveLength(before)
    },
  )

  it('background-call answers basis-unavailable when the principal has no login fact', async () => {
    const world = createWorld()
    const session = await created(world)
    const before = world.session.controls.calls().length
    world.breakFacts('undescribed')
    expect(await background(world, session)).toEqual({ outcome: 'basis-unavailable' })
    expect(world.session.controls.calls()).toHaveLength(before)
  })
})
