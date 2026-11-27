import { describe, expect, it } from 'vitest'
import { encodeInstant } from '@omne-harness/utc-instant'
import { mcpProtocol } from '@omne-harness/mcp-protocol'
import {
  SECRET,
  acquired,
  BEGUN_AT,
  createWorld,
  fixtureLogin,
  knownAction,
  notAcquired,
  readyStatus,
  ref,
  type World,
} from './fixtures/world.ts'
import { fail, succeed } from '@omne-harness/operation-result'
import { revisionOf } from '@omne-harness/mcp-contract/testing'

const alice = fixtureLogin('a')
const bob = fixtureLogin('b')

const docs = ref('docs')

function setup() {
  const world = createWorld()
  world.define(alice, 'docs', {
    status: readyStatus(docs),
    current: acquired([
      knownAction('search', { description: 'Search the docs. More about it.' }),
      knownAction('fetch', { unavailable: 'credential-unavailable' }),
    ]),
  })
  return world
}

const bodyOf = (answer: { outcome: string }) =>
  (answer as unknown as { body: Record<string, unknown> }).body

describe('step 1: the login must act for the tenant', () => {
  it.each([
    ['list', (w: World) => w.list(alice)],
    ['read', (w: World) => w.read(alice, 'docs')],
    ['refresh', (w: World) => w.refresh(alice, 'docs')],
    ['begin-connect', (w: World) => w.begin(alice, 'docs')],
    ['disconnect', (w: World) => w.disconnect(alice, 'docs')],
  ])(
    '%s answers denied when the identity refuses and basis-unavailable when it is unavailable or throws',
    async (_name, call) => {
      for (const [refusal, outcome] of [
        ['denied', 'denied'],
        ['basis-unavailable', 'basis-unavailable'],
        ['throw', 'basis-unavailable'],
      ] as const) {
        const world = setup()
        world.refuseAsk(0, refusal)
        expect(await call(world)).toEqual({ outcome })
        expect(world.seen).toEqual([])
      }
    },
  )

  it("answers denied when the tenant is another account's, and reads nothing of it", async () => {
    const world = setup()
    expect(await world.list(bob, alice)).toEqual({ outcome: 'denied' })
    expect(await world.read(bob, 'docs', alice)).toEqual({ outcome: 'denied' })
    expect(await world.refresh(bob, 'docs', alice)).toEqual({ outcome: 'denied' })
    expect(world.seen).toEqual([])
  })
})

describe('step 2: the faces see the principal of this tenant', () => {
  it('asks every face with the issued principal and the tenant of the body', async () => {
    const world = setup()
    await world.read(alice, 'docs')
    expect(world.seen.map(call => call.op)).toEqual(['endpoints', 'inspect', 'current'])
    expect(new Set(world.seen.map(call => call.tenant))).toEqual(new Set([alice.tenant]))
    expect(world.issuedPrincipals).toHaveLength(1)
    expect(world.seen.every(call => call.principal === world.issuedPrincipals[0])).toBe(true)
    expect(world.principalAsks).toEqual([alice.tenantText])
  })
})

describe('step 3: the faces are taken on each call', () => {
  it.each([
    ['list', (w: World) => w.list(alice)],
    ['read', (w: World) => w.read(alice, 'docs')],
    ['refresh', (w: World) => w.refresh(alice, 'docs')],
    ['begin-connect', (w: World) => w.begin(alice, 'docs')],
    ['disconnect', (w: World) => w.disconnect(alice, 'docs')],
  ])(
    '%s answers basis-unavailable while the faces are away, and when the adoption is unknown or throws',
    async (_name, call) => {
      const away = setup()
      away.removeFaces()
      expect(await call(away)).toEqual({ outcome: 'basis-unavailable' })
      for (const how of ['unknown', 'throw'] as const) {
        const world = setup()
        world.failAdoption(how)
        expect(await call(world)).toEqual({ outcome: 'basis-unavailable' })
      }
    },
  )

  it('reads answer basis-unavailable when the status is unknown or throws, or the catalog read throws', async () => {
    for (const script of [
      { status: fail({ kind: 'unknown' as const }) },
      {
        status: () => {
          throw new Error('status fault')
        },
      },
      {
        status: readyStatus(docs),
        current: () => {
          throw new Error('current fault')
        },
      },
    ]) {
      const world = createWorld()
      world.define(alice, 'docs', script)
      expect(await world.list(alice)).toEqual({ outcome: 'basis-unavailable' })
      expect(await world.read(alice, 'docs')).toEqual({ outcome: 'basis-unavailable' })
    }
  })
})

