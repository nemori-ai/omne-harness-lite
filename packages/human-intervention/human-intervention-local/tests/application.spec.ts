import { randomBytes } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  SubmitReplySchema,
  BindReceiverSchema,
  ConsumeDecisionSchema,
  AcknowledgeDeliverySchema,
  InvalidateWaitSchema,
  GetOperationSchema,
  GetRequestSchema,
  RegisterRequestSchema,
  GetWaitSchema,
  ReadInboxSchema,
  ListDeliveriesSchema,
  ListPoolSchema,
  HITL_COMMAND_MAX_BYTES,
  GetCardSchema,
} from '@omne-harness/human-intervention'
import {
  createIndependentHitlApplication,
  hitlCommandBinding,
  recoveryCommandBinding,
} from '@omne-harness/human-intervention-local'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { canonical, operationKey } from '../src/encoding.ts'
import { openIdentityWorld } from './identity-world.ts'

const worlds: Awaited<ReturnType<typeof openIdentityWorld>>[] = []
const applications: ReturnType<typeof createIndependentHitlApplication>[] = []
afterEach(async () => {
  for (const app of applications.splice(0)) await app.close()
  for (const world of worlds.splice(0)) await world.close()
})
async function open(
  wrap?: (storage: SqlStorage) => SqlStorage,
  cards = 1,
  options: Parameters<typeof openIdentityWorld>[0] = {},
) {
  const w = await openIdentityWorld({ ...options, cards })
  worlds.push(w)
  const app = createIndependentHitlApplication({
    ...w.terminalOptions,
    storage: wrap?.(w.world.storage) ?? w.world.storage,
    destination: w.destination,
    required: [],
    locationRef: 'local',
    cursorKey: randomBytes(32),
    identity: {
      verifier: w.authority.verifier,
      standing: w.identity.standing,
      reservations: w.identity.reservations,
    },
  })
  applications.push(app)
  return { ...w, app }
}
async function register(w: Awaited<ReturnType<typeof open>>) {
  const registered = await w.app.registerRequest(w.principal, w.request)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  return registered
}
function bind(w: Awaited<ReturnType<typeof open>>, id = 'bind', generation = '0') {
  return BindReceiverSchema.parse({
    protocol: 'hitl/1',
    operation: w.operation(id),
    waitRef: w.request.origin.wait,
    expectedGeneration: generation,
    instanceId: id,
    implementationRef: 'v1',
  })
}
function operationQuery(binding: ReturnType<typeof hitlCommandBinding>) {
  return GetOperationSchema.parse({ protocol: 'hitl/1', ...binding })
}

it('registers, routes a reply, restores the receiver, consumes and acknowledges through public methods', async () => {
  const w = await open(),
    registered = await register(w)
  const waitQuery = GetWaitSchema.parse({ protocol: 'hitl/1', waitRef: w.request.origin.wait })
  expect(await w.app.getWait(w.principal, waitQuery)).toMatchObject({
    kind: 'found',
    wait: { state: 'waiting' },
  })
  const cardRef = registered.cards[0]
  const reply = SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('reply'),
    cardRef,
    expectedRevision: registered.revision,
    reply: { kind: 'selection', optionId: 'yes' },
  })
  const decided = await w.app.submitReply(w.principal, reply)
  if (decided.kind !== 'decided') throw new Error(JSON.stringify(decided))
  expect(await w.app.submitReply(w.principal, reply)).toEqual(decided)
  expect(await w.app.getWait(w.principal, waitQuery)).toMatchObject({
    kind: 'found',
    wait: { state: 'replied' },
  })
  const deliveryQuery = ListDeliveriesSchema.parse({
    protocol: 'hitl/1',
    destination: w.destination,
    limit: 10,
  })
  expect(await w.app.listDeliveries(w.principal, deliveryQuery)).toMatchObject({
    kind: 'page',
    items: [{ decision: { ref: decided.decisionRef } }],
  })
  expect(
    await w.app.getOperation(w.principal, operationQuery(hitlCommandBinding('submitReply', reply))),
  ).toMatchObject({ kind: 'committed', method: 'submitReply', result: decided })
  const binding = bind(w)
  const bound = await w.app.bindReceiver(w.principal, binding)
  if (bound.kind !== 'bound') throw new Error(JSON.stringify(bound))
  expect(
    await w.app.getRecoveryOperation(
      w.principal,
      operationQuery(recoveryCommandBinding('bindReceiver', binding)),
    ),
  ).toMatchObject({ kind: 'committed', method: 'bindReceiver', result: bound })
  const consume = ConsumeDecisionSchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('consume'),
    waitRef: w.request.origin.wait,
    receiverGeneration: bound.receiverGeneration,
    decisionRef: decided.decisionRef,
    consumeOperationId: 'consume',
  })
  const accepted = await w.app.consumeDecision(w.principal, consume)
  if (accepted.kind !== 'accepted') throw new Error(JSON.stringify(accepted))
  expect(await w.app.getWait(w.principal, waitQuery)).toMatchObject({
    kind: 'found',
    wait: { state: 'accepted', receipts: [accepted.receipt] },
  })
  expect(await w.app.listDeliveries(w.principal, deliveryQuery)).toMatchObject({
    kind: 'page',
    items: [],
    next: null,
  })
  const acknowledge = AcknowledgeDeliverySchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('ack'),
    consumerReceipt: accepted.receipt,
  })
  expect(await w.app.acknowledgeDelivery(w.principal, acknowledge)).toMatchObject({
    kind: 'acknowledged',
    outcome: 'accepted',
  })
  expect(
    await w.app.getRequest(
      w.principal,
      GetRequestSchema.parse({ protocol: 'hitl/1', requestRef: registered.requestRef }),
    ),
  ).toMatchObject({
    kind: 'found',
    request: { cards: [{ kind: 'decided', delivery: { kind: 'accepted' } }] },
  })
})

