// Test support for the transport specs: a transport over given network resources and the test
// family, the count of sends, and the collection of a fact stream.
import type {
  MaterializedTransport,
  PreparedTransport,
  TransportFact,
} from '@omne-harness/model-contract'
import type { PiCredentialSlot, PiTransportLimits } from '../../src/index.ts'
import type { NetworkResources } from '../../src/network.ts'
import { createPiTransport, type PiTransport } from '../../src/transport.ts'
import {
  createTestFamily,
  END_MARKER,
  LIMITS,
  REQUEST,
  SUPPLIER,
  type FamilyProbe,
} from './test-family.ts'

/**
 * Counts the exchanges that start on the network resources. Every exchange registers itself in
 * the in-flight registry in the same synchronous call that hands the request to Node, so the
 * count is exact right after `start` returns.
 */
export function countSends(network: NetworkResources): () => number {
  const registry = network.inFlight
  const add = registry.add.bind(registry)
  let sends = 0
  registry.add = exchange => {
    sends += 1
    return add(exchange)
  }
  return () => sends
}

export type TransportUnderTest = PiTransport &
  Readonly<{
    probe: FamilyProbe
    sends: () => number
    /** Prepares REQUEST for SUPPLIER and expects success. */
    prepare(): Promise<PreparedTransport>
    /** Prepares and materializes REQUEST and expects success. */
    materialize(signal?: AbortSignal): Promise<MaterializedTransport>
  }>

export function transportOver(
  network: NetworkResources,
  options: Readonly<{
    url: string
    credential?: PiCredentialSlot
    limits?: PiTransportLimits
  }>,
): TransportUnderTest {
  const family = createTestFamily()
  const sends = countSends(network)
  const built = createPiTransport({
    network,
    families: family.families,
    routes: { [SUPPLIER.recipient]: { url: options.url, endMarker: END_MARKER } },
    credential: options.credential ?? { read: () => 'test-secret' },
    limits: options.limits ?? LIMITS,
  })
  async function prepare(): Promise<PreparedTransport> {
    const prepared = await built.transport.prepare(REQUEST, SUPPLIER)
    if (!('ok' in prepared)) throw new Error(`prepare failed: ${JSON.stringify(prepared)}`)
    return prepared.ok
  }
  return {
    ...built,
    probe: family.probe,
    sends,
    prepare,
    async materialize(signal = new AbortController().signal) {
      const materialized = await (await prepare()).materialize(signal)
      if (!('ok' in materialized))
        throw new Error(`materialize failed: ${JSON.stringify(materialized)}`)
      return materialized.ok
    },
  }
}

export async function collect(stream: AsyncIterable<TransportFact>): Promise<TransportFact[]> {
  const facts: TransportFact[] = []
  for await (const fact of stream) facts.push(fact)
  return facts
}

/** True when the capacity grants a reservation at once; the reservation goes back right away. */
export async function slotFree(network: NetworkResources): Promise<boolean> {
  const controller = new AbortController()
  const pending = network.capacity.reserve(controller.signal)
  controller.abort()
  const reservation = await pending
  reservation?.release()
  return reservation !== undefined
}
