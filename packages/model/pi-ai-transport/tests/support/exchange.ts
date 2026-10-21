// Test support shared by the exchange and network specs: inputs, reservations and observation.
import { getEventListeners } from 'node:events'
import type { Socket } from 'node:net'
import { expect } from 'vitest'
import type { ConnectionCapacity, ConnectionReservation } from '../../src/capacity.ts'
import type { TransportDiagnostic } from '../../src/diagnostics.ts'
import type { ExchangeInput, ExchangeResult, ExchangeStart, HttpExchange } from '../../src/http.ts'
import {
  createNetworkResources,
  type NetworkConfig,
  type NetworkResources,
} from '../../src/network.ts'

export const encoder = new TextEncoder()
export const decoder = new TextDecoder()

export const REQUEST_BODY = encoder.encode('{"model":"test","messages":[{"role":"user"}]}')
export const REQUEST_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  authorization: 'Bearer test-credential-value',
  'content-type': 'application/json',
  'x-title': 'omne harness test',
})
export const REQUEST_PATH = '/api/v1/chat/completions'

/** The initial values of this test suite; every limit is a parameter, not a package default. */
export function network(
  ca: Buffer,
  overrides: Partial<NetworkConfig> = {},
  observed?: TransportDiagnostic[],
): NetworkResources {
  return createNetworkResources({
    maxConnections: 1,
    idleConnectionTimeoutMs: 60_000,
    tls: { ca },
    ...(observed === undefined
      ? {}
      : {
          diagnostics: {
            observer: (event: TransportDiagnostic) => observed.push(event),
            maxPending: 8,
          },
        }),
    ...overrides,
  })
}

export async function held(
  resources: Readonly<{ capacity: Pick<ConnectionCapacity, 'reserve'> }>,
): Promise<ConnectionReservation> {
  const reservation = await resources.capacity.reserve(new AbortController().signal)
  if (reservation === undefined) throw new Error('expected a held reservation')
  return reservation
}

export function input(
  base: URL,
  reservation: ConnectionReservation,
  overrides: Partial<ExchangeInput> = {},
): ExchangeInput {
  return {
    url: new URL(REQUEST_PATH, base),
    headers: REQUEST_HEADERS,
    body: REQUEST_BODY,
    reservation,
    connectTimeoutMs: 2_000,
    maxErrorBodyBytes: 4_096,
    ...overrides,
  }
}

export function started(start: ExchangeStart): HttpExchange {
  if (start.kind !== 'started') throw new Error(`exchange refused: ${start.reason}`)
  return start.exchange
}

/** The body of a 2xx result, claimed here. Throws for any other result or a second claim. */
export function claimed(result: ExchangeResult): AsyncIterable<Uint8Array> {
  if (result.kind !== 'ok') throw new Error(`expected a 2xx result, got ${result.kind}`)
  const body = result.body.claim()
  if (body === undefined) throw new Error('the body was already claimed')
  return body
}

export async function readToEnd(bytes: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of bytes) chunks.push(chunk)
  return decoder.decode(Buffer.concat(chunks))
}

/** Lets every queued promise job and one macrotask run. */
export async function settle(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Observes a promise without awaiting it. */
export function watch<T>(promise: Promise<T>): {
  readonly done: boolean
  readonly value: T | undefined
} {
  const observed: { done: boolean; value: T | undefined } = { done: false, value: undefined }
  // The observed promise is a test input that never rejects.
  void promise.then(value => {
    observed.done = true
    observed.value = value
  })
  return observed
}

/** The client sockets the pool currently has in use, through the documented `agent.sockets`. */
export function clientSockets(resources: NetworkResources): readonly Socket[] {
  return Object.values(resources.agent.sockets).flatMap(sockets => sockets ?? [])
}

/** The requests the pool has not given a socket yet, through the documented `agent.requests`. */
export function queuedRequests(resources: Pick<NetworkResources, 'agent'>): number {
  return Object.values(resources.agent.requests).flatMap(queue => queue ?? []).length
}

/** The timers that keep the process alive right now, through `process.getActiveResourcesInfo()`. */
export function activeTimers(): number {
  return process.getActiveResourcesInfo().filter(kind => kind === 'Timeout').length
}

/** After `stopped`: the abort listener left the signal and the exchange left the registry. */
export function expectCleanedUp(resources: NetworkResources, signal: AbortSignal): void {
  expect(getEventListeners(signal, 'abort')).toHaveLength(0)
  expect(resources.inFlight.size).toBe(0)
}
