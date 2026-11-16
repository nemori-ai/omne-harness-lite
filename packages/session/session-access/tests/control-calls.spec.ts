import { describe, expect, it } from 'vitest'
import type { SessionFailure, SessionId } from '@omne-harness/session-contract'
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
const login = () => loginIdentity(ALICE)

async function created(world: World): Promise<SessionId> {
  const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId: 'create-1',
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const REQUESTED = {
  kind: 'requested',
  progress: { operation: 'op', state: 'committed', pending: [] },
} as never

const handlers = {
  'query-create-session': (world: World) =>
    ops(world)['query-create-session'](as(login()), {
      tenant: ALICE.tenant,
      createCallId: 'create-1',
    }),
  'cancel-run': (world: World, session: string) =>
    ops(world)['cancel-run'](as(login()), {
      tenant: ALICE.tenant,
      session,
      controlId: 'control-1',
      run: 'run-1',
      urgency: 'graceful',
    }),
  'stop-call': (world: World, session: string) =>
    ops(world)['stop-call'](as(login()), {
      tenant: ALICE.tenant,
      session,
      controlId: 'control-1',
      producer: { kind: 'model', call: 'call-1' },
    }),
} as const

describe('the target tenant the identity port cannot issue a principal for', () => {
  it.each(Object.keys(handlers) as (keyof typeof handlers)[])(
    '%s answers what the port refused with, or basis-unavailable when it throws, and does not call Session',
    async name => {
      for (const [refusal, expected] of [
        ['denied', { outcome: 'denied' }],
        ['basis-unavailable', { outcome: 'basis-unavailable' }],
        ['throw', { outcome: 'basis-unavailable' }],
      ] as const) {
        const world = createWorld()
        const session = await created(world)
        const before = world.session.controls.calls().length
        world.refuseTargets(refusal)
        expect(await handlers[name](world, session)).toEqual(expected)
        expect(world.session.controls.calls()).toHaveLength(before)
      }
    },
  )
})

describe('what cancel-run hands to Session', () => {
  it.each(['graceful', 'force'] as const)(
    'passes the run, the %s urgency, the target tenant, the session and a principal issued for that tenant',
    async urgency => {
      const world = createWorld()
      const session = await created(world)
      const answer = await ops(world)['cancel-run'](as(login()), {
        tenant: ALICE.tenant,
        session,
        controlId: 'control-7',
        run: 'run-9',
        urgency,
      })
      expect(answer).toEqual({ outcome: 'not-found', body: {} })
      const call = world.session.controls.calls()[1]
      expect(call?.method).toBe('cancelRun')
      expect(call?.input).toEqual({ run: 'run-9', urgency })
      expect(call?.tenant).toEqual(ALICE.tenant)
      expect(call?.session).toBe(session)
      expect(call?.principal).toMatchObject({ kind: 'acting-for-tenant', tenant: ALICE.tenant })
    },
  )

  it('answers requested with the control id and the run of the message', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.answerControlWith(REQUESTED)
    expect(
      await ops(world)['cancel-run'](as(login()), {
        tenant: ALICE.tenant,
        session,
        controlId: 'control-7',
        run: 'run-9',
        urgency: 'force',
      }),
    ).toEqual({
      outcome: 'succeeded',
      body: { kind: 'requested', controlId: 'control-7', run: 'run-9' },
    })
  })
})

