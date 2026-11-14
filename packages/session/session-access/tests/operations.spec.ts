// The eight handlers of `session/v1` against the Session double: one success each, each refusal of
// the operation's contract, the target tenant refused by identity, and a service not on the tree.
import { describe, expect, it } from 'vitest'
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type { SessionFailure, SessionId } from '@omne-harness/session-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'
import type { SessionListEntry } from '../src/ports.ts'
import {
  acceptOperation,
  controlOperation,
  createOperation,
  inputIdentity,
  loginEntryOrigin,
  sessionIdentity,
} from '../src/derivation.ts'
import {
  DEFAULT_DEFINITION,
  DEFINITION,
  INITIAL_MODEL_SELECTION,
  createWorld,
  fixtureLogin,
  loginIdentity,
  type FixtureLogin,
  type World,
} from './fixtures/world.ts'

const LIMITS = {
  maxBytes: 65536,
  maxDepth: 16,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 65536,
  maxNumberLength: 32,
}

type JsonObject = Extract<JsonValue, { readonly kind: 'object' }>

function json(value: object): JsonObject {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok' || read.value.kind !== 'object')
    throw new Error('fixture json did not read')
  return read.value
}

function userMessage(text: string): JsonObject {
  return json({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'user',
    blocks: [{ kind: 'text', id: 'block-1', visibility: { toHuman: true, toModel: true }, text }],
  })
}

const signal = new AbortController().signal
const ops = (world: World) => world.contribution.operations
const as = <P>(principal: P) => ({ principal, messageId: 'm-1', signal })

const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')

const LIMITED: SessionFailure = { kind: 'limited', resource: 'pending-inputs', limit: 3 }

