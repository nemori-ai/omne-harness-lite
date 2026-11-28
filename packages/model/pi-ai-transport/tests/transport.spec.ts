import type { Supplier } from '@omne-harness/model-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { defineDecisionsFamily } from '../src/family-kit/index.ts'
import { composeFamilies, recordAdoption, recordProvider } from '../src/family-table.ts'
import type { PiFamilyContributions, PiTransportConfig } from '../src/index.ts'
import { openNetwork, type NetworkInternals } from '../src/network.ts'
import { createPiTransport, type PiTransport } from '../src/transport.ts'
import {
  createTestFamily,
  END_MARKER,
  LIMITS,
  providerName,
  REQUEST,
  SUPPLIER,
} from './support/test-family.ts'
import { collect, countSends, slotFree } from './support/transport.ts'

const PREPARED_CLOSED_FAILURE = {
  kind: 'unavailable',
  dependency: 'pi-transport',
  diagnostic: 'prepared-closed',
} as const

const ROUTE_URL = 'https://127.0.0.1:9/v1/chat/completions'

const networks: NetworkInternals[] = []
const transports: PiTransport[] = []

afterEach(async () => {
  await Promise.all(transports.splice(0).map(transport => transport.close()))
  await Promise.all(networks.splice(0).map(network => network.close()))
})

function freshNetwork(): NetworkInternals {
  const network = openNetwork({ maxConnections: 1, idleConnectionTimeoutMs: 1_000 })
  networks.push(network)
  return network
}

function configWith(overrides: Partial<PiTransportConfig> = {}): PiTransportConfig {
  return {
    network: freshNetwork().handle,
    families: createTestFamily().families,
    routes: {
      [SUPPLIER.provider]: {
        endpoints: { 'chat-completions': { url: ROUTE_URL, endMarker: END_MARKER } },
        accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
        auth: { kind: 'bearer', item: 'apiKey' },
      },
    },
    credential: { read: () => new Map([['apiKey', 'test-secret']]) },
    limits: LIMITS,
    ...overrides,
  }
}

function build(overrides: Partial<PiTransportConfig> = {}) {
  const family = createTestFamily()
  const built = createPiTransport(configWith({ families: family.families, ...overrides }))
  transports.push(built)
  return { ...built, probe: family.probe }
}

