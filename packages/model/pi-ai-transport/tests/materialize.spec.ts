import { createHash } from 'node:crypto'
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import type {
  FixedModelRequest,
  MaterializedTransport,
  PreparedTransport,
} from '@omne-harness/model-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { createNetworkResources, type NetworkResources } from '../src/network.ts'
import { createPiTransport, type PiTransport } from '../src/transport.ts'
import {
  createTestFamily,
  END_MARKER,
  LIMITS,
  REQUEST,
  SUPPLIER,
  type FamilyProbe,
} from './support/test-family.ts'
import { slotFree } from './support/transport.ts'

// Nothing listens here; materialize never sends.
const ROUTE_URL = 'https://127.0.0.1:9/v1/chat/completions'
/** The body the test family encodes for REQUEST. */
const EXPECTED_BODY = '{"model":"test-model","messages":0}'

const networks: NetworkResources[] = []
const transports: PiTransport[] = []

afterEach(async () => {
  await Promise.all(transports.splice(0).map(transport => transport.close()))
  await Promise.all(networks.splice(0).map(network => network.close()))
})

function setup(maxConnections = 1): {
  network: NetworkResources
  probe: FamilyProbe
  prepare(request?: FixedModelRequest): Promise<PreparedTransport>
} {
  const network = createNetworkResources({ maxConnections, idleConnectionTimeoutMs: 1_000 })
  networks.push(network)
  const family = createTestFamily()
  const built = createPiTransport({
    network,
    families: family.families,
    routes: { [SUPPLIER.recipient]: { url: ROUTE_URL, endMarker: END_MARKER } },
    credential: { read: () => 'test-secret' },
    limits: LIMITS,
  })
  transports.push(built)
  return {
    network,
    probe: family.probe,
    async prepare(request = REQUEST) {
      const prepared = await built.transport.prepare(request, SUPPLIER)
      if (!('ok' in prepared)) throw new Error('expected a prepared transport')
      return prepared.ok
    },
  }
}

async function materialized(
  prepared: PreparedTransport,
  signal = new AbortController().signal,
): Promise<MaterializedTransport> {
  const outcome = await prepared.materialize(signal)
  if (!('ok' in outcome)) throw new Error(`expected a materialization: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

function referenceBlock(toModel: boolean): ContentBlock {
  const judged = judgeContentBlock({
    kind: 'image',
    id: 'block-ref',
    visibility: { toHuman: true, toModel },
    ref: { storage: 'store', key: 'key', mediaType: 'image/png', bytes: '10', digest: 'd' },
    transcript: null,
  })
  if (!('ok' in judged)) throw new Error(`the test built a refused block: ${judged.rejected}`)
  return judged.ok
}

describe('materialize', () => {
  it('names the supplier, the representation and the SHA-256 of the encoded body in a stable receipt', async () => {
    const { prepare } = setup()
    const first = await materialized(await prepare())
    const digest = createHash('sha256').update(EXPECTED_BODY).digest('hex')
    expect(first.receipt).toEqual({
      supplier: SUPPLIER.adoption,
      representation: REQUEST.representation,
      payloadDigest: digest,
    })
    expect(first.receipt).toBe(first.receipt)
    await first.close()
    const second = await materialized(await prepare())
    expect(second.receipt).toEqual(first.receipt)
  })

  it('gives the family the request and no media', async () => {
    const { prepare, probe } = setup()
    await materialized(await prepare())
    expect(probe.encoded).toEqual({ request: REQUEST, media: [] })
  })

  it('holds the slot until close returns it', async () => {
    const { prepare, network } = setup()
    const held = await materialized(await prepare())
    expect(await slotFree(network)).toBe(false)
    await held.close()
    expect(await slotFree(network)).toBe(true)
    await held.close()
    expect(await slotFree(network)).toBe(true)
  })

  it('answers unsupported with the path of a model-visible content reference and returns the slot', async () => {
    const { prepare, network, probe } = setup()
    const request = { ...REQUEST, system: [referenceBlock(true)] }
    const outcome = await (await prepare(request)).materialize(new AbortController().signal)
    expect(outcome).toEqual({
      failure: { kind: 'unsupported', field: '/system/0', adapter: expect.anything() },
    })
    expect(probe.encoded).toBeUndefined()
    expect(await slotFree(network)).toBe(true)
  })

  it('materializes a request whose content reference the model does not see', async () => {
    const { prepare } = setup()
    const request = { ...REQUEST, system: [referenceBlock(false)] }
    expect((await materialized(await prepare(request))).receipt.payloadDigest).toMatch(
      /^[0-9a-f]{64}$/,
    )
  })

  it('gives an encode failure unchanged and returns the slot', async () => {
    const { prepare, network, probe } = setup()
    const failure = { kind: 'invalid', field: 'messages', reason: 'test' } as const
    probe.encodeFailure = failure
    expect(await (await prepare()).materialize(new AbortController().signal)).toEqual({ failure })
    expect(await slotFree(network)).toBe(true)
  })

  it('answers invalid to a second materialize of the same prepared transport, without a reservation', async () => {
    const { prepare } = setup(1)
    const prepared = await prepare()
    await materialized(prepared)
    // The only slot is held: a second materialize that reserved would wait for ever.
    expect(await prepared.materialize(new AbortController().signal)).toEqual({
      failure: { kind: 'invalid', field: 'materialize', reason: 'repeated' },
    })
  })

  it('answers unavailable when the signal is already aborted, and takes no slot', async () => {
    const { prepare, network } = setup()
    const aborted = new AbortController()
    aborted.abort()
    expect(await (await prepare()).materialize(aborted.signal)).toEqual({
      failure: { kind: 'unavailable', dependency: 'connection-capacity', diagnostic: 'cancelled' },
    })
    expect(await slotFree(network)).toBe(true)
  })
})

describe('waiting for capacity', () => {
  it('waits while the slot is held, and a cancel ends the wait with unavailable and no reservation', async () => {
    const { prepare, network } = setup(1)
    const held = await materialized(await prepare())
    const controller = new AbortController()
    const waiting = (await prepare()).materialize(controller.signal)
    controller.abort()
    expect(await waiting).toEqual({
      failure: { kind: 'unavailable', dependency: 'connection-capacity', diagnostic: 'cancelled' },
    })
    await held.close()
    expect(await slotFree(network)).toBe(true)
  })

  it('a waiting materialize gets the slot that the close of another materialization returns', async () => {
    const { prepare } = setup(1)
    const held = await materialized(await prepare())
    const waiting = (await prepare()).materialize(new AbortController().signal)
    await held.close()
    expect(await waiting).toMatchObject({ ok: { receipt: held.receipt } })
  })

  it('the close of the network resources ends the wait with unavailable', async () => {
    const { prepare, network } = setup(1)
    await materialized(await prepare())
    const waiting = (await prepare()).materialize(new AbortController().signal)
    await network.close()
    expect(await waiting).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'connection-capacity',
        diagnostic: 'network-closed',
      },
    })
  })

  it('the close of the prepared transport ends its waiting materialize and then releases the binding', async () => {
    const { prepare, probe } = setup(1)
    await materialized(await prepare())
    const prepared = await prepare()
    const waiting = prepared.materialize(new AbortController().signal)
    const closed = prepared.close()
    expect(await waiting).toMatchObject({ failure: { kind: 'unavailable' } })
    await closed
    expect(probe.released).toBe(1)
  })

  it('the close of the prepared transport returns the slot of its materialization', async () => {
    const { prepare, network } = setup(1)
    const prepared = await prepare()
    await materialized(prepared)
    await prepared.close()
    expect(await slotFree(network)).toBe(true)
  })
})