async function created(world: World, who: FixtureLogin = ALICE, createCallId = 'create-1') {
  const answer = await ops(world)['create-session'](as(world.issue(who)), {
    createCallId,
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const login = (who: FixtureLogin = ALICE): LoginIdentity => loginIdentity(who)

describe('create-session', () => {
  it('derives the session and the operation from the acting tenant and builds the creation', async () => {
    const world = createWorld()
    const principal = world.issue(ALICE)
    const answer = await ops(world)['create-session'](as(principal), {
      createCallId: 'create-1',
      definition: DEFINITION,
      purpose: 'hello',
    })
    const session = sessionIdentity(ALICE.tenantText, 'create-1')
    expect(answer).toEqual({ outcome: 'succeeded', body: { session, recovered: false } })
    const [call] = world.session.controls.calls()
    expect(call?.method).toBe('create')
    expect(call?.principal).toBe(principal)
    expect(call?.session).toBe(session)
    expect(call?.operation).toBe(createOperation(ALICE.tenantText, 'create-1'))
    expect(call?.input).toMatchObject({
      definition: { name: DEFINITION, candidate: { name: 'assistant@1' } },
      purpose: 'hello',
      workspace: null,
      workspaceAttachment: null,
      initial: null,
      modes: { kind: 'tenant-default', source: { name: 'defaults' } },
      initialModelSelection: INITIAL_MODEL_SELECTION,
    })
  })

  it('uses the default definition when the message names none', async () => {
    const world = createWorld({ defaultDefinition: DEFAULT_DEFINITION })
    const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
      createCallId: 'create-1',
      purpose: 'hello',
    })
    expect(answer.outcome).toBe('succeeded')
    expect(world.session.controls.calls()[0]?.input).toMatchObject({
      definition: { name: DEFAULT_DEFINITION, candidate: { name: 'coding@1' } },
    })
  })

  it('uses the named definition over the default', async () => {
    const world = createWorld({ defaultDefinition: DEFAULT_DEFINITION })
    const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
      createCallId: 'create-1',
      definition: DEFINITION,
      purpose: 'hello',
    })
    expect(answer.outcome).toBe('succeeded')
    expect(world.session.controls.calls()[0]?.input).toMatchObject({
      definition: { name: DEFINITION, candidate: { name: 'assistant@1' } },
    })
  })

  it('answers invalid without a definition when the deployment marks no default', async () => {
    const world = createWorld()
    const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
      createCallId: 'create-1',
      purpose: 'hello',
    })
    expect(answer).toEqual({ outcome: 'invalid', body: {} })
    expect(world.session.controls.calls()).toEqual([])
  })

  it('answers invalid to a definition outside the mapping without calling Session', async () => {
    const world = createWorld()
    const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
      createCallId: 'create-1',
      definition: 'other',
      purpose: 'hello',
    })
    expect(answer).toEqual({ outcome: 'invalid', body: {} })
    expect(world.session.controls.calls()).toEqual([])
  })

  it('answers recovered to the same createCallId and conflict to another creation', async () => {
    const world = createWorld()
    await created(world)
    const principal = world.issue(ALICE)
    const again = await ops(world)['create-session'](as(principal), {
      createCallId: 'create-1',
      definition: DEFINITION,
      purpose: 'hello',
    })
    expect(again).toMatchObject({ outcome: 'succeeded', body: { recovered: true } })
    const other = await ops(world)['create-session'](as(principal), {
      createCallId: 'create-1',
      definition: DEFINITION,
      purpose: 'different',
    })
    expect(other).toEqual({ outcome: 'conflict', body: {} })
  })

  it.each([
    [LIMITED, { outcome: 'limited', body: { resource: 'pending-inputs', limit: 3 } }],
    [
      { kind: 'invalid', field: 'x', reason: 'y' },
      { outcome: 'invalid', body: {} },
    ],
    [{ kind: 'denied', action: 'create' }, { outcome: 'denied' }],
    [{ kind: 'commit-unknown', operation: 'op' }, { outcome: 'unknown' }],
    [{ kind: 'unavailable', owner: 'x', diagnostic: 'y' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'archived' }, { outcome: 'basis-unavailable' }],
  ] as const)('maps the Session failure %j', async (failure, expected) => {
    const world = createWorld()
    world.session.controls.failWith(failure as SessionFailure)
    const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
      createCallId: 'create-1',
      definition: DEFINITION,
      purpose: 'hello',
    })
    expect(answer).toEqual(expected)
  })

  it('answers unknown when Session throws after the call began', async () => {
    const world = createWorld()
    world.session.controls.throwOn('create', new Error('boom'))
    const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
      createCallId: 'create-1',
      definition: DEFINITION,
      purpose: 'hello',
    })
    expect(answer).toEqual({ outcome: 'unknown' })
  })

  it('answers basis-unavailable to a principal identity cannot describe', async () => {
    const world = createWorld()
    const answer = await ops(world)['create-session'](as({} as Principal), {
      createCallId: 'create-1',
      definition: DEFINITION,
      purpose: 'hello',
    })
    expect(answer).toEqual({ outcome: 'basis-unavailable' })
  })

  it.each(['faces', 'definitions'] as const)(
    'answers basis-unavailable while %s is not on the tree',
    async port => {
      const world = createWorld()
      world.remove(port)
      const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
        createCallId: 'create-1',
        definition: DEFINITION,
        purpose: 'hello',
      })
      expect(answer).toEqual({ outcome: 'basis-unavailable' })
      expect(world.session.controls.calls()).toEqual([])
    },
  )
})

