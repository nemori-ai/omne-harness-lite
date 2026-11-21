import { createHash } from 'node:crypto'
import { standingPrincipalRef } from '@omne-harness/identity'
import { describe, expect, it } from 'vitest'
import { hitlReplyIdentity } from '../src/derivation.ts'
import { HITL_LOCATION } from './fixtures/hitl-double.ts'
import { bodyOf, as, wire, type Name } from './fixtures/wire.ts'
import { SESSION_REF, createWorld, fixtureLogin, type FixtureLogin } from './fixtures/world.ts'

const ALICE = fixtureLogin('a')
const ALICE_AGAIN = fixtureLogin('a', 'proof-a-second')
const BOB = fixtureLogin('b')

function run(world: ReturnType<typeof createWorld>) {
  const operations = world.contribution.operations
  return async (name: Name, login: FixtureLogin, sample: Record<string, unknown>) => {
    const handler = operations[name] as unknown as (
      call: ReturnType<typeof as>,
      body: never,
    ) => Promise<never>
    return wire(name, (await handler(as(login), bodyOf(name, sample))) as never) as {
      outcome: string
      body?: any
    }
  }
}

const listBody = (login: FixtureLogin, filter: object = { states: ['pending'] }) => ({
  tenant: login.tenantText,
  filter,
  cursor: null,
  limit: 20,
})
const readBody = (tenantText: string, card: unknown) => ({ tenant: tenantText, card })
const submission = (login: FixtureLogin, card: unknown, overrides: object = {}) => ({
  tenant: login.tenantText,
  card,
  expectedRevision: '0',
  reply: { kind: 'selection', optionId: 'yes' },
  replyId: 'reply-1',
  ...overrides,
})
const missingCard = (login: FixtureLogin) => ({
  request: { tenantRef: login.tenantText, requestId: 'r' },
  cardId: 'c',
})

describe('the entry principal and the two ways to list', () => {
  it('two logins of one tenant act as one entry principal, list the same card through the pool and by session, and read it', async () => {
    const world = createWorld()
    const call = run(world)
    const entryRef = world.holder.refOf(ALICE.tenant)
    const item = world.hitl.addCard({
      tenant: ALICE.tenant,
      cardId: 'card-1',
      sessionRef: SESSION_REF,
      readers: [entryRef],
    })

    const pool = await call('list-cards', ALICE, listBody(ALICE))
    const bySession = await call(
      'list-cards',
      ALICE_AGAIN,
      listBody(ALICE, { states: ['pending'], sessionRef: SESSION_REF }),
    )
    const card = await call('read-card', ALICE_AGAIN, readBody(ALICE.tenantText, item.card.ref))

    expect([pool.outcome, bySession.outcome, card.outcome]).toEqual([
      'succeeded',
      'succeeded',
      'succeeded',
    ])
    expect(pool.body.items).toHaveLength(1)
    expect(bySession.body.items).toEqual(pool.body.items)
    expect(card.body.item).toEqual(pool.body.items[0])
    const principals = world.hitl.calls.map(entry => standingPrincipalRef(entry.principal))
    expect(new Set(principals)).toEqual(new Set([entryRef]))
    expect(world.holder.inputs).toEqual([
      ['account', 'tenant'],
      ['account', 'tenant'],
      ['account', 'tenant'],
    ])
  })

  it('two tenants have different entry principals and each sees only its own cards', async () => {
    const world = createWorld()
    const call = run(world)
    expect(world.holder.refOf(ALICE.tenant)).not.toBe(world.holder.refOf(BOB.tenant))
    world.hitl.addCard({
      tenant: ALICE.tenant,
      cardId: 'a',
      readers: [world.holder.refOf(ALICE.tenant)],
    })
    world.hitl.addCard({
      tenant: BOB.tenant,
      cardId: 'b',
      readers: [world.holder.refOf(BOB.tenant)],
    })
    const bobs = await call('list-cards', BOB, listBody(BOB))
    expect(bobs.body.items.map((entry: any) => entry.card.ref.cardId)).toEqual(['b'])
  })

  it('both ways call the same listPool, the location comes from the settings and the filter goes through as it is', async () => {
    const world = createWorld()
    const call = run(world)
    const filter = { states: ['pending', 'decided'], sessionRef: SESSION_REF, originKind: 'tool' }
    await call('list-cards', ALICE, listBody(ALICE))
    await call('list-cards', ALICE, listBody(ALICE, filter))
    expect(world.hitl.calls.map(entry => entry.method)).toEqual(['listPool', 'listPool'])
    expect(world.hitl.calls.map(entry => entry.input)).toEqual([
      {
        protocol: 'hitl/1',
        tenantRef: ALICE.tenantText,
        locationRef: HITL_LOCATION,
        filter: { states: ['pending'] },
        limit: 20,
      },
      {
        protocol: 'hitl/1',
        tenantRef: ALICE.tenantText,
        locationRef: HITL_LOCATION,
        filter,
        limit: 20,
      },
    ])
  })

  it('the cursor of a next page goes to HITL as it is', async () => {
    const world = createWorld()
    await run(world)('list-cards', ALICE, {
      tenant: ALICE.tenantText,
      filter: { states: ['pending'] },
      cursor: 'page-2',
      limit: 5,
    })
    expect(world.hitl.calls[0]?.input).toMatchObject({ cursor: 'page-2', limit: 5 })
  })
})

