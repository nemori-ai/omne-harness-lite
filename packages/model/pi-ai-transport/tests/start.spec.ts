// The starts that send nothing. The starts that send are in transport-exchange.spec.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { openNetwork, type NetworkInternals } from '../src/network.ts'
import type { PiTransport } from '../src/transport.ts'
import { collect, slotFree, transportOver, type TransportUnderTest } from './support/transport.ts'

// Nothing listens here: these starts never reach the network.
const ROUTE_URL = 'https://127.0.0.1:9/v1/chat/completions'

const networks: NetworkInternals[] = []
const transports: PiTransport[] = []

afterEach(async () => {
  await Promise.all(transports.splice(0).map(transport => transport.close()))
  await Promise.all(networks.splice(0).map(network => network.close()))
})

function setup(
  credential: () => string | undefined = () => 'test-secret',
): TransportUnderTest & { network: NetworkInternals } {
  const network = openNetwork({ maxConnections: 1, idleConnectionTimeoutMs: 1_000 })
  networks.push(network)
  const transport = transportOver(network, { url: ROUTE_URL, credential: { read: credential } })
  transports.push(transport)
  return { ...transport, network }
}

describe('a start that sends nothing', () => {
  it('without a credential ends failed with credential, sends nothing and returns the slot', async () => {
    const { materialize, sends, network } = setup(() => undefined)
    const materialized = await materialize()
    const facts = await collect(materialized.start(new AbortController().signal))
    expect(facts).toEqual([
      {
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: {
            cause: 'credential',
            diagnostic: 'credential-not-provided',
            upstreamStatus: null,
          },
        },
      },
    ])
    expect(sends()).toBe(0)
    expect(await slotFree(network)).toBe(true)
  })

  it('with a credential that is not a header value ends failed with credential and never shows it', async () => {
    const { materialize, sends, network } = setup(() => 'secret\nwith a line break')
    const facts = await collect((await materialize()).start(new AbortController().signal))
    expect(facts).toEqual([
      {
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: {
            cause: 'credential',
            diagnostic: 'credential-not-a-header-value',
            upstreamStatus: null,
          },
        },
      },
    ])
    expect(JSON.stringify(facts)).not.toContain('secret')
    expect(sends()).toBe(0)
    expect(await slotFree(network)).toBe(true)
  })

  it('with an aborted signal ends interrupted and confirmed, without reading the credential', async () => {
    let reads = 0
    const { materialize, sends, network } = setup(() => {
      reads += 1
      return 'test-secret'
    })
    const aborted = new AbortController()
    aborted.abort()
    const facts = await collect((await materialize()).start(aborted.signal))
    expect(facts).toEqual([
      { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
    ])
    expect(reads).toBe(0)
    expect(sends()).toBe(0)
    expect(await slotFree(network)).toBe(true)
  })

  it('after the network resources closed ends interrupted and confirmed', async () => {
    const { materialize, sends, network } = setup()
    const materialized = await materialize()
    await network.close()
    expect(await collect(materialized.start(new AbortController().signal))).toEqual([
      { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
    ])
    expect(sends()).toBe(0)
  })

  it('a second start gives an empty stream and reads nothing', async () => {
    let reads = 0
    const { materialize, sends } = setup(() => {
      reads += 1
      return undefined
    })
    const materialized = await materialize()
    await collect(materialized.start(new AbortController().signal))
    expect(await collect(materialized.start(new AbortController().signal))).toEqual([])
    expect(reads).toBe(1)
    expect(sends()).toBe(0)
  })

  it.each([
    ['the close of the materialization', 'materialized'],
    ['the close of its prepared transport', 'prepared'],
    ['the close of the transport', 'transport'],
  ] as const)(
    'a start after %s sends nothing and ends interrupted and confirmed',
    async (_name, closer) => {
      let reads = 0
      const { prepare, close, sends, network } = setup(() => {
        reads += 1
        return 'test-secret'
      })
      const prepared = await prepare()
      const outcome = await prepared.materialize(new AbortController().signal)
      if (!('ok' in outcome)) throw new Error('expected a materialization')
      const materialized = outcome.ok
      switch (closer) {
        case 'materialized':
          await materialized.close()
          break
        case 'prepared':
          await prepared.close()
          break
        case 'transport':
          await close()
          break
        default: {
          const _exhaustive: never = closer
          return _exhaustive
        }
      }
      expect(await collect(materialized.start(new AbortController().signal))).toEqual([
        { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
      ])
      expect(reads).toBe(0)
      expect(sends()).toBe(0)
      expect(await slotFree(network)).toBe(true)
    },
  )

  it('reads the credential slot once, inside the synchronous start call', async () => {
    let inside = false
    const readsInside: boolean[] = []
    const { materialize } = setup(() => {
      readsInside.push(inside)
      return undefined
    })
    const materialized = await materialize()
    inside = true
    const stream = materialized.start(new AbortController().signal)
    inside = false
    await collect(stream)
    expect(readsInside).toEqual([true])
  })
})
