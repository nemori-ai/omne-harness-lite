import { createConnectionCapacity, type ConnectionCapacity } from './capacity.ts'
import {
  createDiagnosticSink,
  type DiagnosticObserver,
  type IsolatedDiagnostics,
} from './diagnostics.ts'
import type { ExchangeResources, InFlightExchange, TlsOptions } from './http.ts'
import { isTimerDuration, MAX_TIMER_MS } from './limits.ts'
import { PoolAgent, supportsProxyEnv } from './pool-agent.ts'

/** An HTTPS proxy for every exchange whose host the bypass list does not match. */
export type ProxyConfig = Readonly<{
  /** An `http:` or `https:` proxy URL. It may carry credentials: it never enters a message, result or diagnostic. */
  url: string
  /** Hosts reached directly, in Node's `NO_PROXY` forms: host, `.suffix`, `*.suffix`, IP, IP range, `host:port`. May be empty. */
  bypass: readonly string[]
}>

/** Every limit comes from the caller; the package holds no default policy. */
export type NetworkConfig = Readonly<{
  /** The connection capacity: how many exchanges may be in flight at once. The pool has no socket limit. */
  maxConnections: number
  /** A pooled idle socket is closed after this long without traffic. At most `MAX_TIMER_MS`. */
  idleConnectionTimeoutMs: number
  tls?: TlsOptions
  /** Absent: every exchange connects directly. Requires Node 24.5.0 or later. */
  proxy?: ProxyConfig
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
  if (config.proxy !== undefined) requireProxy(config.proxy, process.versions.node)
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
  const agent = new PoolAgent({
    keepAlive: true,
    maxSockets: Number.POSITIVE_INFINITY,
    timeout: config.idleConnectionTimeoutMs,
    // Only the upper-case keys: Node prefers a lower-case key when both are present.
    ...(config.proxy === undefined
      ? {}
      : {
          proxyEnv: { HTTPS_PROXY: config.proxy.url, NO_PROXY: config.proxy.bypass.join(',') },
        }),
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

const PROXY_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:'])
const BYPASS_SEPARATOR = /[\s,]/

/** The messages name the field and the rule only: the URL may carry credentials. */
function requireProxy(proxy: ProxyConfig, nodeVersion: string): void {
  const { url, bypass } = proxy
  if (typeof url !== 'string' || !URL.canParse(url))
    throw new RangeError('proxy.url must be a valid URL')
  if (!PROXY_PROTOCOLS.has(new URL(url).protocol))
    throw new RangeError('proxy.url must use the http: or https: protocol')
  if (!Array.isArray(bypass) || !bypass.every(isBypassEntry))
    throw new RangeError(
      'proxy.bypass entries must be non-empty strings without commas or whitespace',
    )
  if (!supportsProxyEnv(nodeVersion)) throw new RangeError('proxy requires Node 24.5.0 or later')
}

function isBypassEntry(entry: unknown): boolean {
  return typeof entry === 'string' && entry !== '' && !BYPASS_SEPARATOR.test(entry)
}