it('recovers the exact registered result after a lost commit response without allocating another operation', async () => {
  let lost = false
  const w = await open(storage => ({
    ...storage,
    async commit(input) {
      const result = await storage.commit(input)
      if (input.identity.operation === 'hitl.command' && !lost) {
        lost = true
        throw new Error('lost response')
      }
      return result
    },
  }))
  const binding = hitlCommandBinding('registerRequest', w.request)
  expect(await w.app.registerRequest(w.principal, w.request)).toEqual({
    kind: 'unknown',
    operationRef: w.request.operation,
  })
  const found = await w.app.getOperation(w.principal, operationQuery(binding))
  if (found.kind !== 'committed') throw new Error(JSON.stringify(found))
  expect(found.method).toBe('registerRequest')
  expect(await w.app.registerRequest(w.principal, w.request)).toEqual(found.result)
})

it('separates original HITL and recovery operation families', async () => {
  const w = await open()
  await register(w)
  expect(
    await w.app.getRecoveryOperation(
      w.principal,
      operationQuery(hitlCommandBinding('registerRequest', w.request)),
    ),
  ).toMatchObject({ kind: 'conflict', reason: 'operation-method' })
  const command = bind(w)
  expect(await w.app.bindReceiver(w.principal, command)).toMatchObject({ kind: 'bound' })
  expect(
    await w.app.getOperation(
      w.principal,
      operationQuery(recoveryCommandBinding('bindReceiver', command)),
    ),
  ).toMatchObject({ kind: 'conflict', reason: 'operation-method' })
})

it('keeps cancellation durable and rejects old receiver consumption', async () => {
  const w = await open(),
    registered = await register(w)
  const reply = SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('reply'),
    cardRef: registered.cards[0],
    expectedRevision: registered.revision,
    reply: { kind: 'text', text: 'continue' },
  })
  const result = await w.app.submitReply(w.principal, reply)
  if (result.kind !== 'decided') throw new Error(JSON.stringify(result))
  expect(await w.app.bindReceiver(w.principal, bind(w))).toMatchObject({
    kind: 'bound',
    receiverGeneration: '1',
  })
  expect(await w.app.bindReceiver(w.principal, bind(w, 'replacement', '1'))).toMatchObject({
    kind: 'bound',
    receiverGeneration: '2',
  })
  const old = ConsumeDecisionSchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('old'),
    waitRef: w.request.origin.wait,
    receiverGeneration: '1',
    decisionRef: result.decisionRef,
    consumeOperationId: 'old',
  })
  expect(await w.app.consumeDecision(w.principal, old)).toMatchObject({ kind: 'stale-generation' })
  const cancel = InvalidateWaitSchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('cancel'),
    waitRef: w.request.origin.wait,
    terminalEvidenceRef: 'cancelled-by-owner',
    reason: 'cancelled',
  })
  expect(await w.app.invalidateWait(w.principal, cancel)).toMatchObject({
    kind: 'invalidated',
    affected: 0,
  })
  expect(
    await w.app.consumeDecision(
      w.principal,
      ConsumeDecisionSchema.parse({
        ...old,
        operation: w.operation('terminal-consume'),
        consumeOperationId: 'terminal-consume',
        receiverGeneration: '2',
      }),
    ),
  ).toMatchObject({ kind: 'superseded' })
})

