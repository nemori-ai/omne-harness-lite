import { describe, expect, it } from 'vitest'
import type { InputFate, SessionFailure, SessionId } from '@omne-harness/session-contract'
import { inputIdentity, tenantTextOf } from '../src/derivation.ts'
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

const target = (session: string) => ({ tenant: ALICE.tenant, session })
const readPending = (world: World, session: string, who = ALICE) =>
  ops(world)['read-pending'](as(loginIdentity(who)), { ...target(session), after: null, limit: 20 })
const readCalls = (world: World, session: string, who = ALICE) =>
  ops(world)['read-waiting-calls'](as(loginIdentity(who)), target(session))
const readFate = (world: World, session: string, inputId: string, who = ALICE) =>
  ops(world)['read-input-fate'](as(loginIdentity(who)), { ...target(session), inputId })

const READS = {
  'read-pending': (world: World, session: string, who = ALICE) => readPending(world, session, who),
  'read-waiting-calls': (world: World, session: string, who = ALICE) =>
    readCalls(world, session, who),
  'read-input-fate': (world: World, session: string, who = ALICE) =>
    readFate(world, session, 'input-1', who),
} as const

const PENDING = {
  input: 'in-1',
  position: '17',
  source: { name: 'session.member', label: 'Member' },
  role: 'user',
  wakes: true,
  preview: 'hello',
} as const
const CARD = { owner: 'human-intervention', record: 'card-1', revision: '1', digest: 'sha256:c' }

describe('read-pending', () => {
  it('answers the page Session gives, with the position to continue after', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.pendingWith({ inputs: [PENDING as never], next: '17' as never })
    expect(await readPending(world, session)).toEqual({
      outcome: 'succeeded',
      body: { inputs: [PENDING], next: '17' },
    })
  })

  it('passes the position and the limit of the body to Session', async () => {
    const world = createWorld()
    const session = await created(world)
    await ops(world)['read-pending'](as(loginIdentity(ALICE)), {
      ...target(session),
      after: '9',
      limit: 3,
    })
    const call = world.session.controls.calls().findLast(item => item.method === 'readPending')
    expect(call?.input).toEqual({ after: '9', limit: 3 })
  })
})

describe('read-waiting-calls', () => {
  it('answers each call that waits for a card, with the card it raised', async () => {
    const world = createWorld()
    const session = await created(world)
    const call = {
      card: CARD,
      action: 'act-1',
      passage: 'before-tool',
      position: 'p1',
      run: 'run-1',
    }
    world.session.controls.waitingCallsWith([
      call as never,
      { ...call, action: null, run: null } as never,
    ])
    expect(await readCalls(world, session)).toEqual({
      outcome: 'succeeded',
      body: { calls: [call, { ...call, action: null, run: null }] },
    })
  })
})

describe('read-input-fate', () => {
  const fates: readonly InputFate[] = [
    { kind: 'pending', returnedFrom: null },
    { kind: 'pending', returnedFrom: 'run-1' as never },
    { kind: 'taken', run: 'run-1' as never },
    { kind: 'answered', run: 'run-1' as never, terminal: 'completed' },
    { kind: 'settled', by: 'archived', run: null },
    { kind: 'refused', reason: 'too-large' },
  ]

  it.each(fates.map(fate => [fate.kind, fate] as const))(
    'answers the fate %s of the input the sender named',
    async (_kind, fate) => {
      const world = createWorld()
      const session = await created(world)
      const derived = inputIdentity(tenantTextOf(ALICE.tenant), session, 'input-1')
      world.session.controls.fateWith({ [derived]: fate })
      expect(await readFate(world, session, 'input-1')).toEqual({
        outcome: 'succeeded',
        body: { fate },
      })
    },
  )

  it('asks Session by the identity it derived at send-input, never by the sender text', async () => {
    const world = createWorld()
    const session = await created(world)
    await readFate(world, session, 'input-1')
    const call = world.session.controls.calls().findLast(item => item.method === 'readInputFate')
    expect(call?.input).toEqual({
      input: inputIdentity(tenantTextOf(ALICE.tenant), session, 'input-1'),
    })
  })

  it('answers denied for an input the session never accepted, the same as for a session of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    const unknown = await readFate(world, session, 'never-sent')
    const foreign = await readFate(world, session, 'input-1', BOB)
    expect(unknown).toEqual({ outcome: 'denied' })
    expect(JSON.stringify(foreign)).toBe(JSON.stringify(unknown))
  })
})

describe.each(Object.keys(READS) as (keyof typeof READS)[])('%s refusals', name => {
  const read = READS[name]

  it('answers denied alike to a session that does not exist and to a session of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    const absent = await read(world, '0'.repeat(64))
    const foreign = await read(world, session, BOB)
    expect(absent).toEqual({ outcome: 'denied' })
    expect(foreign).toEqual(absent)
  })

  it.each([
    ['denied', { outcome: 'denied' }],
    ['basis-unavailable', { outcome: 'basis-unavailable' }],
    ['throw', { outcome: 'basis-unavailable' }],
  ] as const)(
    'answers the identity refusal %s without calling Session',
    async (refusal, answer) => {
      const world = createWorld()
      const session = await created(world)
      const before = world.session.controls.calls().length
      world.refuseTargets(refusal)
      expect(await read(world, session)).toEqual(answer)
      expect(world.session.controls.calls()).toHaveLength(before)
    },
  )

  it.each([
    [
      { kind: 'invalid', field: 'limit', reason: 'none' },
      { outcome: 'invalid', body: {} },
    ],
    [
      { kind: 'unavailable', owner: 'history', diagnostic: 'down' },
      { outcome: 'basis-unavailable' },
    ],
    [{ kind: 'quarantined', diagnostic: 'x' }, { outcome: 'basis-unavailable' }],
  ] as const)('maps the Session failure %j', async (failure, answer) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failure as SessionFailure)
    expect(await read(world, session)).toEqual(answer)
  })

  it('answers basis-unavailable when Session throws or is away, never an empty answer', async () => {
    const world = createWorld()
    const session = await created(world)
    const method = {
      'read-pending': 'readPending',
      'read-waiting-calls': 'readWaitingCalls',
      'read-input-fate': 'readInputFate',
    }[name]
    world.session.controls.throwOn(method as never, new Error('boom'))
    expect(await read(world, session)).toEqual({ outcome: 'basis-unavailable' })
    world.session.controls.restore()
    world.remove('faces')
    expect(await read(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })
})