describe('constructing the transport', () => {
  it.each([
    [
      'a route URL that does not parse',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'not a url', endMarker: null } },
            accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
      },
    ],
    [
      'an http: route URL',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'http://127.0.0.1/', endMarker: null } },
            accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
      },
    ],
    [
      'a route URL with credentials',
      {
        routes: {
          r: {
            endpoints: {
              'chat-completions': { url: 'https://user:pass@127.0.0.1/', endMarker: null },
            },
            accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
      },
    ],
    [
      'a route URL with a query',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'https://127.0.0.1/?a=1', endMarker: null } },
            accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
      },
    ],
    [
      'a route without accounting',
      {
        routes: { r: { url: 'https://127.0.0.1/', endMarker: null } },
      } as unknown as Partial<PiTransportConfig>,
    ],
    [
      'a route with an empty cost unit',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'https://127.0.0.1/', endMarker: null } },
            accounting: { place: 'p', costUnit: '' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
      },
    ],
    [
      'a route with an empty accounting place',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'https://127.0.0.1/', endMarker: null } },
            accounting: { place: '', costUnit: 'c' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
      },
    ],
    [
      'a route auth of another kind',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'https://127.0.0.1/', endMarker: null } },
            accounting: { place: 'p', costUnit: 'c' },
            auth: { kind: 'basic', item: 'apiKey' },
          },
        },
      } as unknown as Partial<PiTransportConfig>,
    ],
    [
      'a route accounting without a place',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'https://127.0.0.1/', endMarker: null } },
            accounting: { costUnit: 'c' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
      } as unknown as Partial<PiTransportConfig>,
    ],
    [
      'a route accounting without a cost unit',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'https://127.0.0.1/', endMarker: null } },
            accounting: { place: 'p' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
      } as unknown as Partial<PiTransportConfig>,
    ],
    [
      'a route auth without an item',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'https://127.0.0.1/', endMarker: null } },
            accounting: { place: 'p', costUnit: 'c' },
            auth: { kind: 'bearer' },
          },
        },
      } as unknown as Partial<PiTransportConfig>,
    ],
    [
      'a route auth with an empty item',
      {
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: 'https://127.0.0.1/', endMarker: null } },
            accounting: { place: 'p', costUnit: 'c' },
            auth: { kind: 'bearer', item: '' },
          },
        },
      },
    ],
    [
      'a route without endpoints',
      {
        routes: {
          r: { endpoints: {}, accounting: { place: 'p', costUnit: 'c' }, auth: null },
        },
      },
    ],
    [
      'a route that names an interface no engine speaks',
      {
        routes: {
          r: {
            endpoints: JSON.parse('{"completions":{"url":"https://127.0.0.1/","endMarker":null}}'),
            accounting: { place: 'p', costUnit: 'c' },
            auth: null,
          },
        },
      },
    ],
    ['a connect timeout of zero', { limits: { ...LIMITS, connectTimeoutMs: 0 } }],
    [
      'a connect timeout above the timer limit',
      { limits: { ...LIMITS, connectTimeoutMs: 2 ** 31 } },
    ],
    ['a retry backoff of zero', { limits: { ...LIMITS, connectRetry: { backoffMs: [0] } } }],
    [
      'a retry backoff above the timer limit',
      { limits: { ...LIMITS, connectRetry: { backoffMs: [500, 2 ** 31] } } },
    ],
    ['a fractional retry backoff', { limits: { ...LIMITS, connectRetry: { backoffMs: [1.5] } } }],
    [
      'more retries than the bound',
      { limits: { ...LIMITS, connectRetry: { backoffMs: Array.from({ length: 9 }, () => 100) } } },
    ],
    ['an error body limit of zero', { limits: { ...LIMITS, maxErrorBodyBytes: 0 } }],
    ['a fractional event limit', { limits: { ...LIMITS, maxEventBytes: 1.5 } }],
    ['a JSON depth of zero', { limits: { ...LIMITS, json: { ...LIMITS.json, maxDepth: 0 } } }],
    [
      'an end marker on an interface that answers with one whole document',
      {
        routes: {
          r: {
            endpoints: { decisions: { url: ROUTE_URL, endMarker: END_MARKER } },
            accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
      },
    ],
  ] satisfies readonly (readonly [string, Partial<PiTransportConfig>])[])(
    'refuses %s synchronously with a RangeError',
    (_name, overrides) => {
      expect(() => createPiTransport(configWith(overrides))).toThrow(RangeError)
    },
  )

  it('accepts a route without auth', () => {
    expect(() =>
      build({
        routes: {
          r: {
            endpoints: { 'chat-completions': { url: ROUTE_URL, endMarker: null } },
            accounting: { place: 'p', costUnit: 'c' },
            auth: null,
          },
        },
      }),
    ).not.toThrow()
  })

  it('accepts an interface that answers with one whole document when it has no end marker', () => {
    expect(() =>
      build({
        routes: {
          r: {
            endpoints: { decisions: { url: ROUTE_URL, endMarker: null } },
            accounting: { place: 'p', costUnit: 'c' },
            auth: null,
          },
        },
      }),
    ).not.toThrow()
  })

  it('names the interface that an end marker was refused on', () => {
    const routes = {
      r: {
        endpoints: { decisions: { url: ROUTE_URL, endMarker: END_MARKER } },
        accounting: { place: 'p', costUnit: 'c' },
        auth: null,
      },
    }
    expect(() => createPiTransport(configWith({ routes }))).toThrow(
      'the decisions endpoint accepts one whole response',
    )
  })

  it('refuses network resources that the network resources factory did not make', () => {
    const foreign = { close: () => Promise.resolve() }
    expect(() =>
      // @ts-expect-error a structural look-alike is not a network resources handle
      createPiTransport(configWith({ network: foreign })),
    ).toThrow(RangeError)
  })

  it('names the field but never the URL in the message', () => {
    const secretUrl = 'https://user:hunter2@127.0.0.1/v1'
    expect(() =>
      createPiTransport(
        configWith({
          routes: {
            r: {
              endpoints: { 'chat-completions': { url: secretUrl, endMarker: null } },
              accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
              auth: { kind: 'bearer', item: 'apiKey' },
            },
          },
        }),
      ),
    ).toThrow(/^each route url must be/)
    try {
      createPiTransport(
        configWith({
          routes: {
            r: {
              endpoints: { 'chat-completions': { url: secretUrl, endMarker: null } },
              accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
              auth: { kind: 'bearer', item: 'apiKey' },
            },
          },
        }),
      )
    } catch (error) {
      expect(String(error)).not.toContain('hunter2')
    }
  })

  it.each([
    ['a backoff that is not a list', { backoffMs: 500 }],
    ['no backoff', {}],
    [
      'a backoff list with a hole',
      { backoffMs: Array.from({ length: 3 }, (_, i) => (i === 1 ? undefined : 500)) },
    ],
    ['a backoff list with a sparse hole', { backoffMs: Object.assign([500], { length: 2 }) }],
  ])('refuses a retry configuration with %s', (_name, connectRetry) => {
    const limits = { ...LIMITS, connectRetry } as unknown as PiTransportConfig['limits']
    expect(() => createPiTransport(configWith({ limits }))).toThrow(RangeError)
  })

  it('refuses an onConnectRetry that is not a function', () => {
    const onConnectRetry = 'not a function' as unknown as NonNullable<
      PiTransportConfig['onConnectRetry']
    >
    expect(() => createPiTransport(configWith({ onConnectRetry }))).toThrow(
      new RangeError('onConnectRetry must be absent or a function'),
    )
  })

  it('refuses a media reader that is not a function, and accepts a function or none', () => {
    const media = 'not a function' as unknown as NonNullable<PiTransportConfig['media']>
    expect(() => createPiTransport(configWith({ media }))).toThrow(
      new RangeError('media must be absent or a function'),
    )
    const read: PiTransportConfig['media'] = async () => ({
      failure: { kind: 'material-unavailable' },
    })
    expect(() => createPiTransport(configWith({ media: read }))).not.toThrow()
  })

  it('refuses an onResponseBody that is not a function, and accepts a function or none', () => {
    const onResponseBody = 'not a function' as unknown as NonNullable<
      PiTransportConfig['onResponseBody']
    >
    expect(() => createPiTransport(configWith({ onResponseBody }))).toThrow(
      new RangeError('onResponseBody must be absent or a function'),
    )
    expect(() => createPiTransport(configWith({ onResponseBody: () => {} }))).not.toThrow()
    expect(() => createPiTransport(configWith({}))).not.toThrow()
  })

  it('accepts the retry backoff list, an empty one, and no retry configuration', () => {
    for (const connectRetry of [{ backoffMs: [500, 1000] }, { backoffMs: [] }, undefined])
      expect(() =>
        createPiTransport(
          configWith({
            limits: { ...LIMITS, ...(connectRetry === undefined ? {} : { connectRetry }) },
          }),
        ),
      ).not.toThrow()
  })

  it('accepts a connect timeout of null', () => {
    expect(() =>
      createPiTransport(configWith({ limits: { ...LIMITS, connectTimeoutMs: null } })),
    ).not.toThrow()
  })
})