describe('query-create-session', () => {
  const body = { tenant: ALICE.tenant, createCallId: 'create-1' }

  it('answers succeeded with the session of a committed creation', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await ops(world)['query-create-session'](as(login()), body)).toEqual({
      outcome: 'succeeded',
      body: { session },
    })
    const query = world.session.controls.calls()[1]
    expect(query?.operation).toBe(createOperation(ALICE.tenantText, 'create-1'))
  })

  it('answers denied to a creation that never committed', async () => {
    const world = createWorld()
    world.session.controls.checkExistenceOnQuery(false)
    world.issue(ALICE)
    expect(await ops(world)['query-create-session'](as(login()), body)).toEqual({
      outcome: 'denied',
    })
  })

  it('answers denied when Session denies the read', async () => {
    const world = createWorld()
    expect(await ops(world)['query-create-session'](as(login()), body)).toEqual({
      outcome: 'denied',
    })
  })

  it('answers basis-unavailable when the read throws', async () => {
    const world = createWorld()
    await created(world)
    world.session.controls.throwOn('queryOperation', new Error('boom'))
    expect(await ops(world)['query-create-session'](as(login()), body)).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('answers denied to a target tenant of another account without calling Session', async () => {
    const world = createWorld()
    const answer = await ops(world)['query-create-session'](as(login(BOB)), body)
    expect(answer).toEqual({ outcome: 'denied' })
    expect(world.session.controls.calls()).toEqual([])
  })

  it('answers basis-unavailable while Session is not on the tree', async () => {
    const world = createWorld()
    world.remove('faces')
    expect(await ops(world)['query-create-session'](as(login()), body)).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})

describe('send-input', () => {
  const bodyOf = (session: string, acceptId = 'accept-1') => ({
    tenant: ALICE.tenant,
    session,
    acceptId,
    inputId: 'input-1',
    message: userMessage('hi'),
  })

  it('accepts an ordinary input with the derived identities and the login-entry origin', async () => {
    const world = createWorld()
    const session = await created(world)
    const answer = await ops(world)['send-input'](as(login()), bodyOf(session))
    expect(answer).toEqual({ outcome: 'succeeded', body: { recovered: false } })
    const call = world.session.controls.calls()[1]
    expect(call?.method).toBe('accept')
    expect(call?.operation).toBe(acceptOperation(ALICE.tenantText, session, 'accept-1'))
    expect(call?.input).toMatchObject({
      kind: 'ordinary',
      input: inputIdentity(ALICE.tenantText, session, 'input-1'),
      message: { role: 'user' },
      origin: loginEntryOrigin(ALICE.account.text, ALICE.loginText),
    })
  })

  it('answers protocol-rejected to a message that is not a user message, before identity', async () => {
    const world = createWorld()
    const session = await created(world)
    world.refuseTargets('throw')
    const answer = await ops(world)['send-input'](as(login()), {
      ...bodyOf(session),
      message: json({ role: 'assistant' }),
    })
    expect(answer).toEqual({ outcome: 'protocol-rejected' })
  })

  it.each([
    [LIMITED, { outcome: 'limited', body: { resource: 'pending-inputs', limit: 3 } }],
    [
      { kind: 'invalid', field: 'x', reason: 'y' },
      { outcome: 'invalid', body: {} },
    ],
    [{ kind: 'archived' }, { outcome: 'archived', body: {} }],
    [
      { kind: 'frozen', verdict: null },
      { outcome: 'frozen', body: {} },
    ],
    [
      { kind: 'conflict', operation: 'op' },
      { outcome: 'conflict', body: {} },
    ],
    [{ kind: 'denied', action: 'accept' }, { outcome: 'denied' }],
  ] as const)('maps the Session failure %j', async (failure, expected) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failure as SessionFailure)
    expect(await ops(world)['send-input'](as(login()), bodyOf(session))).toEqual(expected)
  })

  it('answers denied to a session that does not exist', async () => {
    const world = createWorld()
    world.issue(ALICE)
    expect(await ops(world)['send-input'](as(login()), bodyOf('0'.repeat(64)))).toEqual({
      outcome: 'denied',
    })
  })

  it.each(['denied', 'basis-unavailable'] as const)(
    'answers %s when identity refuses the target tenant',
    async refusal => {
      const world = createWorld()
      const session = await created(world)
      world.refuseTargets(refusal)
      expect(await ops(world)['send-input'](as(login()), bodyOf(session))).toEqual({
        outcome: refusal,
      })
      expect(world.session.controls.calls()).toHaveLength(1)
    },
  )

  it('answers basis-unavailable when identity throws', async () => {
    const world = createWorld()
    const session = await created(world)
    world.refuseTargets('throw')
    expect(await ops(world)['send-input'](as(login()), bodyOf(session))).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})

describe('query-send-input', () => {
  const bodyOf = (session: string) => ({ tenant: ALICE.tenant, session, acceptId: 'accept-1' })

  it('answers succeeded to a committed input', async () => {
    const world = createWorld()
    const session = await created(world)
    await ops(world)['send-input'](as(login()), {
      ...bodyOf(session),
      inputId: 'input-1',
      message: userMessage('hi'),
    })
    expect(await ops(world)['query-send-input'](as(login()), bodyOf(session))).toEqual({
      outcome: 'succeeded',
      body: {},
    })
    expect(world.session.controls.calls()[2]?.operation).toBe(
      acceptOperation(ALICE.tenantText, session, 'accept-1'),
    )
  })

  it('answers not-committed to an input that never committed', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await ops(world)['query-send-input'](as(login()), bodyOf(session))).toEqual({
      outcome: 'not-committed',
      body: {},
    })
  })

  it('answers denied to a session that does not exist', async () => {
    const world = createWorld()
    world.issue(ALICE)
    expect(await ops(world)['query-send-input'](as(login()), bodyOf('0'.repeat(64)))).toEqual({
      outcome: 'denied',
    })
  })

  it('answers basis-unavailable when the read throws', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('queryOperation', new Error('boom'))
    expect(await ops(world)['query-send-input'](as(login()), bodyOf(session))).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('answers denied to a target tenant of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await ops(world)['query-send-input'](as(login(BOB)), bodyOf(session))).toEqual({
      outcome: 'denied',
    })
  })

  it('answers basis-unavailable while Session is not on the tree', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    expect(await ops(world)['query-send-input'](as(login()), bodyOf(session))).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})