it('rejects invented reply routing and revoked callers with the original operation identity', async () => {
  const w = await open(),
    registered = await register(w)
  const command = SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('reply'),
    cardRef: registered.cards[0],
    expectedRevision: registered.revision,
    reply: { kind: 'selection', optionId: 'yes' },
  })
  const withInventedRoute = { ...command, waitRef: w.request.origin.wait }
  expect(await w.app.submitReply(w.principal, withInventedRoute)).toMatchObject({
    kind: 'invalid-input',
    operationRef: command.operation,
  })
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(await w.app.submitReply(w.principal, command)).toMatchObject({
    kind: 'denied',
    operationRef: command.operation,
  })
  expect(await w.app.registerRequest(w.principal, w.request)).toMatchObject({
    kind: 'denied',
    operationRef: w.request.operation,
  })
  expect(
    await w.app.getOperation(
      w.principal,
      operationQuery(hitlCommandBinding('registerRequest', w.request)),
    ),
  ).toMatchObject({ kind: 'denied' })
})

it('rejects new writes on close and drains a write already admitted before closing children', async () => {
  const reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const w = await open(storage => ({
    ...storage,
    async commit(input) {
      if (input.identity.operation === 'hitl.command') {
        reached.resolve()
        await release.promise
      }
      return storage.commit(input)
    },
  }))
  const pending = w.app.registerRequest(w.principal, w.request)
  await reached.promise
  let closed = false
  const closing = w.app.close().then(() => {
    closed = true
  })
  try {
    expect(await w.app.registerRequest(w.principal, w.request)).toMatchObject({
      kind: 'unavailable',
      operationRef: w.request.operation,
    })
    expect(closed).toBe(false)
  } finally {
    release.resolve()
  }
  expect(await pending).toMatchObject({ kind: 'registered' })
  await closing
  expect(await w.backend.inspect(w.principal, w.binding)).toMatchObject({ kind: 'committed' })
})

it('applies the public command byte budget independently of local routing envelopes', async () => {
  const w = await open()
  const questions = Array.from({ length: 64 }, (_, index) => ({
    ...w.request.questions[0],
    cardId: `card-${index}`,
    description: 'x'.repeat(4096),
  }))
  let candidate = { ...w.request, questions }
  let excess = Buffer.byteLength(canonical(candidate), 'utf8') - HITL_COMMAND_MAX_BYTES
  for (const question of questions) {
    if (excess <= 0) break
    const removed = Math.min(excess, question.description.length - 1)
    question.description = question.description.slice(removed)
    excess -= removed
  }
  const atLimit = RegisterRequestSchema.parse(candidate)
  expect(Buffer.byteLength(canonical(atLimit), 'utf8')).toBe(HITL_COMMAND_MAX_BYTES)
  // This valid-sized command differs from the prepared original; it must reach the owner's binding check.
  expect(await w.app.registerRequest(w.principal, atLimit)).toMatchObject({ kind: 'conflict' })
  candidate = { ...candidate, displayContext: candidate.displayContext + 'x' }
  expect(await w.app.registerRequest(w.principal, RegisterRequestSchema.parse(candidate))).toEqual({
    kind: 'limited',
    resource: 'command-bytes',
    limit: HITL_COMMAND_MAX_BYTES,
    operationRef: w.request.operation,
  })
})