describe('prepare', () => {
  it('answers unsupported for a provider without a route, without acquiring a binding', async () => {
    const { transport, probe } = build()
    const outcome = await transport.prepare(
      REQUEST,
      { ...SUPPLIER, provider: providerName('elsewhere') },
      { resent: [] },
    )
    expect(outcome).toEqual({
      failure: { kind: 'unsupported', field: 'supplier.provider', adapter: SUPPLIER.adoption },
    })
    expect(probe.acquired).toBe(0)
  })

  it('answers unsupported for a binding whose interface the route has no endpoint for, and releases the binding', async () => {
    const { transport, probe } = build({
      routes: {
        [SUPPLIER.provider]: {
          endpoints: { messages: { url: ROUTE_URL, endMarker: null } },
          accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
          auth: { kind: 'bearer', item: 'apiKey' },
        },
      },
    })
    const outcome = await transport.prepare(REQUEST, SUPPLIER, { resent: [] })
    expect(outcome).toEqual({
      failure: { kind: 'unsupported', field: 'route.endpoint', adapter: expect.anything() },
    })
    expect([probe.acquired, probe.released]).toEqual([1, 1])
  })

  it('answers unsupported for a request of another model kind than the interface of the binding, and releases the binding', async () => {
    const { transport, probe } = build()
    const { profile, suppliers, fallback, retryPolicy, source } = REQUEST
    const asked = { state: 'text', questions: { Q1: { type: 'noul' } } } as const
    const decision = {
      kind: 'decisions',
      profile,
      suppliers,
      fallback,
      retryPolicy,
      source,
      ask: asked,
    } as const
    const outcome = await transport.prepare(decision, SUPPLIER, { resent: [] })
    expect(outcome).toEqual({
      failure: { kind: 'unsupported', field: 'request.kind', adapter: expect.anything() },
    })
    expect([probe.acquired, probe.released]).toEqual([1, 1])
  })

  it('pairs a decisions record with a decisions request only when the assembly gave the byte limit of decisions', async () => {
    const model = 'vendor/judge'
    const record = {
      name: model,
      revision: '1',
      route: { provider: 'judges', model },
      status: 'current',
      decisions: { maxQuestions: null },
      profile: { input: ['text'], output: ['text'], evidence: 'a test record' },
    } as const
    const supplier: Supplier = {
      adoption: recordAdoption('test-decisions', record),
      provider: recordProvider(record),
      model,
      credential: { layer: 'official' },
    }
    const { profile, fallback, retryPolicy, source } = REQUEST
    const ask = { state: 'text', questions: { Q1: { type: 'noul' } } } as const
    const decision = {
      kind: 'decisions',
      profile,
      suppliers: [supplier],
      fallback,
      retryPolicy,
      source,
      ask,
    } as const
    const assembled = (limits: PiTransportConfig['limits']) =>
      build({
        families: composeFamilies([
          defineDecisionsFamily({
            owner: 'test-decisions',
            endpoint: 'decisions',
            records: [record],
          }),
        ]),
        routes: {
          [supplier.provider]: {
            endpoints: { decisions: { url: ROUTE_URL, endMarker: null } },
            accounting: { place: 'test-gateway', costUnit: 'test-credit' },
            auth: { kind: 'bearer', item: 'apiKey' },
          },
        },
        limits,
      })
    const limited = assembled({ ...LIMITS, maxDecisionBytes: 4096 })
    expect(await limited.transport.prepare(decision, supplier, { resent: [] })).toHaveProperty('ok')
    const unlimited = assembled(LIMITS)
    expect(await unlimited.transport.prepare(decision, supplier, { resent: [] })).toEqual({
      failure: { kind: 'unsupported', field: 'limits.decisions', adapter: supplier.adoption },
    })
  })

  it('cannot ask the cost of a request where no route is, or where the accounting of the route states no way to ask', async () => {
    const signal = new AbortController().signal
    const { lookupCost } = build()
    expect(await lookupCost(SUPPLIER, 'gen-1', signal)).toEqual({ kind: 'unsupported' })
    const elsewhere = { ...SUPPLIER, provider: providerName('elsewhere') }
    expect(await lookupCost(elsewhere, 'gen-1', signal)).toEqual({ kind: 'unsupported' })
  })

  it('can ask the cost where the accounting states the header and the path, and then needs the secret of the route', async () => {
    const stated = build({
      routes: {
        [SUPPLIER.provider]: {
          endpoints: { 'chat-completions': { url: ROUTE_URL, endMarker: END_MARKER } },
          accounting: {
            place: 'test-gateway',
            costUnit: 'test-credit',
            generation: { requestHeader: 'x-request-id', path: '/cost' },
          },
          auth: { kind: 'bearer', item: 'apiKey' },
        },
      },
      credential: { read: () => undefined },
    })
    expect(await stated.lookupCost(SUPPLIER, 'gen-1', new AbortController().signal)).toEqual({
      kind: 'unavailable',
      diagnostic: 'credential-missing',
    })
  })

  it('answers invalid for a supplier that the request does not name, without acquiring a binding', async () => {
    const { transport, probe } = build()
    for (const supplier of [
      { ...SUPPLIER, model: 'other-model' },
      { ...SUPPLIER, adoption: { ...SUPPLIER.adoption, revision: '2' } },
    ]) {
      const outcome = await transport.prepare(REQUEST, supplier, { resent: [] })
      expect(outcome).toEqual({
        failure: { kind: 'invalid', field: 'supplier', reason: 'not-in-request' },
      })
    }
    expect(probe.acquired).toBe(0)
  })

  it('does not take a route from the prototype of the routes object', async () => {
    const { transport } = build()
    const outcome = await transport.prepare(
      REQUEST,
      { ...SUPPLIER, provider: providerName('constructor') },
      { resent: [] },
    )
    expect(outcome).toMatchObject({ failure: { kind: 'unsupported' } })
  })

  it('gives the failure of the family acquire unchanged', async () => {
    const { transport, probe } = build()
    const failure = { kind: 'denied', action: 'family' } as const
    probe.acquireFailure = failure
    expect(await transport.prepare(REQUEST, SUPPLIER, { resent: [] })).toEqual({ failure })
  })

  it('acquires one binding for the supplier, and the close of the prepared transport releases it once', async () => {
    const { transport, probe } = build()
    const prepared = await transport.prepare(REQUEST, SUPPLIER, { resent: [] })
    if (!('ok' in prepared)) throw new Error('expected a prepared transport')
    expect(probe.acquired).toBe(1)
    expect(probe.released).toBe(0)
    const first = prepared.ok.close()
    const second = prepared.ok.close()
    await Promise.all([first, second])
    await prepared.ok.close()
    expect(probe.released).toBe(1)
  })

  it('a closed prepared transport answers unavailable to materialize', async () => {
    const { transport } = build()
    const prepared = await transport.prepare(REQUEST, SUPPLIER, { resent: [] })
    if (!('ok' in prepared)) throw new Error('expected a prepared transport')
    await prepared.ok.close()
    expect(await prepared.ok.materialize(new AbortController().signal)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'pi-transport' },
    })
  })
})

