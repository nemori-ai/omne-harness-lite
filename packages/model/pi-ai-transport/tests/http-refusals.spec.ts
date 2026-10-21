import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionReservation } from '../src/capacity.ts'
import { startExchange, type ExchangeInput, type ExchangeRefusal } from '../src/http.ts'
import { createNetworkResources, type NetworkResources } from '../src/network.ts'

// Nothing listens here: a refusal that still sent would surface as a connect failure.
const UNREACHABLE = new URL('https://127.0.0.1:9/v1/responses')

const resources: NetworkResources[] = []

function fresh(maxConnections = 1): NetworkResources {
  const created = createNetworkResources({ maxConnections, idleConnectionTimeoutMs: 1_000 })
  resources.push(created)
  return created
}

afterEach(async () => {
  await Promise.all(resources.splice(0).map(created => created.close()))
})

async function held(network: NetworkResources): Promise<ConnectionReservation> {
  const reservation = await network.capacity.reserve(new AbortController().signal)
  if (reservation === undefined) throw new Error('expected a held reservation')
  return reservation
}

function input(
  reservation: ConnectionReservation,
  overrides: Partial<ExchangeInput> = {},
): ExchangeInput {
  return {
    url: UNREACHABLE,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: new Uint8Array([123, 125]),
    reservation,
    connectTimeoutMs: 1_000,
    maxErrorBodyBytes: 1_024,
    ...overrides,
  }
}

/** No socket was opened and nothing waits for one, through the documented `agent` properties. */
function expectNoNetworkUse(network: NetworkResources): void {
  expect(network.agent.sockets).toEqual({})
  expect(network.agent.requests).toEqual({})
}

/** Starts with a held reservation and expects a refusal that returns it without any network use. */
async function refused(
  overrides: Partial<ExchangeInput>,
  reason: ExchangeRefusal,
  network = fresh(),
): Promise<void> {
  const reservation = await held(network)
  const start = startExchange(network, input(reservation, overrides), new AbortController().signal)
  expect(start).toEqual({ kind: 'refused', reason })
  expect(reservation.state).toBe('released')
  expectNoNetworkUse(network)
  expect((await held(network)).state).toBe('held')
}

describe('refusing an exchange before anything is sent', () => {
  it.each([
    { url: 'http://127.0.0.1:9/v1', why: 'http' },
    { url: 'https://user@127.0.0.1:9/v1', why: 'a username' },
    { url: 'https://:secret@127.0.0.1:9/v1', why: 'a password' },
    { url: 'https://127.0.0.1:9/v1?key=value', why: 'a query' },
    { url: 'https://127.0.0.1:9/v1#fragment', why: 'a fragment' },
  ])('refuses the URL $url ($why) as invalid-url', async ({ url }) => {
    await refused({ url: new URL(url) }, 'invalid-url')
  })

  it('refuses a URL given as a string, not a URL object, as invalid-url', async () => {
    // @ts-expect-error The runtime boundary must hold for a caller without the types.
    await refused({ url: UNREACHABLE.href }, 'invalid-url')
  })

  it.each([
    { headers: { 'bad name': 'value' }, why: 'a space in the name' },
    { headers: { 'x-token': 'line\nbreak' }, why: 'a line break in the value' },
    { headers: { 'x-token': 'carriage\rreturn' }, why: 'a carriage return in the value' },
    { headers: { 'x-token': 'caf\u00e9' }, why: 'a non-ASCII value' },
    { headers: { 'x-token': 'del\u007f' }, why: 'DEL in the value' },
    { headers: { '': 'value' }, why: 'an empty name' },
  ])('refuses the headers $headers ($why) as invalid-header', async ({ headers }) => {
    await refused({ headers }, 'invalid-header')
  })

  it.each([
    { headers: null, why: 'null' },
    { headers: 'authorization: Bearer x', why: 'a string' },
    { headers: ['authorization'], why: 'an array' },
    { headers: 42, why: 'a number' },
  ])(
    'refuses headers that are not a record ($why) as invalid-header, without a throw',
    async ({ headers }) => {
      // @ts-expect-error The runtime boundary must hold for a caller without the types.
      await refused({ headers }, 'invalid-header')
    },
  )

  it('refuses a body that is not bytes as invalid-body', async () => {
    // @ts-expect-error The runtime boundary must hold for a caller without the types.
    await refused({ body: '{}' }, 'invalid-body')
  })

  it.each([
    [{ maxErrorBodyBytes: 0 }],
    [{ maxErrorBodyBytes: -1 }],
    [{ maxErrorBodyBytes: 1.5 }],
    [{ maxErrorBodyBytes: Number.NaN }],
    [{ connectTimeoutMs: 0 }],
    [{ connectTimeoutMs: Number.POSITIVE_INFINITY }],
    // One above the largest delay a Node timer takes; a larger value would fire after 1 ms.
    [{ connectTimeoutMs: 2_147_483_648 }],
  ])('refuses the limits %j as invalid-limit', async limits => {
    await refused(limits, 'invalid-limit')
  })

  it('refuses a reservation of another capacity as reservation-unusable and leaves it held', async () => {
    const network = fresh()
    const other = fresh()
    const foreign = await held(other)

    const start = startExchange(network, input(foreign), new AbortController().signal)
    expect(start).toEqual({ kind: 'refused', reason: 'reservation-unusable' })
    expect(foreign.state).toBe('held')
    expectNoNetworkUse(network)
  })

  it('refuses a look-alike reservation as reservation-unusable without consuming the real one', async () => {
    const network = fresh()
    const real = await held(network)
    const lookAlike: ConnectionReservation = {
      state: 'held',
      consume: () => real.consume(),
      release: () => real.release(),
    }

    const start = startExchange(network, input(lookAlike), new AbortController().signal)
    expect(start).toEqual({ kind: 'refused', reason: 'reservation-unusable' })
    expect(real.state).toBe('held')
    expectNoNetworkUse(network)
  })

  it('a signal that is not an AbortSignal throws a TypeError after the held reservation returned', async () => {
    const network = fresh()
    const reservation = await held(network)

    // @ts-expect-error The runtime boundary must hold for a caller without the types.
    expect(() => startExchange(network, input(reservation), {})).toThrow(TypeError)
    expect(reservation.state).toBe('released')
    expectNoNetworkUse(network)
    expect((await held(network)).state).toBe('held')
  })

  it('refuses a consumed reservation as reservation-unusable and leaves it to its owner', async () => {
    const network = fresh()
    const reservation = await held(network)
    const consumed = reservation.consume()
    if (!('ok' in consumed)) throw new Error('expected a seat')

    const start = startExchange(network, input(reservation), new AbortController().signal)
    expect(start).toEqual({ kind: 'refused', reason: 'reservation-unusable' })
    expect(reservation.state).toBe('consumed')
    expectNoNetworkUse(network)
    consumed.ok.release()
    expect(reservation.state).toBe('released')
  })

  it('refuses a released reservation as reservation-unusable', async () => {
    const network = fresh()
    const reservation = await held(network)
    reservation.release()

    const start = startExchange(network, input(reservation), new AbortController().signal)
    expect(start).toEqual({ kind: 'refused', reason: 'reservation-unusable' })
    expectNoNetworkUse(network)
  })

  it('refuses once the resources are closed and returns the held reservation', async () => {
    const network = fresh()
    const reservation = await held(network)
    await network.close()

    const start = startExchange(network, input(reservation), new AbortController().signal)
    expect(start).toEqual({ kind: 'refused', reason: 'resources-closed' })
    expect(reservation.state).toBe('released')
    expectNoNetworkUse(network)
  })

  it('refuses an already aborted signal as cancelled before any check of the input', async () => {
    const network = fresh()
    const reservation = await held(network)
    const controller = new AbortController()
    controller.abort()

    const start = startExchange(
      network,
      input(reservation, { maxErrorBodyBytes: 0 }),
      controller.signal,
    )
    expect(start).toEqual({ kind: 'refused', reason: 'cancelled' })
    expect(reservation.state).toBe('released')
    expectNoNetworkUse(network)
  })
})

