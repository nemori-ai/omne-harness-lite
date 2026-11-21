import { describe, expect, it } from 'vitest'
import type { SessionFailure, SessionId } from '@omne-harness/session-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { controlOperation } from '../src/derivation.ts'
import type { SessionListEntry } from '../src/ports.ts'
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
const intentInvalid = (reason: string): SessionFailure => ({
  kind: 'invalid',
  field: 'intent',
  reason,
})

async function created(world: World) {
  const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId: 'create-1',
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const archive = (world: World, session: string, who = ALICE) =>
  ops(world)['archive-session'](as(loginIdentity(who)), {
    tenant: who.tenant,
    session,
    controlId: 'control-1',
  })
const unarchive = (world: World, session: string, who = ALICE) =>
  ops(world)['unarchive-session'](as(loginIdentity(who)), {
    tenant: who.tenant,
    session,
    controlId: 'control-2',
  })

describe('archive-session', () => {
  it('asks Session for an archive under the control operation of the login and answers what it withdrew', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.listBackground([{ kind: 'tool', call: 'call-1' }])
    expect(await archive(world, session)).toEqual({
      outcome: 'succeeded',
      body: { kind: 'archived', controlId: 'control-1', runs: 1, backgroundCalls: 1 },
    })
    const call = world.session.controls.calls()[1]
    expect(call).toMatchObject({ method: 'control', input: { kind: 'archive' } })
    expect(call?.operation).toBe(
      controlOperation(ALICE.loginText, ALICE.tenantText, session, 'control-1'),
    )
  })

  it('an archived session answers already archived, not a refusal', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failNext(intentInvalid('the session is archived'))
    expect(await archive(world, session)).toEqual({
      outcome: 'succeeded',
      body: { kind: 'already-archived', controlId: 'control-1' },
    })
  })

  it.each([
    [{ kind: 'conflict', operation: 'op' } as SessionFailure, { outcome: 'conflict', body: {} }],
    [
      { kind: 'invalid', field: 'storage', reason: 'x' } as SessionFailure,
      { outcome: 'invalid', body: {} },
    ],
    [{ kind: 'commit-unknown', operation: 'op' } as SessionFailure, { outcome: 'unknown' }],
  ])('maps the other failures as every control does: %j', async (failure, answer) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failNext(failure)
    expect(await archive(world, session)).toEqual(answer)
  })

  it.each(['denied', 'basis-unavailable'] as const)(
    'a refusal of the login for the tenant (%s) is the answer, and nothing is asked of Session',
    async refusal => {
      const world = createWorld()
      const session = await created(world)
      const before = world.session.controls.calls().length
      world.refuseTargets(refusal)
      expect(await archive(world, session)).toEqual({ outcome: refusal })
      expect(await unarchive(world, session)).toEqual({ outcome: refusal })
      expect(world.session.controls.calls()).toHaveLength(before)
    },
  )

  it('a login that names no caller is basis-unavailable', async () => {
    const world = createWorld()
    const session = await created(world)
    world.breakFacts('undescribed')
    expect(await archive(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('a session of another login is denied; a throw is unknown', async () => {
    const world = createWorld()
    const session = await created(world)
    world.issue(BOB)
    expect(await archive(world, session, BOB)).toEqual({ outcome: 'denied' })
    world.session.controls.throwOn('control', new Error('lost'))
    expect(await archive(world, session)).toEqual({ outcome: 'unknown' })
    expect(await unarchive(world, session)).toEqual({ outcome: 'unknown' })
  })
})

describe('unarchive-session', () => {
  it('asks Session for an unarchive and answers unarchived', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await unarchive(world, session)).toEqual({
      outcome: 'succeeded',
      body: { kind: 'unarchived', controlId: 'control-2' },
    })
    expect(world.session.controls.calls()[1]).toMatchObject({
      method: 'control',
      input: { kind: 'unarchive' },
    })
  })

  it('a session that is not archived answers not archived, not a refusal', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failNext(intentInvalid('the session is not archived'))
    expect(await unarchive(world, session)).toEqual({
      outcome: 'succeeded',
      body: { kind: 'not-archived', controlId: 'control-2' },
    })
  })
})