describe('step 4: list-endpoints', () => {
  it('lists each endpoint with its connection, credential, use and catalog', async () => {
    const world = setup()
    world.define(alice, 'notes', {
      status: readyStatus(ref('notes'), {
        connection: { kind: 'lost', reason: 'stream-broken' },
        credential: 'absent',
        use: { kind: 'blocked', reason: 'disabled' },
      }),
    })
    world.define(alice, 'plain', {
      status: readyStatus(ref('plain'), {
        connection: { kind: 'none' },
        credential: 'not-required',
      }),
      current: fail({ kind: 'config-missing', item: 'target' }),
    })
    const answer = await world.list(alice)
    expect(answer).toEqual({
      outcome: 'succeeded',
      body: {
        items: [
          {
            name: 'docs',
            connection: { state: 'ready', reason: null },
            credential: 'present',
            credentialState: 'present',
            use: { kind: 'usable' },
            catalog: { kind: 'acquired', actions: 2 },
          },
          {
            name: 'notes',
            connection: { state: 'lost', reason: 'the endpoint could not be reached' },
            credential: 'absent',
            credentialState: 'absent',
            use: { kind: 'blocked', reason: 'the endpoint is disabled' },
            catalog: { kind: 'not-acquired', reason: 'the endpoint could not be reached' },
          },
          {
            name: 'plain',
            connection: { state: 'none', reason: null },
            credential: 'not-required',
            credentialState: 'not-required',
            use: { kind: 'usable' },
            catalog: { kind: 'not-acquired', reason: 'the address of the endpoint is not set' },
          },
        ],
      },
    })
  })

  it('leaves out an endpoint that is not available to the asker, and answers an empty list for a tenant with none', async () => {
    const world = setup()
    world.define(alice, 'hidden', { status: fail({ kind: 'not-available-to-you' as const }) })
    const names = (await world.list(alice)) as unknown as { body: { items: { name: string }[] } }
    expect(names.body.items.map(item => item.name)).toEqual(['docs'])
    expect(await world.list(bob)).toEqual({ outcome: 'succeeded', body: { items: [] } })
  })

  it.each([
    [{ kind: 'none' }, null],
    [{ kind: 'preparing' }, null],
    [{ kind: 'ready' }, null],
    [
      { kind: 'degraded', reason: 'list-failed' },
      'the actions of the endpoint could not be listed',
    ],
    [{ kind: 'lost', reason: 'stream-broken' }, 'the endpoint could not be reached'],
    [{ kind: 'lost', reason: 'session-ended' }, 'the endpoint could not be reached'],
    [
      { kind: 'lost', reason: 'authorization-required' },
      'the endpoint requires an authorization this version cannot give',
    ],
    [
      { kind: 'lost', reason: 'credential-rejected' },
      'the credential of the endpoint was rejected by the endpoint; the person needs to set the right one, or connect again if the endpoint signs in with OAuth',
    ],
  ] as const)('says of the connection %j: %j', async (connection, reason) => {
    const world = createWorld()
    world.define(alice, 'docs', { status: readyStatus(docs, { connection }) })
    const answer = await world.list(alice)
    expect(bodyOf(answer)['items']).toMatchObject([{ connection: { reason } }])
  })

  it.each([
    [{ kind: 'lost', reason: 'credential-rejected' }, 'present', 'rejected'],
    [{ kind: 'ready' }, 'present', 'present'],
    [{ kind: 'lost', reason: 'stream-broken' }, 'present', 'present'],
    [{ kind: 'lost', reason: 'credential-rejected' }, 'absent', 'absent'],
    [{ kind: 'none' }, 'not-required', 'not-required'],
  ] as const)(
    'the state of the credential on connection %j with the credential %s is %s, alike in list and read (C101)',
    async (connection, credential, state) => {
      const world = createWorld()
      world.define(alice, 'docs', { status: readyStatus(docs, { connection, credential }) })
      expect(bodyOf(await world.list(alice))['items']).toMatchObject([
        { credential, credentialState: state },
      ])
      expect(bodyOf(await world.read(alice, 'docs'))['endpoint']).toMatchObject({
        credential,
        credentialState: state,
      })
    },
  )

  it('an OAuth grant the endpoint refused stays present: it is refreshed on the next use, and only the grant says to connect again (C204)', async () => {
    const world = createWorld()
    const connection = { kind: 'lost', reason: 'credential-rejected' } as const
    world.define(alice, 'docs', {
      status: readyStatus(docs, { connection, credential: 'present', connect: 'available' }),
    })
    expect(bodyOf(await world.read(alice, 'docs'))['endpoint']).toMatchObject({
      credential: 'present',
      credentialState: 'present',
    })
    world.define(alice, 'docs', {
      status: readyStatus(docs, {
        connection,
        credential: 'reconnect-required',
        connect: 'available',
      }),
    })
    expect(bodyOf(await world.read(alice, 'docs'))['endpoint']).toMatchObject({
      credential: 'present',
      credentialState: 'reconnect-required',
    })
  })

  it('writes the reason of a failed catalog read as the bridge does', async () => {
    const world = createWorld()
    world.define(alice, 'docs', {
      status: readyStatus(docs),
      current: fail({ kind: 'credential-unavailable', cause: 'missing' }),
    })
    const answer = await world.list(alice)
    expect(bodyOf(answer)['items']).toMatchObject([
      { catalog: { kind: 'not-acquired', reason: 'the credential of the endpoint is not set' } },
    ])
  })
})