describe('the card view', () => {
  it('the origin has only the kind and the session, run and tool call references; no routing field reaches the answer', async () => {
    const world = createWorld()
    const item = world.hitl.addCard({
      tenant: ALICE.tenant,
      cardId: 'card-1',
      sessionRef: SESSION_REF,
      readers: [world.holder.refOf(ALICE.tenant)],
    })
    const reply = await run(world)('read-card', ALICE, readBody(ALICE.tenantText, item.card.ref))
    expect(reply.outcome).toBe('succeeded')
    expect(reply.body.item.origin).toEqual({
      kind: 'tool',
      sessionRef: SESSION_REF,
      runRef: 'run-1',
      toolCallRef: 'call-1',
    })
    expect(reply.body.item.card).toEqual(JSON.parse(JSON.stringify(item.card)))
    const text = JSON.stringify(reply.body)
    for (const secret of ['origin-secret', 'dest-secret', 'position-secret', 'adoption-secret'])
      expect(text).not.toContain(secret)
  })

  it('an option keeps the role its issuer gave it, and an option without one has none', async () => {
    const world = createWorld()
    const options = [
      { id: 'no', label: '本次不放行', description: '这一次调用不执行', role: 'reject' },
      { id: 'yes', label: '本次放行', description: '只执行这一次调用', role: 'approve' },
      { id: 'later', label: '再说', description: '没有角色' },
    ]
    const item = world.hitl.addCard({
      tenant: ALICE.tenant,
      cardId: 'card-1',
      readers: [world.holder.refOf(ALICE.tenant)],
      question: { options },
    })
    const ask = run(world)
    const read = await ask('read-card', ALICE, readBody(ALICE.tenantText, item.card.ref))
    const listed = await ask('list-cards', ALICE, listBody(ALICE))
    for (const question of [read.body.item.card.question, listed.body.items[0].card.question])
      expect(question.options).toEqual(options)
  })

  it('a card carries the moment its batch was registered as it was kept, and a card kept without one carries none', async () => {
    const world = createWorld()
    const readers = [world.holder.refOf(ALICE.tenant)]
    const timed = world.hitl.addCard({
      tenant: ALICE.tenant,
      cardId: 'card-1',
      readers,
      askedAt: '2026-11-21T08:30:00.000Z',
    })
    const old = world.hitl.addCard({ tenant: ALICE.tenant, cardId: 'card-2', readers })
    const ask = run(world)
    const read = async (card: unknown) =>
      (await ask('read-card', ALICE, readBody(ALICE.tenantText, card))).body.item
    expect((await read(timed.card.ref)).askedAt).toBe('2026-11-21T08:30:00.000Z')
    expect(await read(old.card.ref)).not.toHaveProperty('askedAt')
    const listed = (await ask('list-cards', ALICE, listBody(ALICE))).body.items
    expect(listed.map((each: { askedAt?: string }) => each.askedAt)).toEqual([
      '2026-11-21T08:30:00.000Z',
      undefined,
    ])
    expect(listed[1]).not.toHaveProperty('askedAt')
  })
})

