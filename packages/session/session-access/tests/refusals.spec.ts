import { describe, expect, it } from 'vitest'
import type { Principal } from '@omne-harness/access-cordis-contract'
import type { SessionFailure, SessionId, SessionOperationId } from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import {
  DEFINITION,
  createWorld,
  fixtureLogin,
  loginIdentity,
  resolveDefinition,
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

const UNAVAILABLE = { outcome: 'basis-unavailable' }
const DENIED = { outcome: 'denied' }
const UNKNOWN = { outcome: 'unknown' }
const NOT_FOUND = { outcome: 'not-found', body: {} }
const UNSUPPORTED = { outcome: 'unsupported', body: {} }

const OPERATION = 'op' as SessionOperationId

const failures = {
  denied: { kind: 'denied', action: 'x' },
  invalid: { kind: 'invalid', field: 'x', reason: 'y' },
  conflict: { kind: 'conflict', operation: OPERATION },
  commitUnknown: { kind: 'commit-unknown', operation: OPERATION },
  unavailable: { kind: 'unavailable', owner: 'x', diagnostic: 'y' },
  quarantined: { kind: 'quarantined', diagnostic: 'y' },
  limited: { kind: 'limited', resource: 'pending-inputs', limit: 3 },
  archived: { kind: 'archived' },
  frozen: { kind: 'frozen', verdict: null },
  unsupported: { kind: 'unsupported' },
  notFound: { kind: 'not-found' },
  nothingPending: { kind: 'nothing-pending' },
  staleAdvance: { kind: 'stale-advance', current: null },
} as const satisfies Record<string, SessionFailure>

type Named = keyof typeof failures

describe('cancel-run: the Session failure the protocol answers', () => {
  const bodyOf = (session: string) => ({
    tenant: ALICE.tenant,
    session,
    controlId: 'control-1',
    run: 'run-1',
    urgency: 'graceful' as const,
  })

  it.each<[Named, object]>([
    ['denied', DENIED],
    ['invalid', { outcome: 'invalid', body: {} }],
    ['conflict', { outcome: 'conflict', body: {} }],
    ['commitUnknown', UNKNOWN],
    ['notFound', NOT_FOUND],
    ['unavailable', UNAVAILABLE],
    ['quarantined', UNAVAILABLE],
    ['limited', UNAVAILABLE],
    ['archived', UNAVAILABLE],
    ['frozen', UNAVAILABLE],
    ['unsupported', UNAVAILABLE],
    ['nothingPending', UNAVAILABLE],
    ['staleAdvance', UNAVAILABLE],
  ])('answers %s as %j', async (name, expected) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failures[name])
    expect(await ops(world)['cancel-run'](as(login()), bodyOf(session))).toEqual(expected)
  })

  it('answers the terminal of a run that already ended', async () => {
    const world = createWorld()
    const session = await created(world)
    const source = evidence('terminal/run-1')
    world.session.controls.answerControlWith({
      kind: 'ended',
      terminal: { run: 'run-1', outcome: 'cancelled', evidence: source } as never,
    })
    expect(await ops(world)['cancel-run'](as(login()), bodyOf(session))).toEqual({
      outcome: 'succeeded',
      body: {
        kind: 'ended',
        controlId: 'control-1',
        run: 'run-1',
        terminal: {
          outcome: 'cancelled',
          source: {
            owner: source.owner,
            record: source.record,
            revision: source.revision,
            digest: source.digest,
          },
        },
      },
    })
  })

  it('answers basis-unavailable without calling Session when identity cannot describe the caller', async () => {
    const world = createWorld()
    const session = await created(world)
    const before = world.session.controls.calls().length
    world.breakFacts('undescribed')
    expect(await ops(world)['cancel-run'](as(login()), bodyOf(session))).toEqual(UNAVAILABLE)
    world.breakFacts('throw')
    expect(await ops(world)['cancel-run'](as(login()), bodyOf(session))).toEqual(UNAVAILABLE)
    expect(world.session.controls.calls()).toHaveLength(before)
  })
})