describe('why no actions are known, from what the endpoint is now', () => {
  const stand = (
    adopted: NonNullable<Parameters<ReturnType<typeof createWorld>['define']>[2]['adopted']>,
    connection: Parameters<typeof readyStatus>[1] = {},
  ) => {
    const world = createWorld()
    world.define(alice, 'docs', {
      adopted,
      status: readyStatus(docs, connection),
      current: notAcquired,
    })
    return world
  }
  const catalogOfList = async (world: World) =>
    (bodyOf(await world.list(alice))['items'] as { catalog: unknown }[])[0]?.catalog
  const catalogOfRead = async (world: World) =>
    (bodyOf(await world.read(alice, 'docs'))['endpoint'] as { catalog: unknown }).catalog

  it.each([
    [
      'the address is not set',
      { settings: { target: { kind: 'absent' } } },
      {},
      'the address of the endpoint is not set',
    ],
    [
      'the address is not valid',
      { settings: { target: { kind: 'invalid', text: 'x' } } },
      {},
      'the address of the endpoint is not valid',
    ],
    [
      'the credential is not set and the endpoint needs one',
      { auth: 'static', settings: { credential: { kind: 'absent' } } },
      {},
      'the credential of the endpoint is not set',
    ],
    [
      'the connection is lost',
      {},
      { connection: { kind: 'lost', reason: 'stream-broken' } },
      'the endpoint could not be reached',
    ],
    [
      'the authorization is the reason the connection is lost',
      {},
      { connection: { kind: 'lost', reason: 'authorization-required' } },
      'the endpoint requires an authorization this version cannot give',
    ],
  ] as const)(
    'gives the reason when %s, alike in list and read',
    async (_label, adopted, connection, reason) => {
      const world = stand(adopted as never, connection as never)
      const expected = { kind: 'not-acquired', reason }
      expect(await catalogOfList(world)).toEqual(expected)
      expect(await catalogOfRead(world)).toEqual(expected)
      expect(world.seen.some(call => call.op === 'refresh')).toBe(false)
    },
  )

  it('gives none when every setting is in place and the connection is not lost, or the credential is absent but not needed', async () => {
    for (const world of [
      stand({}),
      stand({ settings: { credential: { kind: 'absent' } } }),
      stand({}, { connection: { kind: 'preparing' } }),
    ]) {
      expect(await catalogOfList(world)).toEqual({ kind: 'not-acquired', reason: null })
      expect(await catalogOfRead(world)).toEqual({ kind: 'not-acquired', reason: null })
    }
  })

  it('names the address first when several settings are missing', async () => {
    const world = stand(
      { auth: 'oauth', settings: { target: { kind: 'absent' }, credential: { kind: 'absent' } } },
      { connection: { kind: 'lost', reason: 'stream-broken' } },
    )
    expect(await catalogOfRead(world)).toEqual({
      kind: 'not-acquired',
      reason: 'the address of the endpoint is not set',
    })
  })
})