it('pages a durable inbox and destination without consuming and fences old receiver cursors', async () => {
  const w = await open(undefined, 3),
    registered = await register(w)
  for (const card of registered.cards) {
    const command = SubmitReplySchema.parse({
      protocol: 'hitl/1',
      operation: w.operation(`reply-${card.cardId}`),
      cardRef: card,
      expectedRevision: registered.revision,
      reply: { kind: 'selection', optionId: 'yes' },
    })
    expect(await w.app.submitReply(w.principal, command)).toMatchObject({ kind: 'decided' })
  }
  expect(await w.app.bindReceiver(w.principal, bind(w))).toMatchObject({
    kind: 'bound',
    receiverGeneration: '1',
  })
  const query = ReadInboxSchema.parse({
    protocol: 'hitl/1',
    waitRef: w.request.origin.wait,
    receiverGeneration: '1',
    limit: 1,
  })
  const first = await w.app.readInbox(w.principal, query)
  if (first.kind !== 'page' || !first.next) throw new Error(JSON.stringify(first))
  const second = await w.app.readInbox(
    w.principal,
    ReadInboxSchema.parse({ ...query, cursor: first.next, limit: 100 }),
  )
  expect(second).toMatchObject({ kind: 'page', next: null })
  if (second.kind !== 'page') throw new Error('Expected second page')
  expect([...first.decisions, ...second.decisions].map(d => d.decision.ref.card.cardId)).toEqual([
    'answer',
    'answer-1',
    'answer-2',
  ])
  expect(
    await w.app.getWait(
      w.principal,
      GetWaitSchema.parse({ protocol: 'hitl/1', waitRef: w.request.origin.wait }),
    ),
  ).toMatchObject({ kind: 'found', wait: { state: 'replied' } })
  const deliveries = ListDeliveriesSchema.parse({
    protocol: 'hitl/1',
    destination: w.destination,
    limit: 1,
  })
  const page = await w.app.listDeliveries(w.principal, deliveries)
  if (page.kind !== 'page' || !page.next) throw new Error(JSON.stringify(page))
  const rest = await w.app.listDeliveries(
    w.principal,
    ListDeliveriesSchema.parse({ ...deliveries, after: page.next, limit: 100 }),
  )
  if (rest.kind !== 'page') throw new Error(JSON.stringify(rest))
  expect([...page.items, ...rest.items].map(d => d.decision.ref.card.cardId)).toEqual([
    'answer',
    'answer-1',
    'answer-2',
  ])
  expect(rest.next).toBeNull()
  expect(
    await w.app.listDeliveries(
      w.principal,
      ListDeliveriesSchema.parse({ ...deliveries, after: first.next }),
    ),
  ).toMatchObject({ kind: 'invalid-input' })
  expect(await w.app.bindReceiver(w.principal, bind(w, 'replacement', '1'))).toMatchObject({
    kind: 'bound',
    receiverGeneration: '2',
  })
  expect(
    await w.app.readInbox(w.principal, ReadInboxSchema.parse({ ...query, cursor: first.next })),
  ).toMatchObject({ kind: 'stale-generation' })
  expect(
    await w.app.readInbox(
      w.principal,
      ReadInboxSchema.parse({ ...query, receiverGeneration: '2', cursor: first.next }),
    ),
  ).toMatchObject({ kind: 'invalid-input' })
})

it('restricts original wait and destination reads to their current audience and consumer', async () => {
  const w = await open(),
    registered = await register(w)
  const reply = SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('reply'),
    cardRef: registered.cards[0],
    expectedRevision: registered.revision,
    reply: { kind: 'decline' },
  })
  expect(await w.app.submitReply(w.principal, reply)).toMatchObject({ kind: 'decided' })
  const issued = w.authority.issuer.issueActingForTenant({
    actor: w.principal.actor,
    tenant: w.principal.tenant,
    work: { owner: 'human-intervention', work: 'outsider' },
  })
  if (!('ok' in issued)) throw new Error('Fixture principal')
  const query = GetWaitSchema.parse({ protocol: 'hitl/1', waitRef: w.request.origin.wait })
  expect(await w.app.getWait(issued.ok, query)).toMatchObject({ kind: 'denied' })
  expect(
    await w.app.readInbox(
      issued.ok,
      ReadInboxSchema.parse({ ...query, receiverGeneration: '0', limit: 1 }),
    ),
  ).toMatchObject({ kind: 'denied' })
  const delivery = ListDeliveriesSchema.parse({
    protocol: 'hitl/1',
    destination: w.destination,
    limit: 1,
  })
  expect(await w.app.listDeliveries(issued.ok, delivery)).toMatchObject({ kind: 'page', items: [] })
  expect(
    await w.app.listDeliveries(w.principal, { ...delivery, destination: 'another-service' }),
  ).toMatchObject({ kind: 'denied' })
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(await w.app.getWait(w.principal, query)).toMatchObject({ kind: 'denied' })
  expect(await w.app.listDeliveries(w.principal, delivery)).toMatchObject({ kind: 'denied' })
})