describe('stop-call: the Session failure the protocol answers', () => {
  const bodyOf = (session: string, kind: 'model' | 'tool' = 'model') => ({
    tenant: ALICE.tenant,
    session,
    controlId: 'control-1',
    producer: { kind, call: 'call-1' },
  })

  it.each<[Named, object]>([
    ['denied', DENIED],
    ['invalid', { outcome: 'invalid', body: {} }],
    ['conflict', { outcome: 'conflict', body: {} }],
    ['commitUnknown', UNKNOWN],
    ['notFound', NOT_FOUND],
    ['unsupported', UNSUPPORTED],
    ['unavailable', UNAVAILABLE],
    ['quarantined', UNAVAILABLE],
    ['limited', UNAVAILABLE],
    ['archived', UNAVAILABLE],
    ['frozen', UNAVAILABLE],
    ['nothingPending', UNAVAILABLE],
    ['staleAdvance', UNAVAILABLE],
  ])('answers %s of a Model target as %j', async (name, expected) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failures[name])
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session))).toEqual(expected)
  })

  it('a Tool target that Session accepts answers requested, the same as a Model target', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.answerControlWith({
      kind: 'requested',
      progress: { operation: OPERATION, state: 'propagating', pending: [] } as never,
    })
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session, 'tool'))).toMatchObject({
      outcome: 'succeeded',
      body: { kind: 'requested', producer: { kind: 'tool' } },
    })
  })

  it('answers unknown to a Tool target when Session throws after the call began', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('stopCall', new Error('boom'))
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session, 'tool'))).toEqual(UNKNOWN)
  })

  it('answers the terminal of a call that already ended', async () => {
    const world = createWorld()
    const session = await created(world)
    const source = evidence('terminal/call-1')
    world.session.controls.answerControlWith({
      kind: 'ended',
      terminal: {
        producer: { kind: 'model', call: 'call-1' },
        version: 'v7',
        outcome: 'interrupted',
        source,
        recorded: evidence('recorded/call-1'),
      } as never,
    })
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session))).toEqual({
      outcome: 'succeeded',
      body: {
        kind: 'ended',
        controlId: 'control-1',
        producer: { kind: 'model', call: 'call-1' },
        terminal: {
          version: 'v7',
          outcome: 'interrupted',
          source: {
            owner: source.owner,
            record: source.record,
            revision: source.revision,
            digest: source.digest,
          },
        },
      },
    })
  })

  it.each(['model', 'tool'] as const)(
    'answers basis-unavailable to a %s target without calling Session when identity cannot describe the caller',
    async kind => {
      const world = createWorld()
      const session = await created(world)
      const before = world.session.controls.calls().length
      world.breakFacts('undescribed')
      expect(await ops(world)['stop-call'](as(login()), bodyOf(session, kind))).toEqual(UNAVAILABLE)
      world.breakFacts('throw')
      expect(await ops(world)['stop-call'](as(login()), bodyOf(session, kind))).toEqual(UNAVAILABLE)
      expect(world.session.controls.calls()).toHaveLength(before)
    },
  )
})

describe('query-create-session: the Session answer the protocol gives', () => {
  const body = { tenant: ALICE.tenant, createCallId: 'create-1' }

  it.each<[Named, object]>([
    ['denied', DENIED],
    ['commitUnknown', UNKNOWN],
    ['invalid', UNAVAILABLE],
    ['conflict', UNAVAILABLE],
    ['notFound', UNAVAILABLE],
    ['unavailable', UNAVAILABLE],
    ['quarantined', UNAVAILABLE],
    ['limited', UNAVAILABLE],
    ['archived', UNAVAILABLE],
    ['unsupported', UNAVAILABLE],
  ])('answers the failure %s as %j', async (name, expected) => {
    const world = createWorld()
    await created(world)
    world.session.controls.failQueryWith(failures[name])
    expect(await ops(world)['query-create-session'](as(login()), body)).toEqual(expected)
  })

  it.each([
    [{ kind: 'unknown' }],
    [{ kind: 'attempt-rejected', original: 'unknown', reason: 'gone' }],
  ] as const)('answers unknown to the resolution %j', async resolution => {
    const world = createWorld()
    await created(world)
    world.session.controls.resolveQueryWith(resolution)
    expect(await ops(world)['query-create-session'](as(login()), body)).toEqual(UNKNOWN)
  })
})