describe('step 4: read-endpoint', () => {
  it('reads the endpoint with its actions: summary, availability and why not', async () => {
    const answer = await setup().read(alice, 'docs')
    expect(answer).toEqual({
      outcome: 'succeeded',
      body: {
        endpoint: {
          name: 'docs',
          connection: { state: 'ready', reason: null },
          credential: 'present',
          credentialState: 'present',
          use: { kind: 'usable' },
          catalog: { kind: 'acquired', actions: 2 },
        },
        actions: [
          { name: 'search', summary: '[peer] Search the docs.', available: true, reason: null },
          {
            name: 'fetch',
            summary: 'The endpoint gave no description.',
            available: false,
            reason: 'the credential of the endpoint is not usable',
          },
        ],
      },
    })
  })

  it('has no actions when none was acquired, and the reason when the read of them failed', async () => {
    const world = createWorld()
    world.define(alice, 'docs', { status: readyStatus(docs), current: notAcquired })
    world.define(alice, 'down', {
      status: readyStatus(ref('down')),
      current: fail({ kind: 'connection-unavailable' }),
    })
    expect(bodyOf(await world.read(alice, 'docs'))).toMatchObject({
      actions: null,
      endpoint: { catalog: { kind: 'not-acquired', reason: null } },
    })
    expect(bodyOf(await world.read(alice, 'down'))).toMatchObject({
      actions: null,
      endpoint: { catalog: { kind: 'not-acquired', reason: 'the endpoint could not be reached' } },
    })
  })

  it('answers not-visible alike for an endpoint that does not exist and one that is not available to the asker', async () => {
    const world = setup()
    world.define(alice, 'hidden', { status: fail({ kind: 'not-available-to-you' as const }) })
    const missing = await world.read(alice, 'absent')
    const hidden = await world.read(alice, 'hidden')
    expect(missing).toEqual({ outcome: 'not-visible', body: {} })
    expect(hidden).toEqual(missing)
  })

  it("does not show another tenant's endpoint", async () => {
    const world = setup()
    expect(await world.read(bob, 'docs')).toEqual({ outcome: 'not-visible', body: {} })
  })
})