describe('what stop-call hands to Session and answers', () => {
  const bodyOf = (session: string, kind: 'model' | 'tool' = 'model') => ({
    tenant: ALICE.tenant,
    session,
    controlId: 'control-7',
    producer: { kind, call: 'call-9' },
  })

  it('passes the producer, the target tenant, the session and a principal issued for that tenant', async () => {
    const world = createWorld()
    const session = await created(world)
    await ops(world)['stop-call'](as(login()), bodyOf(session))
    const call = world.session.controls.calls()[1]
    expect(call?.method).toBe('stopCall')
    expect(call?.input).toEqual({ producer: { kind: 'model', call: 'call-9' } })
    expect(call?.tenant).toEqual(ALICE.tenant)
    expect(call?.session).toBe(session)
    expect(call?.principal).toMatchObject({ kind: 'acting-for-tenant', tenant: ALICE.tenant })
  })

  it('answers requested with the control id and the producer of the message', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.answerControlWith(REQUESTED)
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session))).toEqual({
      outcome: 'succeeded',
      body: {
        kind: 'requested',
        controlId: 'control-7',
        producer: { kind: 'model', call: 'call-9' },
      },
    })
  })

  it('answers unsupported to a Tool target whatever Session answered, even a requested stop', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.refuseToolTargets(false)
    world.session.controls.answerControlWith(REQUESTED)
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session, 'tool'))).toEqual({
      outcome: 'unsupported',
      body: {},
    })
  })

  it.each([
    ['frozen', { kind: 'frozen', verdict: null }],
    ['unsupported', { kind: 'unsupported' }],
    ['stale-advance', { kind: 'stale-advance', current: null }],
  ] as const)(
    'answers unsupported to a Tool target when Session fails with %s, not basis-unavailable',
    async (_name, failure) => {
      const world = createWorld()
      const session = await created(world)
      world.session.controls.refuseToolTargets(false)
      world.session.controls.failWith(failure as SessionFailure)
      expect(await ops(world)['stop-call'](as(login()), bodyOf(session, 'tool'))).toEqual({
        outcome: 'unsupported',
        body: {},
      })
    },
  )
})

describe('the first page of read-history against the deployment bound, digit by digit', () => {
  const first = (session: string, pageBytes: string) => ({
    tenant: ALICE.tenant,
    session,
    cursor: null,
    direction: 'forward' as const,
    pageBytes,
  })

  it.each([
    ['5555', true],
    ['5554', true],
    ['5545', true],
    ['5455', true],
    ['4999', true],
    ['5556', false],
    ['5565', false],
    ['5655', false],
    ['6000', false],
    ['55550', false],
    ['49999', false],
    ['1000000', false],
    ['555', true],
    ['999', true],
  ])('with the bound at 5555, pageBytes %s is within: %s', async (pageBytes, within) => {
    const world = createWorld({ maxPageBytes: 5555 })
    const session = await created(world)
    const before = world.session.controls.calls().length
    const answer = await ops(world)['read-history'](as(login()), first(session, pageBytes))
    expect(answer.outcome).toBe(within ? 'succeeded' : 'invalid')
    expect(world.session.controls.calls()).toHaveLength(within ? before + 1 : before)
  })

  it.each([
    ['9007199254740991', true],
    ['9007199254740990', true],
    ['9007199254740992', false],
    ['900719925474099', true],
    ['90071992547409910', false],
  ])(
    'with the bound at the largest safe integer, pageBytes %s is within: %s',
    async (pageBytes, within) => {
      const world = createWorld({ maxPageBytes: Number.MAX_SAFE_INTEGER })
      const session = await created(world)
      const answer = await ops(world)['read-history'](as(login()), first(session, pageBytes))
      expect(answer.outcome).toBe(within ? 'succeeded' : 'invalid')
    },
  )

  it.each([
    ['1', true],
    ['2', false],
    ['9', false],
    ['10', false],
  ])('with the bound at 1, pageBytes %s is within: %s', async (pageBytes, within) => {
    const world = createWorld({ maxPageBytes: 1 })
    const session = await created(world)
    const answer = await ops(world)['read-history'](as(login()), first(session, pageBytes))
    expect(answer.outcome).toBe(within ? 'succeeded' : 'invalid')
  })

  it('answers the bound before it reads, so an over-bound first page never reaches Session', async () => {
    const world = createWorld({ maxPageBytes: 64 })
    const session = await created(world)
    world.session.controls.throwOn('history.begin', new Error('must not be reached'))
    expect(await ops(world)['read-history'](as(login()), first(session, '65'))).toEqual({
      outcome: 'invalid',
      body: {},
    })
    expect(world.session.controls.calls().map(call => call.method)).not.toContain('history.begin')
  })
})

describe('what query-create-session hands to Session', () => {
  it('asks for the creation operation of the message, on the derived session, for the target tenant', async () => {
    const world = createWorld()
    const session = await created(world)
    await handlers['query-create-session'](world)
    const call = world.session.controls.calls()[1]
    expect(call?.method).toBe('queryOperation')
    expect(call?.tenant).toEqual(ALICE.tenant)
    expect(call?.session).toBe(session)
    expect(call?.principal).toMatchObject({ kind: 'acting-for-tenant', tenant: ALICE.tenant })
  })
})