describe('denied does not disclose', () => {
  it('another tenant, a card of another tenant, a missing card, a card the entry may not read and a rejection of HITL answer the same denied', async () => {
    const world = createWorld()
    const call = run(world)
    const item = world.hitl.addCard({
      tenant: ALICE.tenant,
      cardId: 'card-1',
      readers: [world.holder.refOf(ALICE.tenant)],
    })
    const ref = item.card.ref
    world.hitl.addCard({ tenant: ALICE.tenant, cardId: 'card-2', readers: ['someone-else'] })
    const answers = [
      await call('read-card', BOB, readBody(ALICE.tenantText, ref)),
      await call('read-card', BOB, readBody(BOB.tenantText, ref)),
      await call('read-card', ALICE, readBody(ALICE.tenantText, { ...ref, cardId: 'none' })),
      await call(
        'read-card',
        ALICE,
        readBody(ALICE.tenantText, {
          ...ref,
          request: { ...ref.request, requestId: 'request-card-2' },
          cardId: 'card-2',
        }),
      ),
    ]
    world.hitl.failNext('listPool', { kind: 'denied', reason: 'pool-location' })
    answers.push(await call('list-cards', ALICE, listBody(ALICE)))
    for (const answer of answers) expect(answer).toEqual({ outcome: 'denied' })
  })

  it('the tenant of another account is denied before the holder is asked', async () => {
    const world = createWorld()
    const answer = await run(world)('list-cards', BOB, listBody(ALICE))
    expect(answer).toEqual({ outcome: 'denied' })
    expect(world.holder.inputs).toEqual([])
    expect(world.hitl.calls).toEqual([])
  })
})

