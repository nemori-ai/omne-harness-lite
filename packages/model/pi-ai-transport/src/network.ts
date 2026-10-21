import { Agent } from 'node:https'
import { createConnectionCapacity, type ConnectionCapacity } from './capacity.ts'
import {
  createDiagnosticSink,
  type DiagnosticObserver,
  type IsolatedDiagnostics,
} from './diagnostics.ts'
import type { ExchangeResources, InFlightExchange, TlsOptions } from './http.ts'
import { isTimerDuration, MAX_TIMER_MS } from './limits.ts'

/** Every limit comes from the caller; the package holds no default policy. */
export type NetworkConfig = Readonly<{
  /** The connection capacity: how many exchanges may be in flight at once. The pool has no socket limit. */
  maxConnections: number
  /** A pooled idle socket is closed after this long without traffic. At most `MAX_TIMER_MS`. */
  idleConnectionTimeoutMs: number
  tls?: TlsOptions
  /** Absent: nothing is observed and the counters stay at zero. */
  diagnostics?: Readonly<{ observer: DiagnosticObserver; maxPending: number }>
}>

/**
 * The capacity, the socket pool and the in-flight registry that exchanges share. `close()` is
 * idempotent and remembered: it closes the capacity, stops every in-flight exchange, destroys
 * the pool, then waits until every in-flight exchange has physically stopped.
 */
export interface NetworkResources extends ExchangeResources {
  readonly capacity: ConnectionCapacity
  close(): Promise<void>
}

export function createNetworkResources(config: NetworkConfig): NetworkResources {
  requirePositiveInteger(config.maxConnections, 'maxConnections')
  requireTimerDuration(config.idleConnectionTimeoutMs, 'idleConnectionTimeoutMs')
  const diagnostics =
    config.diagnostics === undefined
      ? SILENT
      : createDiagnosticSink(config.diagnostics.observer, {
          maxPending: config.diagnostics.maxPending,
        })
  const capacity = createConnectionCapacity(config.maxConnections)
  // The capacity alone bounds the exchanges in flight; the pool only reuses sockets and closes
  // idle ones. A socket limit equal to the capacity would queue a request that holds a slot: Node
  // takes a socket it does not keep out of the pool's count only when the socket's close arrives,
  // a turn of the loop after the request's close, where the slot returns and the next waiter starts.
  const agent = new Agent({
    keepAlive: true,
    maxSockets: Number.POSITIVE_INFINITY,
    timeout: config.idleConnectionTimeoutMs,
  })
  const inFlight = new Set<InFlightExchange>()
  let draining: Promise<void> | undefined

  async function drain(): Promise<void> {
    capacity.close()
    const stopping = [...inFlight]
    for (const exchange of stopping) exchange.stop()
    agent.destroy()
    await Promise.all(stopping.map(exchange => exchange.stopped))
  }

  return {
    agent,
    tls: config.tls,
    diagnostics,
    inFlight,
    capacity,
    get closed() {
      return draining !== undefined
    },
    close() {
      draining ??= drain()
      return draining
    },
  }
}

const NO_COUNTERS = Object.freeze({ failed: 0, pending: 0, dropped: 0 })

/** The sink used when no observer is configured. */
const SILENT: IsolatedDiagnostics = {
  emit() {},
  counters: () => NO_COUNTERS,
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError(`${name} must be a positive integer`)
}

function requireTimerDuration(value: number, name: string): void {
  if (!isTimerDuration(value))
    throw new RangeError(`${name} must be a positive integer of at most ${MAX_TIMER_MS}`)
}