describe('create-session: the caller and the definition', () => {
  const body = { createCallId: 'create-1', definition: DEFINITION, purpose: 'hello' }

  it('answers basis-unavailable without calling Session when identity throws describing the caller', async () => {
    const world = createWorld()
    const principal = world.issue(ALICE)
    world.breakFacts('throw')
    expect(await ops(world)['create-session'](as(principal), body)).toEqual(UNAVAILABLE)
    expect(world.session.controls.calls()).toEqual([])
  })

  it('answers basis-unavailable to a definition that carries no initial model selection', async () => {
    const world = createWorld()
    world.useDefinitions(name => {
      const resolved = resolveDefinition(name)
      if (resolved === undefined) return undefined
      const { initialModelSelection: _omitted, ...without } = resolved
      return without
    })
    expect(await ops(world)['create-session'](as(world.issue(ALICE)), body)).toEqual(UNAVAILABLE)
    expect(world.session.controls.calls()).toEqual([])
  })

  it('asks for the definition as the tenant that creates sees it, and waits for the answer', async () => {
    const world = createWorld()
    const asked: unknown[] = []
    world.useDefinitions(async (name, tenant) => {
      asked.push([name, tenant])
      return resolveDefinition(name)
    })
    const made = await ops(world)['create-session'](as(world.issue(ALICE)), body)
    expect(made.outcome).toBe('succeeded')
    expect(asked).toEqual([[DEFINITION, ALICE.tenant]])
  })

  it('answers basis-unavailable, not invalid, while the definitions of the tenant cannot be read', async () => {
    const world = createWorld()
    world.useDefinitions(async () => 'unavailable' as const)
    expect(await ops(world)['create-session'](as(world.issue(ALICE)), body)).toEqual(UNAVAILABLE)
    world.useDefinitions(async () => undefined)
    expect((await ops(world)['create-session'](as(world.issue(ALICE)), body)).outcome).toBe(
      'invalid',
    )
    expect(world.session.controls.calls()).toEqual([])
  })

  it('answers basis-unavailable to a principal identity cannot describe, without calling Session', async () => {
    const world = createWorld()
    expect(await ops(world)['create-session'](as({} as Principal), body)).toEqual(UNAVAILABLE)
    expect(world.session.controls.calls()).toEqual([])
  })
})

describe('read-history: the page-size bound', () => {
  const first = (session: string, pageBytes: string) => ({
    tenant: ALICE.tenant,
    session,
    cursor: null,
    direction: 'forward' as const,
    pageBytes,
  })

  it.each([
    ['1000', true],
    ['999', true],
    ['99', true],
    ['1', true],
    ['1001', false],
    ['2000', false],
    ['9999', false],
    ['10000', false],
    ['100000', false],
  ])('with the bound at 1000, pageBytes %s is within: %s', async (pageBytes, within) => {
    const world = createWorld({ maxPageBytes: 1000 })
    const session = await created(world)
    const before = world.session.controls.calls().length
    const answer = await ops(world)['read-history'](as(login()), first(session, pageBytes))
    if (within) {
      expect(answer.outcome).toBe('succeeded')
      expect(world.session.controls.calls()[before]?.input).toMatchObject({
        pageBytes: Number(pageBytes),
      })
    } else {
      expect(answer).toEqual({ outcome: 'invalid', body: {} })
      expect(world.session.controls.calls()).toHaveLength(before)
    }
  })

  it.each([
    ['65536', true],
    ['65537', false],
    ['9999', true],
    ['100000', false],
  ])('with the bound at 65536, pageBytes %s is within: %s', async (pageBytes, within) => {
    const world = createWorld({ maxPageBytes: 65536 })
    const session = await created(world)
    const answer = await ops(world)['read-history'](as(login()), first(session, pageBytes))
    expect(answer.outcome).toBe(within ? 'succeeded' : 'invalid')
  })
})