describe('a reply is submitted and found again', () => {
  async function withCard() {
    const world = createWorld()
    const call = run(world)
    const entryRef = world.holder.refOf(ALICE.tenant)
    const item = world.hitl.addCard({ tenant: ALICE.tenant, cardId: 'c1', readers: [entryRef] })
    const answer = (
      name: 'submit-reply' | 'query-submit-reply',
      who: FixtureLogin,
      overrides: object = {},
    ) => call(name, who, submission(ALICE, item.card.ref, overrides))
    return { world, entryRef, item, answer }
  }

  it('hands submitReply the entry principal and the derived operation identity, and decided is succeeded', async () => {
    const { world, entryRef, item, answer } = await withCard()
    const reply = await answer('submit-reply', ALICE)
    expect(reply).toMatchObject({
      outcome: 'succeeded',
      body: {
        kind: 'decided',
        revision: '1',
        delivery: 'pending',
        decisionRef: { card: item.card.ref },
      },
    })
    const submitted = world.hitl.calls.find(entry => entry.method === 'submitReply')
    expect(standingPrincipalRef(submitted!.principal)).toBe(entryRef)
    expect(submitted!.input).toEqual({
      protocol: 'hitl/1',
      operation: {
        tenantRef: ALICE.tenantText,
        actorRef: entryRef,
        operationId: hitlReplyIdentity(ALICE.tenantText, 'reply-1'),
      },
      cardRef: item.card.ref,
      expectedRevision: '0',
      reply: { kind: 'selection', optionId: 'yes' },
    })
  })

  it('the identity of a reply is the one the old location derived', () => {
    const tenantText = ALICE.tenantText
    expect(hitlReplyIdentity(tenantText, 'reply-1')).toBe(
      createHash('sha256')
        .update(JSON.stringify(['hitl-public/1-reply', tenantText, 'reply-1']))
        .digest('hex'),
    )
    expect(hitlReplyIdentity(tenantText, 'reply-1')).not.toBe(
      hitlReplyIdentity(tenantText, 'reply-2'),
    )
    expect(hitlReplyIdentity(tenantText, 'reply-1')).not.toBe(
      hitlReplyIdentity(BOB.tenantText, 'reply-1'),
    )
  })

  it('another login sending it again finds the same submission and its first result', async () => {
    const { world, answer } = await withCard()
    const first = await answer('submit-reply', ALICE)
    const second = await answer('submit-reply', ALICE_AGAIN)
    expect(second).toEqual(first)
    const operations = world.hitl.calls
      .filter(entry => entry.method === 'submitReply')
      .map(entry => (entry.input as { operation: unknown }).operation)
    expect(operations).toHaveLength(2)
    expect(operations[1]).toEqual(operations[0])
  })

  it('the same replyId with another content is a conflict; a new replyId on a decided card is already-decided', async () => {
    const { answer } = await withCard()
    await answer('submit-reply', ALICE)
    expect(await answer('submit-reply', ALICE, { reply: { kind: 'decline' } })).toEqual({
      outcome: 'conflict',
      body: {},
    })
    expect(await answer('submit-reply', ALICE, { replyId: 'reply-2' })).toMatchObject({
      outcome: 'succeeded',
      body: {
        kind: 'already-decided',
        decision: { reply: { kind: 'selection', optionId: 'yes' } },
      },
    })
  })

  it('query-submit-reply binds the same command, finds the first result, and an uncommitted submission is not-committed', async () => {
    const { world, answer } = await withCard()
    expect(await answer('query-submit-reply', ALICE)).toEqual({
      outcome: 'not-committed',
      body: {},
    })
    const submitted = await answer('submit-reply', ALICE)
    const queried = await answer('query-submit-reply', ALICE)
    expect(queried).toEqual(submitted)
    const bound = world.hitl.calls.filter(entry => entry.method === 'bindSubmitReply')
    const sent = world.hitl.calls.find(entry => entry.method === 'submitReply')
    expect(bound.at(-1)?.input).toEqual(sent?.input)
    expect(await answer('query-submit-reply', ALICE, { reply: { kind: 'decline' } })).toEqual({
      outcome: 'conflict',
      body: {},
    })
  })

  it.each([
    [
      { kind: 'invalid-input', reason: 'unknown-option' },
      { outcome: 'invalid', body: {} },
    ],
    [{ kind: 'denied', reason: 'card' }, { outcome: 'denied' }],
    [
      { kind: 'conflict', reason: 'revision-changed' },
      { outcome: 'conflict', body: {} },
    ],
    [{ kind: 'unavailable', reason: 'wait-unavailable' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'unknown' }, { outcome: 'unknown' }],
  ] as const)('submitReply answering %o is %o', async (failure, expected) => {
    const { world, answer } = await withCard()
    world.hitl.failNext('submitReply', failure)
    expect(await answer('submit-reply', ALICE)).toEqual(expected)
  })

  it('a throwing submitReply is unknown, not basis-unavailable', async () => {
    const { world, answer } = await withCard()
    world.hitl.failNext('submitReply', 'throw')
    expect(await answer('submit-reply', ALICE)).toEqual({ outcome: 'unknown' })
  })

  it.each(['getOperation', 'bindSubmitReply'] as const)(
    'a throwing %s makes query-submit-reply basis-unavailable',
    async method => {
      const { world, answer } = await withCard()
      world.hitl.failNext(method, 'throw')
      expect(await answer('query-submit-reply', ALICE)).toEqual({ outcome: 'basis-unavailable' })
    },
  )

  it('getOperation answering unknown makes query-submit-reply unknown', async () => {
    const { world, answer } = await withCard()
    world.hitl.failNext('getOperation', { kind: 'unknown' })
    expect(await answer('query-submit-reply', ALICE)).toEqual({ outcome: 'unknown' })
  })

  it('an identity held by another command makes query-submit-reply a conflict', async () => {
    const { world, answer } = await withCard()
    world.hitl.failNext('getOperation', { kind: 'held-by-register' })
    expect(await answer('query-submit-reply', ALICE)).toEqual({ outcome: 'conflict', body: {} })
  })
})