describe('read-history', () => {
  const first = (session: string, pageBytes = '1024') => ({
    tenant: ALICE.tenant,
    session,
    cursor: null,
    direction: 'forward' as const,
    pageBytes,
  })

  it('reads a first page with the deployment kinds and a next page by its cursor', async () => {
    const world = createWorld()
    const session = await created(world)
    for (const id of ['e1', 'e2'])
      world.session.controls.addEntry(session as SessionId, {
        id,
        kind: 'message.user',
        payload: id,
      })
    const page = await ops(world)['read-history'](as(login()), first(session, '64'))
    expect(page).toMatchObject({
      outcome: 'succeeded',
      body: {
        entries: [{ entryId: 'e1', kind: 'message.user' }],
        next: 'cursor:1',
        exhausted: false,
      },
    })
    expect(world.session.controls.calls()[1]?.input).toEqual({
      kinds: ['message.user', 'message.assistant'],
      pageBytes: 64,
    })
    const next = await ops(world)['read-history'](as(login()), {
      tenant: ALICE.tenant,
      session,
      cursor: 'cursor:1',
    })
    expect(next).toMatchObject({ outcome: 'succeeded', body: { exhausted: true } })
    // Both pages carry the traversal's pinned revision, as Session gave it (one commit: the create).
    expect(page).toMatchObject({ body: { upper: '1' } })
    expect(next).toMatchObject({ body: { upper: '1' } })
  })

  it('answers invalid to pageBytes over the deployment bound without calling Session', async () => {
    const world = createWorld({ maxPageBytes: 1000 })
    const session = await created(world)
    expect(await ops(world)['read-history'](as(login()), first(session, '1001'))).toEqual({
      outcome: 'invalid',
      body: {},
    })
    expect(world.session.controls.calls()).toHaveLength(1)
  })

  it('answers invalid to a foreign cursor', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(
      await ops(world)['read-history'](as(login()), {
        tenant: ALICE.tenant,
        session,
        cursor: 'foreign',
      }),
    ).toEqual({ outcome: 'invalid', body: {} })
  })

  it('answers denied to a session that does not exist', async () => {
    const world = createWorld()
    world.issue(ALICE)
    expect(await ops(world)['read-history'](as(login()), first('0'.repeat(64)))).toEqual({
      outcome: 'denied',
    })
  })

  it('answers basis-unavailable when the read throws', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('history.begin', new Error('boom'))
    expect(await ops(world)['read-history'](as(login()), first(session))).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('answers denied to a target tenant of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await ops(world)['read-history'](as(login(BOB)), first(session))).toEqual({
      outcome: 'denied',
    })
  })

  it('answers basis-unavailable while Session is not on the tree', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    expect(await ops(world)['read-history'](as(login()), first(session))).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})