describe('closing a prepared transport while it materializes', () => {
  // With the test family materialize returns after three microtasks: a close inside that window
  // wins (unavailable); a later close closes the handed-out materialization, which sends nothing.
  it.each([0, 1, 2, 3, 4])(
    'a close that starts %i microtasks after materialize never lets a send out',
    async gap => {
      const network = freshNetwork()
      const sends = countSends(network)
      const { transport, probe } = build({ network: network.handle })
      const prepared = await transport.prepare(REQUEST, SUPPLIER, { resent: [] })
      if (!('ok' in prepared)) throw new Error('expected a prepared transport')
      const pending = prepared.ok.materialize(new AbortController().signal)
      for (let turn = 0; turn < gap; turn += 1) await Promise.resolve()
      const closed = prepared.ok.close()
      const outcome = await pending
      const facts =
        'ok' in outcome && 'start' in outcome.ok
          ? await collect(outcome.ok.start(new AbortController().signal))
          : []
      await closed
      if (gap <= 2) expect(outcome).toEqual({ failure: PREPARED_CLOSED_FAILURE })
      if ('ok' in outcome)
        expect(facts).toEqual([
          { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
        ])
      else expect(outcome).toEqual({ failure: PREPARED_CLOSED_FAILURE })
      expect(sends()).toBe(0)
      expect(await slotFree(network)).toBe(true)
      expect(probe.released).toBe(1)
    },
  )
})

describe('closing the transport', () => {
  it('releases the binding of every open prepared transport and refuses new prepares', async () => {
    const { transport, close, probe } = build()
    const prepared = [
      await transport.prepare(REQUEST, SUPPLIER, { resent: [] }),
      await transport.prepare(REQUEST, SUPPLIER, { resent: [] }),
    ]
    expect(prepared.every(outcome => 'ok' in outcome)).toBe(true)
    await close()
    expect(probe.released).toBe(2)
    expect(await transport.prepare(REQUEST, SUPPLIER, { resent: [] })).toEqual({
      failure: { kind: 'unavailable', dependency: 'pi-transport', diagnostic: 'transport-closed' },
    })
  })

  it('aborts a running acquire and releases a binding that arrives after the close', async () => {
    const { transport, close, probe } = build()
    const gate = Promise.withResolvers<void>()
    probe.acquireGate = gate.promise
    const pending = transport.prepare(REQUEST, SUPPLIER, { resent: [] })
    await Promise.resolve()
    const closed = close()
    expect(probe.lastSignal?.aborted).toBe(true)
    gate.resolve()
    expect(await pending).toMatchObject({ failure: { kind: 'unavailable' } })
    await closed
    expect(probe.acquired).toBe(1)
    expect(probe.released).toBe(1)
  })

  it('waits for every prepared transport to close before it reports the first failed release', async () => {
    const family = createTestFamily()
    const defect = new Error('release defect')
    const slowRelease = Promise.withResolvers<void>()
    let acquires = 0
    const families: PiFamilyContributions = {
      async acquire(supplier, signal) {
        const acquired = await family.families.acquire(supplier, signal)
        if (!('ok' in acquired)) return acquired
        acquires += 1
        const release = acquires === 1 ? () => Promise.reject(defect) : () => slowRelease.promise
        return { ok: { ...acquired.ok, release } }
      },
    }
    const { transport, close } = createPiTransport(configWith({ families }))
    expect(await transport.prepare(REQUEST, SUPPLIER, { resent: [] })).toHaveProperty('ok')
    expect(await transport.prepare(REQUEST, SUPPLIER, { resent: [] })).toHaveProperty('ok')
    let settled = false
    const closed = close().finally(() => {
      settled = true
    })
    closed.catch(() => {})
    await new Promise(resolve => setImmediate(resolve))
    expect(settled).toBe(false)
    slowRelease.resolve()
    await expect(closed).rejects.toBe(defect)
  })

  it('is idempotent and does not close the injected network resources', async () => {
    const network = freshNetwork()
    const { close } = build({ network: network.handle })
    const first = close()
    expect(close()).toBe(first)
    await first
    expect(network.closed).toBe(false)
  })
})
