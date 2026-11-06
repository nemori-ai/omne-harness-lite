import { randomBytes } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  GetRequestSchema,
  GetCardSchema,
  ListPoolSchema,
  RequestRefSchema,
} from '@omne-harness/human-intervention'
import {
  createIndependentHitlQueries,
  IndependentCommandSchema,
  independentControlCommands,
} from '@omne-harness/human-intervention-local'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { operationKey } from '../src/encoding.ts'
import { openIdentityWorld } from './identity-world.ts'

const worlds: Awaited<ReturnType<typeof openIdentityWorld>>[] = []
const services: ReturnType<typeof createIndependentHitlQueries>[] = []
afterEach(async () => {
  for (const service of services.splice(0)) await service.close()
  for (const world of worlds.splice(0)) await world.close()
})
async function open() {
  const world = await openIdentityWorld({ cards: 3 })
  worlds.push(world)
  const registered = await world.backend.execute(world.principal, world.command)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  return { ...world, registered }
}
function queries(
  w: Awaited<ReturnType<typeof open>>,
  storage: SqlStorage = w.world.storage,
  key = randomBytes(32),
) {
  const service = createIndependentHitlQueries({
    ...w.terminalOptions,
    storage,
    destination: w.destination,
    required: [],
    locationRef: 'local',
    cursorKey: key,
    identity: {
      verifier: w.authority.verifier,
      standing: w.identity.standing,
      reservations: w.identity.reservations,
    },
  })
  services.push(service)
  return service
}
function pool(w: Awaited<ReturnType<typeof open>>, input: object = {}) {
  return ListPoolSchema.parse({
    protocol: 'hitl/1',
    tenantRef: w.request.operation.tenantRef,
    locationRef: 'local',
    limit: 1,
    ...input,
  })
}
function get(w: Awaited<ReturnType<typeof open>>) {
  return GetRequestSchema.parse({ protocol: 'hitl/1', requestRef: w.registered.requestRef })
}
async function reply(w: Awaited<ReturnType<typeof open>>) {
  const command = IndependentCommandSchema.parse({
    kind: 'request',
    waitRef: w.request.origin.wait,
    input: {
      method: 'submitReply',
      command: {
        protocol: 'hitl/1',
        operation: w.operation('reply'),
        cardRef: w.registered.cards[0],
        expectedRevision: w.registered.revision,
        reply: { kind: 'selection', optionId: 'yes' },
      },
    },
  })
  if (command.kind !== 'request') throw new Error('Expected request')
  expect(await w.backend.execute(w.principal, command)).toMatchObject({ kind: 'decided' })
}

it('reads original requests and cards and pages each card exactly once with a restart-stable key', async () => {
  const w = await open(),
    key = randomBytes(32),
    first = queries(w, w.world.storage, key)
  expect(await first.getRequest(w.principal, get(w))).toMatchObject({
    kind: 'found',
    request: {
      ref: w.registered.requestRef,
      displayContext: w.request.displayContext,
      cards: [{ kind: 'pending' }, { kind: 'pending' }, { kind: 'pending' }],
    },
  })
  expect(
    await first.getCard(
      w.principal,
      GetCardSchema.parse({ protocol: 'hitl/1', cardRef: w.registered.cards[0] }),
    ),
  ).toMatchObject({ kind: 'found', item: { card: { ref: w.registered.cards[0] } } })
  const page = await first.listPool(w.principal, pool(w))
  if (page.kind !== 'page' || !page.next) throw new Error(JSON.stringify(page))
  expect(page.items.map(x => x.card.ref.cardId)).toEqual(['answer'])
  expect(page.next.length).toBeLessThanOrEqual(256)
  await first.close()
  const second = queries(w, w.world.storage, key)
  const middle = await second.listPool(w.principal, pool(w, { cursor: page.next }))
  if (middle.kind !== 'page' || !middle.next) throw new Error(JSON.stringify(middle))
  expect(middle.items.map(x => x.card.ref.cardId)).toEqual(['answer-1'])
  expect(middle.snapshotRef).toEqual(page.snapshotRef)
  const last = await second.listPool(w.principal, pool(w, { cursor: middle.next }))
  expect(last).toMatchObject({
    kind: 'page',
    next: null,
    completeness: 'complete',
    items: [{ card: { ref: { cardId: 'answer-2' } } }],
  })
})