describe('cancel-run', () => {
  const bodyOf = (session: string) => ({
    tenant: ALICE.tenant,
    session,
    controlId: 'control-1',
    run: 'run-1',
    urgency: 'graceful' as const,
  })

  it('answers requested with the control operation derived from the login', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.addRun(session as SessionId, 'run-1')
    expect(await ops(world)['cancel-run'](as(login()), bodyOf(session))).toEqual({
      outcome: 'succeeded',
      body: { kind: 'requested', controlId: 'control-1', run: 'run-1' },
    })
    expect(world.session.controls.calls()[1]?.operation).toBe(
      controlOperation(ALICE.loginText, ALICE.tenantText, session, 'control-1'),
    )
  })

  it('answers not-found to a run Session does not know', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await ops(world)['cancel-run'](as(login()), bodyOf(session))).toEqual({
      outcome: 'not-found',
      body: {},
    })
  })

  it.each([
    [
      { kind: 'invalid', field: 'x', reason: 'y' },
      { outcome: 'invalid', body: {} },
    ],
    [
      { kind: 'conflict', operation: 'op' },
      { outcome: 'conflict', body: {} },
    ],
    [{ kind: 'commit-unknown', operation: 'op' }, { outcome: 'unknown' }],
    [LIMITED, { outcome: 'basis-unavailable' }],
  ] as const)('maps the Session failure %j', async (failure, expected) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failure as SessionFailure)
    expect(await ops(world)['cancel-run'](as(login()), bodyOf(session))).toEqual(expected)
  })

  it('answers denied to a session that does not exist', async () => {
    const world = createWorld()
    world.issue(ALICE)
    expect(await ops(world)['cancel-run'](as(login()), bodyOf('0'.repeat(64)))).toEqual({
      outcome: 'denied',
    })
  })

  it('answers unknown when Session throws after the call began', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('cancelRun', new Error('boom'))
    expect(await ops(world)['cancel-run'](as(login()), bodyOf(session))).toEqual({
      outcome: 'unknown',
    })
  })

  it('answers denied to a target tenant of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await ops(world)['cancel-run'](as(login(BOB)), bodyOf(session))).toEqual({
      outcome: 'denied',
    })
  })

  it('answers basis-unavailable while Session is not on the tree', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    expect(await ops(world)['cancel-run'](as(login()), bodyOf(session))).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})

describe('stop-call', () => {
  const bodyOf = (session: string, kind: 'model' | 'tool' = 'model') => ({
    tenant: ALICE.tenant,
    session,
    controlId: 'control-1',
    producer: { kind, call: 'call-1' },
  })

  it('answers with the control operation derived from the login', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session))).toEqual({
      outcome: 'not-found',
      body: {},
    })
    expect(world.session.controls.calls()[1]?.operation).toBe(
      controlOperation(ALICE.loginText, ALICE.tenantText, session, 'control-1'),
    )
  })

  it('answers unsupported to a Tool target', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session, 'tool'))).toEqual({
      outcome: 'unsupported',
      body: {},
    })
  })

  it.each([
    [{ kind: 'denied', action: 'stopCall' }, { outcome: 'denied' }],
    [{ kind: 'unavailable', owner: 'x', diagnostic: 'y' }, { outcome: 'basis-unavailable' }],
    [
      { kind: 'conflict', operation: 'op' },
      { outcome: 'unsupported', body: {} },
    ],
  ] as const)(
    'keeps only access and availability of Session for a Tool target: %j',
    async (failure, expected) => {
      const world = createWorld()
      const session = await created(world)
      world.session.controls.refuseToolTargets(false)
      world.session.controls.failWith(failure as SessionFailure)
      expect(await ops(world)['stop-call'](as(login()), bodyOf(session, 'tool'))).toEqual(expected)
    },
  )

  it.each([
    [
      { kind: 'invalid', field: 'x', reason: 'y' },
      { outcome: 'invalid', body: {} },
    ],
    [
      { kind: 'conflict', operation: 'op' },
      { outcome: 'conflict', body: {} },
    ],
    [{ kind: 'commit-unknown', operation: 'op' }, { outcome: 'unknown' }],
    [{ kind: 'unsupported' }, { outcome: 'unsupported', body: {} }],
  ] as const)('maps the Session failure %j', async (failure, expected) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failure as SessionFailure)
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session))).toEqual(expected)
  })

  it('answers denied to a session that does not exist', async () => {
    const world = createWorld()
    world.issue(ALICE)
    expect(await ops(world)['stop-call'](as(login()), bodyOf('0'.repeat(64)))).toEqual({
      outcome: 'denied',
    })
  })

  it('answers unknown when Session throws after the call began', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('stopCall', new Error('boom'))
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session))).toEqual({
      outcome: 'unknown',
    })
  })

  it('answers denied to a target tenant of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await ops(world)['stop-call'](as(login(BOB)), bodyOf(session))).toEqual({
      outcome: 'denied',
    })
  })

  it('answers basis-unavailable while Session is not on the tree', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    expect(await ops(world)['stop-call'](as(login()), bodyOf(session))).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})