describe('list-archived-sessions', () => {
  const body = { tenant: ALICE.tenant, cursor: null }
  const row: SessionListEntry = {
    session: 'a'.repeat(64),
    createdAt: null,
    lastActivityAt: null,
    lifecycle: 'archived',
    title: 'old work',
    relation: 'child',
    parent: 'b'.repeat(64),
    origin: null,
    root: 'b'.repeat(64),
    depth: 1,
    attendance: 'unattended',
    definition: 'coding',
    archivedAt: null,
    archivedBy: 'auto',
  }

  it('reads without committing, and lists each item with its archive fields', async () => {
    const contract = sessionProtocol.operations['list-archived-sessions']
    expect([contract.identity, contract.effect, contract.limit]).toEqual(['login', 'read', 'small'])
    const world = createWorld()
    world.listing.answer({ ok: { items: [row], next: 'next', completeness: 'partial' } })
    expect(await ops(world)['list-archived-sessions'](as(loginIdentity(ALICE)), body)).toEqual({
      outcome: 'succeeded',
      body: { sessions: [row], next: 'next', completeness: 'partial' },
    })
  })

  it('hands the filters through, each missing one as null', async () => {
    const world = createWorld({ defaultListLimit: 20, maxListLimit: 30 })
    const from = '2026-11-01T00:00:00Z' as unknown as NonNullable<SessionListEntry['archivedAt']>
    await ops(world)['list-archived-sessions'](as(loginIdentity(ALICE)), {
      ...body,
      from,
      by: 'person',
    })
    await ops(world)['list-archived-sessions'](as(loginIdentity(ALICE)), {
      ...body,
      limit: 5,
      titleContains: 'build',
    })
    expect(world.listing.calls()).toEqual([
      expect.objectContaining({ limit: 20, from, to: null, by: 'person', titleContains: null }),
      expect.objectContaining({ limit: 5, from: null, to: null, by: null, titleContains: 'build' }),
    ])
  })

  it('hands the relation filters of both lists through, each missing one as null', async () => {
    const world = createWorld()
    const any = { relation: null, parent: null, attendance: null, definition: null }
    const parent = 'b'.repeat(64)
    await ops(world)['list-sessions'](as(loginIdentity(ALICE)), body)
    await ops(world)['list-sessions'](as(loginIdentity(ALICE)), {
      ...body,
      relation: 'child',
      parent,
      attendance: 'unattended',
      definition: 'coding',
    })
    await ops(world)['list-archived-sessions'](as(loginIdentity(ALICE)), {
      ...body,
      relation: 'handoff',
    })
    expect(world.listing.calls().map(call => call.filter)).toEqual([
      any,
      { relation: 'child', parent, attendance: 'unattended', definition: 'coding' },
      { ...any, relation: 'handoff' },
    ])
  })

  it('lists a session that is not archived with what it is to others, and without archive fields', async () => {
    const world = createWorld()
    world.listing.answer({ ok: { items: [row], next: null, completeness: 'complete' } })
    const { archivedAt: _at, archivedBy: _by, ...listed } = row
    expect(await ops(world)['list-sessions'](as(loginIdentity(ALICE)), body)).toEqual({
      outcome: 'succeeded',
      body: { sessions: [listed], next: null, completeness: 'complete' },
    })
  })

  it('answers invalid above the limit bound and when the list refuses with invalid', async () => {
    const world = createWorld({ defaultListLimit: 10, maxListLimit: 30 })
    expect(
      await ops(world)['list-archived-sessions'](as(loginIdentity(ALICE)), { ...body, limit: 31 }),
    ).toEqual({ outcome: 'invalid', body: {} })
    world.listing.answer({ refused: 'invalid' })
    expect(await ops(world)['list-archived-sessions'](as(loginIdentity(ALICE)), body)).toEqual({
      outcome: 'invalid',
      body: {},
    })
  })

  it('a list that throws, or is not there, is basis-unavailable', async () => {
    const world = createWorld()
    world.listing.answer('throw')
    expect(await ops(world)['list-archived-sessions'](as(loginIdentity(ALICE)), body)).toEqual({
      outcome: 'basis-unavailable',
    })
    world.remove('listing')
    expect(await ops(world)['list-archived-sessions'](as(loginIdentity(ALICE)), body)).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})