it('binds a pool cursor to location, filters and its signing key and rejects tampering', async () => {
  const w = await open(),
    service = queries(w)
  const page = await service.listPool(w.principal, pool(w))
  if (page.kind !== 'page' || !page.next) throw new Error('Expected next')
  expect(
    await service.listPool(w.principal, pool(w, { cursor: page.next, locationRef: 'other' })),
  ).toMatchObject({ kind: 'denied' })
  expect(
    await service.listPool(
      w.principal,
      pool(w, { cursor: page.next, filter: { states: ['decided'] } }),
    ),
  ).toMatchObject({ kind: 'invalid-input' })
  expect(
    await service.listPool(w.principal, pool(w, { cursor: page.next.slice(1) })),
  ).toMatchObject({ kind: 'invalid-input' })
  expect(await queries(w).listPool(w.principal, pool(w, { cursor: page.next }))).toMatchObject({
    kind: 'invalid-input',
  })
})

it('rejects stale pages after a reply and returns fresh pending and decided projections', async () => {
  const w = await open(),
    service = queries(w)
  const page = await service.listPool(w.principal, pool(w))
  if (page.kind !== 'page' || !page.next) throw new Error('Expected next')
  await reply(w)
  expect(await service.listPool(w.principal, pool(w, { cursor: page.next }))).toEqual({
    kind: 'conflict',
    reason: 'pool-snapshot-changed',
  })
  const pending = await service.listPool(w.principal, pool(w, { limit: 100 }))
  expect(pending).toMatchObject({
    kind: 'page',
    items: [{ card: { ref: { cardId: 'answer-1' } } }, { card: { ref: { cardId: 'answer-2' } } }],
  })
  expect(
    await service.listPool(
      w.principal,
      pool(w, { filter: { states: ['decided'], delivery: 'pending' } }),
    ),
  ).toMatchObject({
    kind: 'page',
    items: [{ card: { kind: 'decided', ref: { cardId: 'answer' } } }],
  })
})

it('does not reveal private or absent requests to another issued principal, or allow its cursor reuse', async () => {
  const w = await open(),
    service = queries(w)
  const issued = w.authority.issuer.issueActingForTenant({
    actor: w.principal.actor,
    tenant: w.principal.tenant,
    work: { owner: 'human-intervention', work: 'different-reader' },
  })
  if (!('ok' in issued)) throw new Error('Fixture principal')
  const absent = GetRequestSchema.parse({
    ...get(w),
    requestRef: { ...w.registered.requestRef, requestId: 'absent' },
  })
  expect(await service.getRequest(issued.ok, get(w))).toEqual(
    await service.getRequest(issued.ok, absent),
  )
  expect(await service.listPool(issued.ok, pool(w))).toMatchObject({
    kind: 'page',
    items: [],
    next: null,
  })
  const page = await service.listPool(w.principal, pool(w))
  if (page.kind !== 'page' || !page.next) throw new Error('Expected next')
  expect(await service.listPool(issued.ok, pool(w, { cursor: page.next }))).toMatchObject({
    kind: 'invalid-input',
  })
  expect(
    await service.getRequest(w.principal, {
      ...get(w),
      requestRef: RequestRefSchema.parse({ ...w.registered.requestRef, tenantRef: 'other' }),
    }),
  ).toMatchObject({ kind: 'denied' })
  expect(await service.getRequest({ ...w.principal }, get(w))).toMatchObject({ kind: 'denied' })
})

it('checks current membership on every page and after a slow request read', async () => {
  const w = await open(),
    service = queries(w)
  const page = await service.listPool(w.principal, pool(w))
  if (page.kind !== 'page' || !page.next) throw new Error('Expected next')
  let revoke = true
  const slow = queries(w, {
    ...w.world.storage,
    async read(input) {
      const result = await w.world.storage.read(input)
      if (input.handler === 'hitl.request-read' && revoke) {
        revoke = false
        expect(await w.remove()).toEqual({ kind: 'succeeded' })
      }
      return result
    },
  })
  expect(await slow.getRequest(w.principal, get(w))).toEqual({
    kind: 'denied',
    reason: 'qualification',
  })
  expect(await service.listPool(w.principal, pool(w, { cursor: page.next }))).toEqual({
    kind: 'denied',
    reason: 'qualification',
  })
})