describe('the results and the faults of HITL', () => {
  it.each([
    [
      { kind: 'invalid-input', reason: 'cursor' },
      { outcome: 'invalid', body: {} },
    ],
    [
      { kind: 'limited', resource: 'pool-items', limit: 7 },
      { outcome: 'limited', body: { resource: 'pool-items', limit: 7 } },
    ],
    [
      { kind: 'conflict', reason: 'snapshot' },
      { outcome: 'conflict', body: {} },
    ],
    [{ kind: 'unavailable', reason: 'store' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'denied', reason: 'pool-location' }, { outcome: 'denied' }],
  ] as const)('listPool answering %o is %o', async (failure, expected) => {
    const world = createWorld()
    world.hitl.failNext('listPool', failure)
    expect(await run(world)('list-cards', ALICE, listBody(ALICE))).toEqual(expected)
  })

  it.each(['listPool', 'getCard'] as const)('a throwing %s is basis-unavailable', async method => {
    const world = createWorld()
    const call = run(world)
    world.hitl.failNext(method, 'throw')
    const answer =
      method === 'listPool'
        ? await call('list-cards', ALICE, listBody(ALICE))
        : await call('read-card', ALICE, readBody(ALICE.tenantText, missingCard(ALICE)))
    expect(answer).toEqual({ outcome: 'basis-unavailable' })
  })

  it('getCard has no conflict: a conflict-like failure of a read stays within the outcomes of read-card', async () => {
    const world = createWorld()
    world.hitl.failNext('getCard', { kind: 'limited', resource: 'cards', limit: 1 })
    expect(
      await run(world)('read-card', ALICE, readBody(ALICE.tenantText, missingCard(ALICE))),
    ).toEqual({ outcome: 'limited', body: { resource: 'cards', limit: 1 } })
  })

  it('without the faces every operation is basis-unavailable', async () => {
    const world = createWorld({ faces: false })
    const call = run(world)
    const card = missingCard(ALICE)
    const answers = [
      await call('list-cards', ALICE, listBody(ALICE)),
      await call('read-card', ALICE, readBody(ALICE.tenantText, card)),
      await call('submit-reply', ALICE, submission(ALICE, card)),
      await call('query-submit-reply', ALICE, submission(ALICE, card)),
    ]
    for (const answer of answers) expect(answer).toEqual({ outcome: 'basis-unavailable' })
    expect(world.hitl.calls).toEqual([])
  })
})

describe('the holder of the entry principal', () => {
  it.each([
    'refuse',
    'throw',
    'other-tenant',
    'other-component',
    'other-work-owner',
    'other-work',
    'not-acting',
    'actor-not-system',
    'no-principal',
  ] as const)(
    'a holder that %s makes the operation basis-unavailable and HITL is not called',
    async behaviour => {
      const world = createWorld()
      world.holder.next(behaviour, BOB.tenant)
      expect(await run(world)('list-cards', ALICE, listBody(ALICE))).toEqual({
        outcome: 'basis-unavailable',
      })
      expect(world.hitl.calls).toEqual([])
    },
  )

  it.each(['throw', 'basis-unavailable'] as const)(
    'when identity %ss the operation is basis-unavailable and the holder is not asked',
    async fault => {
      const world = createWorld()
      world.logins.down.value = fault
      expect(await run(world)('list-cards', ALICE, listBody(ALICE))).toEqual({
        outcome: 'basis-unavailable',
      })
      expect(world.holder.inputs).toEqual([])
      expect(world.hitl.calls).toEqual([])
    },
  )
})