describe('a synchronous throw inside startExchange', () => {
  it('reports the first error although reading the reservation throws again while the slot is returned', async () => {
    const network = fresh()
    const reservation = await held(network)
    let reads = 0
    const defective: ExchangeInput = {
      ...input(reservation),
      get reservation(): ConnectionReservation {
        reads += 1
        throw new Error(`read ${reads}`)
      },
    }

    expect(() => startExchange(network, defective, new AbortController().signal)).toThrow('read 1')
    expectNoNetworkUse(network)
    expect(reservation.state).toBe('held') // Never reached: the input hid it behind the throw.
    reservation.release()
  })

  it('reports the first error although the resources are not an object', async () => {
    const network = fresh()
    const reservation = await held(network)

    // @ts-expect-error The runtime boundary must hold for a caller without the types.
    expect(() => startExchange(null, input(reservation), new AbortController().signal)).toThrow(
      /reading 'closed'/,
    )
    expect(reservation.state).toBe('held')
    reservation.release()
  })
})

describe('configuring the network resources', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects maxConnections %s synchronously with a RangeError',
    maxConnections => {
      expect(() =>
        createNetworkResources({ maxConnections, idleConnectionTimeoutMs: 1_000 }),
      ).toThrow(RangeError)
    },
  )

  it.each([0, -1, 1.5, Number.NaN, 2_147_483_648])(
    'rejects idleConnectionTimeoutMs %s synchronously with a RangeError',
    idleConnectionTimeoutMs => {
      expect(() => createNetworkResources({ maxConnections: 1, idleConnectionTimeoutMs })).toThrow(
        RangeError,
      )
    },
  )

  it('accepts the largest delay a Node timer takes as idleConnectionTimeoutMs', async () => {
    const network = createNetworkResources({
      maxConnections: 1,
      idleConnectionTimeoutMs: 2_147_483_647,
    })
    resources.push(network)
    expect(network.closed).toBe(false)
  })

  it('rejects a diagnostics maxPending below one synchronously with a RangeError', () => {
    expect(() =>
      createNetworkResources({
        maxConnections: 1,
        idleConnectionTimeoutMs: 1_000,
        diagnostics: { observer: () => undefined, maxPending: 0 },
      }),
    ).toThrow(RangeError)
  })

  it('without an observer the counters read zero and the resources still close', async () => {
    const network = fresh()
    expect(network.diagnostics.counters()).toEqual({ failed: 0, pending: 0, dropped: 0 })
    await network.close()
    expect(network.closed).toBe(true)
  })
})