it('keeps all cards answerable and recoverable when a legal batch accumulates large replies', async () => {
  const w = await open(undefined, 64),
    registered = await register(w)
  for (const cardRef of registered.cards) {
    const reply = SubmitReplySchema.parse({
      protocol: 'hitl/1',
      operation: w.operation(`reply-${cardRef.cardId}`),
      cardRef,
      expectedRevision: registered.revision,
      reply: { kind: 'text', text: '😀'.repeat(8192) },
    })
    const actual = await w.app.submitReply(w.principal, reply)
    if (actual.kind !== 'decided')
      throw new Error(
        JSON.stringify({
          card: cardRef.cardId,
          actual,
          operation: await w.world.storage.query({
            ...w.world.combination,
            operation: 'hitl.command',
            protocolVersion: '2',
            operationKey: operationKey(reply.operation),
          }),
        }),
      )
  }
  expect(await w.app.bindReceiver(w.principal, bind(w))).toMatchObject({
    kind: 'bound',
    receiverGeneration: '1',
  })
  const inbox = await w.app.readInbox(
    w.principal,
    ReadInboxSchema.parse({
      protocol: 'hitl/1',
      waitRef: w.request.origin.wait,
      receiverGeneration: '1',
      limit: 100,
    }),
  )
  if (inbox.kind !== 'page') throw new Error(JSON.stringify(inbox))
  expect(inbox.decisions).toHaveLength(64)
  const deliveries = await w.app.listDeliveries(
    w.principal,
    ListDeliveriesSchema.parse({ protocol: 'hitl/1', destination: w.destination, limit: 100 }),
  )
  if (deliveries.kind !== 'page') throw new Error(JSON.stringify(deliveries))
  expect(deliveries.items).toHaveLength(64)
  const pool = await w.app.listPool(
    w.principal,
    ListPoolSchema.parse({
      protocol: 'hitl/1',
      tenantRef: w.request.operation.tenantRef,
      locationRef: 'local',
      filter: { states: ['decided'] },
      limit: 100,
    }),
  )
  if (pool.kind !== 'page') throw new Error(JSON.stringify(pool))
  expect(pool.items).toHaveLength(64)
  expect(
    await w.app.getWait(
      w.principal,
      GetWaitSchema.parse({ protocol: 'hitl/1', waitRef: w.request.origin.wait }),
    ),
  ).toMatchObject({ kind: 'found', wait: { state: 'replied' } })
}, 30000)