describe('list-sessions', () => {
  const body = { tenant: ALICE.tenant, cursor: null }
  const entry = (session: string, over: Partial<SessionListEntry> = {}): SessionListEntry => ({
    session,
    // The stand-in list hands the rows through; the handler never reads the instants.
    createdAt: '2026-11-13T01:00:00Z' as unknown as SessionListEntry['createdAt'],
    lastActivityAt: '2026-11-13T02:00:00Z' as unknown as SessionListEntry['lastActivityAt'],
    lifecycle: 'dormant',
    title: 'hello',
    ...over,
  })

  it('needs a login: the contract asks for one and reads without committing', () => {
    const contract = sessionProtocol.operations['list-sessions']
    expect([contract.identity, contract.effect, contract.limit]).toEqual(['login', 'read', 'small'])
  })

  it('lists the sessions of the target tenant for the principal issued for it, row by row', async () => {
    const world = createWorld()
    const rows = [
      entry('a'.repeat(64)),
      entry('b'.repeat(64), {
        createdAt: null,
        lastActivityAt: null,
        lifecycle: 'archived',
        title: null,
      }),
    ]
    world.listing.answer({ ok: { items: rows, next: 'page-2', completeness: 'partial' } })
    const answer = await ops(world)['list-sessions'](as(login()), {
      ...body,
      cursor: 'page-1',
      limit: 2,
      includeArchived: true,
    })
    expect(answer).toEqual({
      outcome: 'succeeded',
      body: { sessions: rows, next: 'page-2', completeness: 'partial' },
    })
    const [call, ...others] = world.listing.calls()
    expect(others).toEqual([])
    expect(call).toMatchObject({
      tenant: ALICE.tenant,
      after: 'page-1',
      limit: 2,
      includeArchived: true,
    })
    expect(call?.principal).toMatchObject({ kind: 'acting-for-tenant', tenant: ALICE.tenant })
  })

  it('leaves the list through with an empty page', async () => {
    const world = createWorld()
    expect(await ops(world)['list-sessions'](as(login()), body)).toEqual({
      outcome: 'succeeded',
      body: { sessions: [], next: null, completeness: 'complete' },
    })
  })

  it('uses the deployment default limit and leaves archived sessions out when the message says nothing', async () => {
    const world = createWorld({ defaultListLimit: 20, maxListLimit: 30 })
    await ops(world)['list-sessions'](as(login()), body)
    expect(world.listing.calls()[0]).toMatchObject({
      after: null,
      limit: 20,
      includeArchived: false,
    })
  })

  it('accepts a limit at the bound and answers invalid above it without asking the list', async () => {
    const world = createWorld({ defaultListLimit: 10, maxListLimit: 30 })
    expect((await ops(world)['list-sessions'](as(login()), { ...body, limit: 30 })).outcome).toBe(
      'succeeded',
    )
    expect(await ops(world)['list-sessions'](as(login()), { ...body, limit: 31 })).toEqual({
      outcome: 'invalid',
      body: {},
    })
    expect(world.listing.calls()).toHaveLength(1)
  })

  it('answers invalid to a cursor the list does not recognise', async () => {
    const world = createWorld()
    world.listing.answer({ refused: 'invalid' })
    expect(await ops(world)['list-sessions'](as(login()), { ...body, cursor: 'foreign' })).toEqual({
      outcome: 'invalid',
      body: {},
    })
  })

  it.each(['denied', 'basis-unavailable'] as const)(
    'answers %s when the list refuses with it',
    async refused => {
      const world = createWorld()
      world.listing.answer({ refused })
      expect(await ops(world)['list-sessions'](as(login()), body)).toEqual({ outcome: refused })
    },
  )

  it('answers basis-unavailable when the list throws', async () => {
    const world = createWorld()
    world.listing.answer('throw')
    expect(await ops(world)['list-sessions'](as(login()), body)).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('answers denied to a target tenant of another account without asking the list', async () => {
    const world = createWorld()
    expect(await ops(world)['list-sessions'](as(login(BOB)), body)).toEqual({ outcome: 'denied' })
    expect(world.listing.calls()).toEqual([])
  })

  it.each(['denied', 'basis-unavailable'] as const)(
    'answers %s when identity refuses the target tenant',
    async refusal => {
      const world = createWorld()
      world.refuseTargets(refusal)
      expect(await ops(world)['list-sessions'](as(login()), body)).toEqual({ outcome: refusal })
      expect(world.listing.calls()).toEqual([])
    },
  )

  it('answers basis-unavailable when identity throws', async () => {
    const world = createWorld()
    world.refuseTargets('throw')
    expect(await ops(world)['list-sessions'](as(login()), body)).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('answers basis-unavailable while the session list is not on the tree', async () => {
    const world = createWorld()
    world.remove('listing')
    expect(await ops(world)['list-sessions'](as(login()), body)).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})