it('rejects a mixed snapshot when a write lands during pool projection', async () => {
  const w = await open()
  let changed = false
  const service = queries(w, {
    ...w.world.storage,
    async read(input) {
      const result = await w.world.storage.read(input)
      if (input.handler === 'hitl.independent-read' && !changed) {
        changed = true
        await reply(w)
      }
      return result
    },
  })
  expect(await service.listPool(w.principal, pool(w))).toEqual({
    kind: 'conflict',
    reason: 'pool-snapshot-changed',
  })
})

it('reports unavailable original owners and read faults rather than returning an empty complete pool', async () => {
  const w = await open()
  const service = queries(w, {
    ...w.world.storage,
    read(input) {
      if (input.handler === 'hitl.independent-read')
        return Promise.reject(new Error('owner offline'))
      return w.world.storage.read(input)
    },
  })
  expect(await service.listPool(w.principal, pool(w))).toEqual({
    kind: 'unavailable',
    reason: 'query-read',
  })
  expect(await service.getRequest(w.principal, get(w))).toEqual({
    kind: 'unavailable',
    reason: 'query-read',
  })
})

it('drains complete query projections on close while leaving the shared storage alive', async () => {
  const w = await open(),
    reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const service = queries(w, {
    ...w.world.storage,
    async read(input) {
      if (input.handler === 'hitl.request-read') {
        reached.resolve()
        await release.promise
      }
      return w.world.storage.read(input)
    },
  })
  const pending = service.getRequest(w.principal, get(w))
  await reached.promise
  let closed = false
  const closing = service.close().then(() => {
    closed = true
  })
  try {
    expect(await service.listPool(w.principal, pool(w))).toEqual({
      kind: 'unavailable',
      reason: 'closing',
    })
    await Promise.resolve()
    expect(closed).toBe(false)
  } finally {
    release.resolve()
  }
  expect(await pending).toMatchObject({ kind: 'found' })
  await closing
  expect(await w.backend.inspect(w.principal, w.binding)).toMatchObject({ kind: 'committed' })
})

it('returns a bounded partial scan with continuation when filters exclude more than one scan budget', async () => {
  const w = await open(),
    service = queries(w)
  for (let index = 1; index <= 64; index++) {
    const registration = {
      ...w.request,
      operation: w.operation(`register-${index}`),
      origin: { ...w.request.origin, wait: { ...w.request.origin.wait, waitId: `wait-${index}` } },
    }
    const prepared = IndependentCommandSchema.parse({
      kind: 'prepare',
      operation: w.operation(`prepare-${index}`),
      preparation: {
        registration,
        readers: [w.request.operation.actorRef],
        responders: [w.request.operation.actorRef],
        compatibleImplementations: ['v1'],
      },
    })
    const result = await w.world.storage.commit({
      identity: {
        ...w.world.combination,
        operation: 'hitl.command',
        protocolVersion: '2',
        operationKey: operationKey(w.operation(`prepare-${index}`)),
      },
      combinationVersion: w.world.combination.combinationVersion,
      manifestDigest: w.world.combination.manifestDigest,
      commands: independentControlCommands(prepared),
    })
    expect(result.kind).toBe('committed')
    const command = IndependentCommandSchema.parse({
      kind: 'request',
      input: { method: 'registerRequest', command: registration },
      waitRef: registration.origin.wait,
    })
    if (command.kind !== 'request') throw new Error('Expected registration')
    expect(await w.backend.execute(w.principal, command)).toMatchObject({ kind: 'registered' })
  }
  const filter = { states: ['pending'], originKind: 'tool' }
  const first = await service.listPool(w.principal, pool(w, { filter }))
  expect(first).toMatchObject({ kind: 'page', items: [], completeness: 'partial' })
  if (first.kind !== 'page' || !first.next) throw new Error('Expected bounded continuation')
  expect(
    await service.listPool(w.principal, pool(w, { filter, cursor: first.next })),
  ).toMatchObject({
    kind: 'page',
    items: [],
    next: null,
    completeness: 'complete',
    snapshotRef: first.snapshotRef,
  })
})