it('settles a terminal decision before the first receiver binding at the current generation', async () => {
  const w = await open(),
    registered = await register(w)
  const decided = await w.app.submitReply(
    w.principal,
    SubmitReplySchema.parse({
      protocol: 'hitl/1',
      operation: w.operation('reply-before-bind'),
      cardRef: registered.cards[0],
      expectedRevision: registered.revision,
      reply: { kind: 'text', text: 'saved before cancellation' },
    }),
  )
  if (decided.kind !== 'decided') throw new Error(JSON.stringify(decided))
  const consume = ConsumeDecisionSchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('live-unbound'),
    waitRef: w.request.origin.wait,
    receiverGeneration: '0',
    decisionRef: decided.decisionRef,
    consumeOperationId: 'live-unbound',
  })
  expect(await w.app.consumeDecision(w.principal, consume)).toMatchObject({
    kind: 'stale-generation',
  })
  expect(
    await w.app.invalidateWait(
      w.principal,
      InvalidateWaitSchema.parse({
        protocol: 'hitl/1',
        operation: w.operation('cancel-before-bind'),
        waitRef: w.request.origin.wait,
        terminalEvidenceRef: 'owner-cancel',
        reason: 'cancelled',
      }),
    ),
  ).toMatchObject({ kind: 'invalidated' })
  expect(await w.app.bindReceiver(w.principal, bind(w))).toMatchObject({ kind: 'terminal' })
  const wrongGeneration = ConsumeDecisionSchema.parse({
    ...consume,
    operation: w.operation('wrong-generation'),
    consumeOperationId: 'wrong-generation',
    receiverGeneration: '1',
  })
  expect(await w.app.consumeDecision(w.principal, wrongGeneration)).toMatchObject({
    kind: 'stale-generation',
  })
  const wrongDecision = ConsumeDecisionSchema.parse({
    ...consume,
    operation: w.operation('wrong-decision'),
    consumeOperationId: 'wrong-decision',
    decisionRef: { ...consume.decisionRef, decisionId: 'not-original' },
  })
  expect(await w.app.consumeDecision(w.principal, wrongDecision)).toMatchObject({
    kind: 'conflict',
    reason: 'decision-not-delivered',
  })
  const outsider = w.authority.issuer.issueActingForTenant({
    actor: w.principal.actor,
    tenant: w.principal.tenant,
    work: { owner: 'human-intervention', work: 'outsider' },
  })
  if (!('ok' in outsider)) throw new Error('Fixture principal')
  expect(await w.app.consumeDecision(outsider.ok, consume)).toMatchObject({ kind: 'denied' })
  const terminalConsume = ConsumeDecisionSchema.parse({
    ...consume,
    operation: w.operation('terminal-unbound'),
    consumeOperationId: 'terminal-unbound',
  })
  const accepted = await w.app.consumeDecision(w.principal, terminalConsume)
  expect(accepted.kind).toBe('superseded')
  if (accepted.kind !== 'superseded') throw new Error(JSON.stringify(accepted))
  expect(await w.app.consumeDecision(w.principal, terminalConsume)).toEqual(accepted)
  expect(
    await w.app.getRecoveryOperation(
      w.principal,
      operationQuery(recoveryCommandBinding('consumeDecision', terminalConsume)),
    ),
  ).toMatchObject({ kind: 'committed', method: 'consumeDecision', result: accepted })
  expect(
    await w.app.getWait(
      w.principal,
      GetWaitSchema.parse({
        protocol: 'hitl/1',
        waitRef: w.request.origin.wait,
      }),
    ),
  ).toMatchObject({
    kind: 'found',
    wait: {
      state: 'terminal',
      receiverGeneration: '0',
      terminalEvidenceRef: 'owner-cancel',
    },
  })
  expect(
    await w.app.listDeliveries(
      w.principal,
      ListDeliveriesSchema.parse({
        protocol: 'hitl/1',
        destination: w.destination,
        limit: 10,
      }),
    ),
  ).toMatchObject({ kind: 'page', items: [], next: null })
})

it.each([
  ['leading NUL', '\0start'],
  ['middle NUL', 'mid\0dle'],
  ['trailing NUL', 'end\0'],
  ['NUL boundary', '\0'.repeat(8192)],
  ['escapes and Unicode', '"\\\n\t😀'],
])('preserves legal reply text through SQLite: %s', async (_name, text) => {
  const w = await open(),
    registered = await register(w)
  const decided = await w.app.submitReply(
    w.principal,
    SubmitReplySchema.parse({
      protocol: 'hitl/1',
      operation: w.operation('reply'),
      cardRef: registered.cards[0],
      expectedRevision: registered.revision,
      reply: { kind: 'text', text },
    }),
  )
  expect(decided.kind).toBe('decided')
  expect(
    await w.app.getRequest(
      w.principal,
      GetRequestSchema.parse({
        protocol: 'hitl/1',
        requestRef: registered.requestRef,
      }),
    ),
  ).toMatchObject({
    kind: 'found',
    request: { cards: [{ kind: 'decided', decision: { reply: { kind: 'text', text } } }] },
  })
  expect(
    await w.app.listDeliveries(
      w.principal,
      ListDeliveriesSchema.parse({
        protocol: 'hitl/1',
        destination: w.destination,
        limit: 10,
      }),
    ),
  ).toMatchObject({ kind: 'page', items: [{ decision: { reply: { kind: 'text', text } } }] })
})

it.each(['\ud800', '\udfff'])(
  'returns invalid-input for parsed malformed Unicode before canonical encoding: %j',
  async text => {
    const w = await open(),
      registered = await register(w)
    const cardRef = registered.cards[0]
    if (!cardRef) throw new Error('Missing card')
    expect(
      await w.app.submitReply(w.principal, {
        protocol: 'hitl/1',
        operation: w.operation('invalid-unicode'),
        cardRef,
        expectedRevision: registered.revision,
        reply: { kind: 'text', text },
      }),
    ).toMatchObject({ kind: 'invalid-input' })
    expect(
      await w.app.getRequest(
        w.principal,
        GetRequestSchema.parse({
          protocol: 'hitl/1',
          requestRef: registered.requestRef,
        }),
      ),
    ).toMatchObject({ kind: 'found', request: { cards: [{ kind: 'pending' }] } })
  },
)

