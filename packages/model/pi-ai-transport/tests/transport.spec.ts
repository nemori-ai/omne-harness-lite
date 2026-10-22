import { afterEach, describe, expect, it } from 'vitest'
import type { PiFamilyContributions, PiTransportConfig } from '../src/index.ts'
import { openNetwork, type NetworkInternals } from '../src/network.ts'
import { createPiTransport, type PiTransport } from '../src/transport.ts'
import { createTestFamily, END_MARKER, LIMITS, REQUEST, SUPPLIER } from './support/test-family.ts'
import { collect, countSends, slotFree } from './support/transport.ts'

const PREPARED_CLOSED_FAILURE = {
  kind: 'unavailable',
  dependency: 'pi-transport',
  diagnostic: 'prepared-closed',
} as const

// Nothing listens here; the fast tests never start an exchange.
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
    routes: { [SUPPLIER.recipient]: { url: ROUTE_URL, endMarker: END_MARKER } },
    credential: { read: () => 'test-secret' },
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
    ['a route URL that does not parse', { routes: { r: { url: 'not a url', endMarker: null } } }],
    ['an http: route URL', { routes: { r: { url: 'http://127.0.0.1/', endMarker: null } } }],
    [
      'a route URL with credentials',
      { routes: { r: { url: 'https://user:pass@127.0.0.1/', endMarker: null } } },
    ],
    [
      'a route URL with a query',
      { routes: { r: { url: 'https://127.0.0.1/?a=1', endMarker: null } } },
    ],
    ['a connect timeout of zero', { limits: { ...LIMITS, connectTimeoutMs: 0 } }],
    [
      'a connect timeout above the timer limit',
      { limits: { ...LIMITS, connectTimeoutMs: 2 ** 31 } },
    ],
    ['an error body limit of zero', { limits: { ...LIMITS, maxErrorBodyBytes: 0 } }],
    ['a fractional event limit', { limits: { ...LIMITS, maxEventBytes: 1.5 } }],
    ['a JSON depth of zero', { limits: { ...LIMITS, json: { ...LIMITS.json, maxDepth: 0 } } }],
  ] satisfies readonly (readonly [string, Partial<PiTransportConfig>])[])(
    'refuses %s synchronously with a RangeError',
    (_name, overrides) => {
      expect(() => createPiTransport(configWith(overrides))).toThrow(RangeError)
    },
  )

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
      createPiTransport(configWith({ routes: { r: { url: secretUrl, endMarker: null } } })),
    ).toThrow(/^each route url must be/)
    try {
      createPiTransport(configWith({ routes: { r: { url: secretUrl, endMarker: null } } }))
    } catch (error) {
      expect(String(error)).not.toContain('hunter2')
    }
  })

  it('accepts a connect timeout of null', () => {
    expect(() =>
      createPiTransport(configWith({ limits: { ...LIMITS, connectTimeoutMs: null } })),
    ).not.toThrow()
  })
})

describe('prepare', () => {
  it('answers unsupported for a recipient without a route, without acquiring a binding', async () => {
    const { transport, probe } = build()
    const outcome = await transport.prepare(REQUEST, { ...SUPPLIER, recipient: 'elsewhere' })
    expect(outcome).toEqual({
      failure: { kind: 'unsupported', field: 'supplier.recipient', adapter: SUPPLIER.adoption },
    })
    expect(probe.acquired).toBe(0)
  })

  it('does not take a route from the prototype of the routes object', async () => {
    const { transport } = build()
    const outcome = await transport.prepare(REQUEST, { ...SUPPLIER, recipient: 'toString' })
    expect(outcome).toMatchObject({ failure: { kind: 'unsupported' } })
  })

  it('gives the failure of the family acquire unchanged', async () => {
    const { transport, probe } = build()
    const failure = { kind: 'denied', action: 'family' } as const
    probe.acquireFailure = failure
    expect(await transport.prepare(REQUEST, SUPPLIER)).toEqual({ failure })
  })

  it('acquires one binding for the supplier, and the close of the prepared transport releases it once', async () => {
    const { transport, probe } = build()
    const prepared = await transport.prepare(REQUEST, SUPPLIER)
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
    const prepared = await transport.prepare(REQUEST, SUPPLIER)
    if (!('ok' in prepared)) throw new Error('expected a prepared transport')
    await prepared.ok.close()
    expect(await prepared.ok.materialize(new AbortController().signal)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'pi-transport' },
    })
  })
})

describe('closing a prepared transport while it materializes', () => {
  // With the test family, materialize returns after three microtasks. A close in that window
  // must win: the caller gets unavailable. A later close finds a materialization that was
  // already handed out and closes it: its start sends nothing and ends interrupted.
  it.each([0, 1, 2, 3, 4])(
    'a close that starts %i microtasks after materialize never lets a send out',
    async gap => {
      const network = freshNetwork()
      const sends = countSends(network)
      const { transport, probe } = build({ network: network.handle })
      const prepared = await transport.prepare(REQUEST, SUPPLIER)
      if (!('ok' in prepared)) throw new Error('expected a prepared transport')
      const pending = prepared.ok.materialize(new AbortController().signal)
      for (let turn = 0; turn < gap; turn += 1) await Promise.resolve()
      const closed = prepared.ok.close()
      const outcome = await pending
      const facts =
        'ok' in outcome ? await collect(outcome.ok.start(new AbortController().signal)) : []
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
      await transport.prepare(REQUEST, SUPPLIER),
      await transport.prepare(REQUEST, SUPPLIER),
    ]
    expect(prepared.every(outcome => 'ok' in outcome)).toBe(true)
    await close()
    expect(probe.released).toBe(2)
    expect(await transport.prepare(REQUEST, SUPPLIER)).toEqual({
      failure: { kind: 'unavailable', dependency: 'pi-transport', diagnostic: 'transport-closed' },
    })
  })

  it('aborts a running acquire and releases a binding that arrives after the close', async () => {
    const { transport, close, probe } = build()
    const gate = Promise.withResolvers<void>()
    probe.acquireGate = gate.promise
    const pending = transport.prepare(REQUEST, SUPPLIER)
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
    // Not kept for afterEach: this close rejects by design.
    const { transport, close } = createPiTransport(configWith({ families }))
    expect(await transport.prepare(REQUEST, SUPPLIER)).toHaveProperty('ok')
    expect(await transport.prepare(REQUEST, SUPPLIER)).toHaveProperty('ok')
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