describe('step 4: refresh-endpoint', () => {
  it.each([
    [
      succeed({ kind: 'published' as const, revision: revisionOf(2) }),
      { refreshed: 'published', reason: null },
    ],
    [
      succeed({ kind: 'kept' as const, reason: { kind: 'superseded' as const } }),
      { refreshed: 'superseded', reason: null },
    ],
    [
      succeed({ kind: 'kept' as const, reason: { kind: 'cancelled' as const } }),
      { refreshed: 'cancelled', reason: null },
    ],
    [
      succeed({
        kind: 'kept' as const,
        reason: { kind: 'listing-incomplete' as const, defect: 'page-failed' as const },
      }),
      {
        refreshed: 'failed',
        reason: 'the listing of the actions of the endpoint was not complete (page-failed)',
      },
    ],
    [
      fail({ kind: 'config-missing' as const, item: 'target' as const }),
      { refreshed: 'failed', reason: 'the address of the endpoint is not set' },
    ],
    [
      fail({ kind: 'connection-unavailable' as const }),
      { refreshed: 'failed', reason: 'the endpoint could not be reached' },
    ],
    [
      fail({ kind: 'blocked' as const, reason: 'disabled' as const }),
      { refreshed: 'failed', reason: 'the endpoint is disabled' },
    ],
  ])('maps %j to %j', async (refreshed, body) => {
    const world = createWorld()
    world.define(alice, 'docs', { status: readyStatus(docs), refresh: refreshed })
    expect(await world.refresh(alice, 'docs')).toEqual({ outcome: 'succeeded', body })
  })

  it('refreshes with the connect bound of the settings', async () => {
    const world = setup()
    await world.refresh(alice, 'docs')
    expect(world.seen.find(call => call.op === 'refresh')?.bound).toBe(10_000)
  })

  it("answers not-visible for an unknown name, for another tenant's endpoint, and when the refresh says it is not available", async () => {
    const world = setup()
    world.define(alice, 'hidden', { refresh: fail({ kind: 'not-available-to-you' as const }) })
    expect(await world.refresh(alice, 'absent')).toEqual({ outcome: 'not-visible', body: {} })
    expect(await world.refresh(bob, 'docs')).toEqual({ outcome: 'not-visible', body: {} })
    expect(await world.refresh(alice, 'hidden')).toEqual({ outcome: 'not-visible', body: {} })
    expect(world.seen.filter(call => call.op === 'refresh').map(call => call.name)).toEqual([
      'hidden',
    ])
  })

  it('answers unknown when the refresh throws, and does not send it again', async () => {
    const world = createWorld()
    world.define(alice, 'docs', {
      refresh: () => {
        throw new Error('refresh fault')
      },
    })
    expect(await world.refresh(alice, 'docs')).toEqual({ outcome: 'unknown' })
    expect(world.seen.filter(call => call.op === 'refresh')).toHaveLength(1)
  })
})

