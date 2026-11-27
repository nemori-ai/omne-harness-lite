import type {
  MaterializedTransport,
  PreparedTransport,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import type {
  PiCredentialSlot,
  PiRouteAuth,
  PiTransportConfig,
  PiTransportLimits,
  PiRoute,
} from '../../src/index.ts'
import type { NetworkInternals } from '../../src/network.ts'
import { createPiTransport, type PiTransport } from '../../src/transport.ts'
import {
  createTestFamily,
  END_MARKER,
  LIMITS,
  REQUEST,
  SUPPLIER,
  type FamilyProbe,
} from './test-family.ts'

const GATEWAY_ACCOUNTING: PiRoute['accounting'] = {
  place: 'openrouter',
  costUnit: 'openrouter-credit',
  generation: { requestHeader: 'x-generation-id', path: '/api/v1/generation' },
}

export function countSends(network: NetworkInternals): () => number {
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
    prepare(): Promise<PreparedTransport>
    materialize(signal?: AbortSignal): Promise<MaterializedTransport>
  }>

export function transportOver(
  network: NetworkInternals,
  options: Readonly<{
    url: string
    credential?: PiCredentialSlot
    auth?: PiRouteAuth
    accounting?: PiRoute['accounting']
    limits?: PiTransportLimits
    onConnectRetry?: PiTransportConfig['onConnectRetry']
    onResponseBody?: PiTransportConfig['onResponseBody']
  }>,
): TransportUnderTest {
  const family = createTestFamily()
  const sends = countSends(network)
  const built = createPiTransport({
    network: network.handle,
    families: family.families,
    routes: {
      [SUPPLIER.provider]: {
        endpoints: { 'chat-completions': { url: options.url, endMarker: END_MARKER } },
        accounting: options.accounting ?? GATEWAY_ACCOUNTING,
        auth: options.auth === undefined ? { kind: 'bearer', item: 'apiKey' } : options.auth,
      },
    },
    credential: options.credential ?? { read: () => new Map([['apiKey', 'test-secret']]) },
    limits: options.limits ?? LIMITS,
    ...(options.onConnectRetry === undefined ? {} : { onConnectRetry: options.onConnectRetry }),
    ...(options.onResponseBody === undefined ? {} : { onResponseBody: options.onResponseBody }),
  })
  async function prepare(): Promise<PreparedTransport> {
    const prepared = await built.transport.prepare(REQUEST, SUPPLIER, { resent: [] })
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

export async function slotFree(network: NetworkInternals): Promise<boolean> {
  const controller = new AbortController()
  const pending = network.capacity.reserve(controller.signal)
  controller.abort()
  const reservation = await pending
  reservation?.release()
  return reservation !== undefined
}
