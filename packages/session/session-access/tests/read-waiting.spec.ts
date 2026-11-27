import { describe, expect, it } from 'vitest'
import type { RunId, SessionFailure, SessionId } from '@omne-harness/session-contract'
import {
  DEFINITION,
  createWorld,
  fixtureLogin,
  loginIdentity,
  type CauseScript,
  type World,
} from './fixtures/world.ts'

const signal = new AbortController().signal
const ops = (world: World) => world.contribution.operations
const as = <P>(principal: P) => ({ principal, messageId: 'm-1', signal })
const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')
const RUN = 'run-1' as RunId

async function created(world: World) {
  const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId: 'create-1',
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const readWaiting = (world: World, session: string, who = ALICE) =>
  ops(world)['read-waiting'](as(loginIdentity(who)), { tenant: ALICE.tenant, session })

type SessionState = 'not waiting' | 'waiting with pending' | 'waiting with nothing pending'
type CausePort = 'answers a cause' | 'answers none' | 'cannot read' | 'is absent' | 'throws'

const PENDING: Readonly<Record<Exclude<SessionState, 'not waiting'>, number>> = {
  'waiting with pending': 2,
  'waiting with nothing pending': 0,
}

const CAUSE = {
  kind: 'no-reply',
  detail: 'http-429',
  fault: { cause: 'upstream-unavailable', upstreamStatus: '429', throttled: true },
}

const SCRIPT: Readonly<Record<Exclude<CausePort, 'is absent'>, CauseScript>> = {
  'answers a cause': { kind: 'cause', cause: CAUSE },
  'answers none': { kind: 'none' },
  'cannot read': { kind: 'unavailable' },
  throws: 'throw',
}

function arrange(world: World, state: SessionState, port: CausePort) {
  world.session.controls.waitWith(
    state === 'not waiting'
      ? null
      : { run: RUN, pending: PENDING[state], execution: 'execution-1' },
  )
  if (port === 'is absent') world.remove('causes')
  else world.causes.answer(SCRIPT[port])
}

function expected(state: SessionState, port: CausePort) {
  if (state === 'not waiting') return { outcome: 'succeeded', body: { waiting: null } }
  const cause = port === 'answers a cause' ? CAUSE : null
  return {
    outcome: 'succeeded',
    body: { waiting: { run: RUN, pending: PENDING[state], cause } },
  }
}

const STATES: readonly SessionState[] = [
  'not waiting',
  'waiting with pending',
  'waiting with nothing pending',
]
const PORTS: readonly CausePort[] = [
  'answers a cause',
  'answers none',
  'cannot read',
  'is absent',
  'throws',
]

describe('read-waiting over the totalized table', () => {
  it.each(STATES.flatMap(state => PORTS.map(port => [state, port] as const)))(
    'a session %s and a cause port that %s',
    async (state, port) => {
      const world = createWorld()
      const session = await created(world)
      arrange(world, state, port)
      expect(await readWaiting(world, session)).toEqual(expected(state, port))
    },
  )
})

describe('read-waiting asks for the cause', () => {
  it('of the waiting Run in its session, with the principal and the tenant of the read', async () => {
    const world = createWorld()
    const session = await created(world)
    arrange(world, 'waiting with pending', 'answers a cause')
    await readWaiting(world, session)
    const [call] = world.causes.calls()
    expect(call?.run).toBe(RUN)
    expect(call?.session).toBe(session)
    expect(call?.tenant).toEqual(ALICE.tenant)
    expect(call?.principal).toBe(world.session.controls.calls().at(-1)?.principal)
  })

  it('never when the session is not waiting', async () => {
    const world = createWorld()
    const session = await created(world)
    arrange(world, 'not waiting', 'answers a cause')
    await readWaiting(world, session)
    expect(world.causes.calls()).toEqual([])
  })

  it('by the Run also when Session keeps no execution of it: the cause is in the session log', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.waitWith({ run: RUN, pending: 1, execution: null })
    world.causes.answer(SCRIPT['answers a cause'])
    expect(await readWaiting(world, session)).toEqual({
      outcome: 'succeeded',
      body: { waiting: { run: RUN, pending: 1, cause: CAUSE } },
    })
    expect(world.causes.calls().map(call => call.run)).toEqual([RUN])
  })

  it('and answers a missing detail as null and an empty kind as no cause', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.waitWith({ run: RUN, pending: 1, execution: 'execution-1' })
    world.causes.answer({ kind: 'cause', cause: { kind: 'guard', detail: '', fault: null } })
    expect(await readWaiting(world, session)).toMatchObject({
      body: { waiting: { cause: { kind: 'guard', detail: null, fault: null } } },
    })
    world.causes.answer({ kind: 'cause', cause: { kind: '', detail: 'x', fault: null } })
    expect(await readWaiting(world, session)).toMatchObject({ body: { waiting: { cause: null } } })
  })
})

describe('read-waiting refusals', () => {
  it('answers denied alike to a session that does not exist and to a session of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    arrange(world, 'waiting with pending', 'answers a cause')
    const absent = await readWaiting(world, '0'.repeat(64))
    const foreign = await readWaiting(world, session, BOB)
    expect(absent).toEqual({ outcome: 'denied' })
    expect(foreign).toEqual(absent)
    expect(world.causes.calls()).toEqual([])
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
      expect(await readWaiting(world, session)).toEqual(answer)
      expect(world.session.controls.calls()).toHaveLength(before)
    },
  )

  it.each([
    [
      { kind: 'invalid', field: 'tenant', reason: 'none' },
      { outcome: 'invalid', body: {} },
    ],
    [{ kind: 'not-found' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'unavailable', owner: 'x', diagnostic: 'y' }, { outcome: 'basis-unavailable' }],
  ] as const)('maps the Session failure %j', async (failure, answer) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failure as SessionFailure)
    expect(await readWaiting(world, session)).toEqual(answer)
  })

  it('answers basis-unavailable when the Session read throws', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('readWaiting', new Error('boom'))
    expect(await readWaiting(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('answers basis-unavailable while Session is not on the tree', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    expect(await readWaiting(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })
})