describe('step 4: begin-connect and disconnect (C201, C206)', () => {
  it('begins with the principal of the tenant and answers the address with the time it expires at', async () => {
    const world = setup()
    expect(await world.begin(alice, 'docs')).toEqual({
      outcome: 'succeeded',
      body: {
        url: 'https://auth.example/authorize?s=1',
        expiresAt: expect.objectContaining({}),
      },
    })
    const answer = await world.begin(alice, 'docs')
    if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
    expect(encodeInstant(answer.body.expiresAt)).toBe(new Date(BEGUN_AT).toISOString())
    expect(
      world.seen.filter(call => call.op === 'begin').map(call => [call.tenant, call.name]),
    ).toEqual([
      [alice.tenant, 'docs'],
      [alice.tenant, 'docs'],
    ])
  })

  it.each([
    [{ kind: 'not-oauth' as const }, { outcome: 'unsupported', body: { reason: 'not-oauth' } }],
    [
      { kind: 'blocked' as const, reason: 'disabled' as const },
      { outcome: 'not-committed', body: { reason: 'disabled', text: 'the endpoint is disabled' } },
    ],
    [
      { kind: 'config-missing' as const, item: 'target' as const },
      {
        outcome: 'not-committed',
        body: { reason: 'target-missing', text: 'the endpoint has no address set' },
      },
    ],
    [
      { kind: 'config-invalid' as const, item: 'client-id' as const },
      {
        outcome: 'not-committed',
        body: {
          reason: 'client-id-invalid',
          text: 'the client identifier set for the endpoint cannot be read',
        },
      },
    ],
    [
      { kind: 'refused' as const, reason: 'no-registration' as const },
      {
        outcome: 'not-committed',
        body: {
          reason: 'no-registration',
          text: 'register an application at the authorization server first and set its client identifier',
        },
      },
    ],
    [
      { kind: 'refused' as const, reason: 'issuer-mismatch' as const },
      {
        outcome: 'not-committed',
        body: {
          reason: 'issuer-mismatch',
          text: 'the authorization server described itself as a different issuer',
        },
      },
    ],
    [
      { kind: 'refused' as const, reason: 'unavailable' as const },
      { outcome: 'basis-unavailable' },
    ],
    [{ kind: 'unknown' as const }, { outcome: 'basis-unavailable' }],
    [{ kind: 'not-available-to-you' as const }, { outcome: 'not-visible', body: {} }],
  ])('maps a refusal %j of the connect face to %j', async (failure, answer) => {
    const world = createWorld()
    world.define(alice, 'docs', { status: readyStatus(docs), begin: fail(failure) })
    expect(await world.begin(alice, 'docs')).toEqual(answer)
  })

  it("answers not-visible for an unknown name and for another tenant's endpoint, without asking the face", async () => {
    const world = setup()
    expect(await world.begin(alice, 'absent')).toEqual({ outcome: 'not-visible', body: {} })
    expect(await world.disconnect(bob, 'docs')).toEqual({ outcome: 'not-visible', body: {} })
    expect(world.seen.filter(call => call.op === 'begin' || call.op === 'disconnect')).toEqual([])
  })

  it('answers basis-unavailable when connecting is not offered, and unknown when the face throws', async () => {
    const without = createWorld({ connect: false })
    without.define(alice, 'docs', { status: readyStatus(docs) })
    expect(await without.begin(alice, 'docs')).toEqual({ outcome: 'basis-unavailable' })
    expect(await without.disconnect(alice, 'docs')).toEqual({ outcome: 'basis-unavailable' })
    const world = createWorld()
    const fault = () => {
      throw new Error('connect fault')
    }
    world.define(alice, 'docs', { status: readyStatus(docs), begin: fault, disconnect: fault })
    expect(await world.begin(alice, 'docs')).toEqual({ outcome: 'unknown' })
    expect(await world.disconnect(alice, 'docs')).toEqual({ outcome: 'unknown' })
  })

  it('disconnects, refuses an endpoint that does not use OAuth, and says unavailable for anything else', async () => {
    const world = createWorld()
    world.define(alice, 'docs', { status: readyStatus(docs) })
    world.define(alice, 'plain', {
      status: readyStatus(ref('plain')),
      disconnect: fail({ kind: 'not-oauth' as const }),
    })
    world.define(alice, 'gone', {
      status: readyStatus(ref('gone')),
      disconnect: fail({ kind: 'refused' as const, reason: 'unavailable' as const }),
    })
    world.define(alice, 'off', {
      status: readyStatus(ref('off')),
      disconnect: fail({ kind: 'blocked' as const, reason: 'disabled' as const }),
    })
    expect(await world.disconnect(alice, 'docs')).toEqual({
      outcome: 'succeeded',
      body: { disconnected: 'disconnected' },
    })
    expect(await world.disconnect(alice, 'plain')).toEqual({
      outcome: 'unsupported',
      body: { reason: 'not-oauth' },
    })
    expect(await world.disconnect(alice, 'gone')).toEqual({ outcome: 'basis-unavailable' })
    expect(await world.disconnect(alice, 'off')).toEqual({ outcome: 'basis-unavailable' })
  })

  it('an OAuth endpoint shows whether a connection can be begun or waits, and a grant that wants a new connection', async () => {
    const world = createWorld()
    world.define(alice, 'docs', {
      status: readyStatus(docs, { credential: 'reconnect-required', connect: 'connecting' }),
    })
    const read = await world.read(alice, 'docs')
    expect(read).toMatchObject({
      outcome: 'succeeded',
      body: {
        endpoint: {
          credential: 'present',
          credentialState: 'reconnect-required',
          connect: 'connecting',
        },
      },
    })
  })
})

describe('what the answers say', () => {
  it('holds no secret the adoption carries, and every answer is written by its own contract codec', async () => {
    const world = setup()
    const answers = [
      await world.list(alice),
      await world.read(alice, 'docs'),
      await world.refresh(alice, 'docs'),
    ]
    for (const [answer, name] of [
      [answers[0], 'list-endpoints'],
      [answers[1], 'read-endpoint'],
      [answers[2], 'refresh-endpoint'],
    ] as const) {
      expect(JSON.stringify(answer)).not.toContain(SECRET)
      const codec = mcpProtocol.operations[name].outcomes.succeeded
      const written = codec.write((answer as unknown as { body: never }).body, LIMITS)
      expect(written.ok).toBe(true)
    }
  })
})

const LIMITS = {
  maxBytes: 1_000_000,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 256,
  maxStringLength: 100_000,
  maxNumberLength: 32,
}