it('keeps NUL identifiers distinct across register, query, selection, consumption and acknowledgement', async () => {
  const cardIds = ['card\0a', 'card\0b']
  const w = await open(undefined, 2, {
    destination: 'inbox\0destination',
    transformRegistration(request) {
      return RegisterRequestSchema.parse({
        ...request,
        operation: { ...request.operation, operationId: 'register\0original' },
        preparationRef: 'prepared\0original',
        displayContext: '\0display \n😀',
        origin: {
          ...request.origin,
          originRef: 'origin\0ref',
          positionRef: 'step\0ref',
          adoptionRef: 'adoption\0ref',
          wait: {
            ...request.origin.wait,
            owner: 'owner\0name',
            waitId: 'wait\0id',
            incarnation: 'incarnation\0one',
          },
        },
        questions: request.questions.map((question, index) => ({
          ...question,
          cardId: cardIds[index],
          title: '\0title',
          description: 'description\0',
          options: [{ id: 'option\0yes', label: 'label\0', description: 'description\0' }],
        })),
      })
    },
  })
  const registered = await register(w)
  expect(registered.cards.map(card => card.cardId)).toEqual(cardIds)
  for (const card of registered.cards) {
    expect(
      await w.app.getCard(w.principal, GetCardSchema.parse({ protocol: 'hitl/1', cardRef: card })),
    ).toMatchObject({ kind: 'found', item: { card: { ref: card } } })
    const reply = SubmitReplySchema.parse({
      protocol: 'hitl/1',
      operation: w.operation(`reply\0${card.cardId}`),
      cardRef: card,
      expectedRevision: registered.revision,
      reply: { kind: 'selection', optionId: 'option\0yes' },
    })
    const decided = await w.app.submitReply(w.principal, reply)
    if (decided.kind !== 'decided') throw new Error(JSON.stringify(decided))
    expect(decided.decisionRef.submission).toEqual(reply.operation)
  }
  const bound = await w.app.bindReceiver(w.principal, bind(w, 'instance\0id'))
  if (bound.kind !== 'bound') throw new Error(JSON.stringify(bound))
  const deliveryQuery = ListDeliveriesSchema.parse({
    protocol: 'hitl/1',
    destination: w.destination,
    limit: 10,
  })
  const pending = await w.app.listDeliveries(w.principal, deliveryQuery)
  if (pending.kind !== 'page') throw new Error(JSON.stringify(pending))
  expect(pending.items.map(item => item.decision.ref.card.cardId)).toEqual(cardIds)
  for (const item of pending.items) {
    expect(item).toMatchObject({
      wait: w.request.origin.wait,
      positionRef: w.request.origin.positionRef,
      adoptionRef: w.request.origin.adoptionRef,
      decision: { reply: { kind: 'selection', optionId: 'option\0yes' } },
    })
    const operation = w.operation(`consume\0${item.decision.ref.card.cardId}`)
    const accepted = await w.app.consumeDecision(
      w.principal,
      ConsumeDecisionSchema.parse({
        protocol: 'hitl/1',
        operation,
        consumeOperationId: operation.operationId,
        waitRef: w.request.origin.wait,
        receiverGeneration: bound.receiverGeneration,
        decisionRef: item.decision.ref,
      }),
    )
    if (accepted.kind !== 'accepted') throw new Error(JSON.stringify(accepted))
    expect(accepted.receipt.consumeOperationId).toBe(operation.operationId)
    expect(
      await w.app.acknowledgeDelivery(
        w.principal,
        AcknowledgeDeliverySchema.parse({
          protocol: 'hitl/1',
          operation: w.operation(`ack\0${item.decision.ref.card.cardId}`),
          consumerReceipt: accepted.receipt,
        }),
      ),
    ).toMatchObject({ kind: 'acknowledged' })
  }
  expect(await w.app.listDeliveries(w.principal, deliveryQuery)).toMatchObject({
    kind: 'page',
    items: [],
  })
  expect(
    await w.app.getRequest(
      w.principal,
      GetRequestSchema.parse({ protocol: 'hitl/1', requestRef: registered.requestRef }),
    ),
  ).toMatchObject({
    kind: 'found',
    request: {
      origin: w.request.origin,
      displayContext: w.request.displayContext,
      cards: cardIds.map(cardId => ({
        ref: { cardId },
        kind: 'decided',
        delivery: { kind: 'accepted' },
      })),
    },
  })
})
