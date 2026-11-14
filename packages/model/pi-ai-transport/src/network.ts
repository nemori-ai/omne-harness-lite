import { createConnectionCapacity, type ConnectionCapacity } from './capacity.ts'
import {
  createDiagnosticSink,
  type DiagnosticObserver,
  type IsolatedDiagnostics,
} from './diagnostics.ts'
import type { ExchangeResources, InFlightExchange, TlsOptions } from './http.ts'
import { isTimerDuration, MAX_TIMER_MS } from './limits.ts'
import { PoolAgent, supportsProxyEnv } from './pool-agent.ts'

export type ProxyConfig = Readonly<{
  url: string
  bypass: readonly string[]
}>

export type NetworkConfig = Readonly<{
  maxConnections: number
  idleConnectionTimeoutMs: number
  tls?: TlsOptions
  proxy?: ProxyConfig
  diagnostics?: Readonly<{ observer: DiagnosticObserver; maxPending: number }>
}>

export interface NetworkInternals extends ExchangeResources {
  readonly capacity: ConnectionCapacity
  close(): Promise<void>
  readonly handle: NetworkResources
}

const NETWORK_RESOURCES: unique symbol = Symbol('pi-ai-transport.network-resources')

export type NetworkResources = Readonly<{
  close(): Promise<void>
  readonly [NETWORK_RESOURCES]: true
}>

const internalsOfHandle = new WeakMap<object, NetworkInternals>()

export function createNetworkResources(config: NetworkConfig): NetworkResources {
  return openNetwork(config).handle
}

export function networkInternalsOf(network: unknown): NetworkInternals {
  const internals =
    typeof network === 'object' && network !== null ? internalsOfHandle.get(network) : undefined
  if (internals === undefined)
    throw new RangeError('network must be network resources from createNetworkResources')
  return internals
}

export function openNetwork(config: NetworkConfig): NetworkInternals {
  requirePositiveInteger(config.maxConnections, 'maxConnections')
  requireTimerDuration(config.idleConnectionTimeoutMs, 'idleConnectionTimeoutMs')
  const proxyEnv =
    config.proxy === undefined ? undefined : proxyEnvOf(config.proxy, process.versions.node)
  const diagnostics =
    config.diagnostics === undefined
      ? SILENT
      : createDiagnosticSink(config.diagnostics.observer, {
          maxPending: config.diagnostics.maxPending,
        })
  const capacity = createConnectionCapacity(config.maxConnections)
  // Capacity alone bounds the exchanges in flight. A socket limit equal to it would queue a request
  // that holds a slot: Node frees a socket from the pool count one loop turn after the close.
  const agent = new PoolAgent({
    keepAlive: true,
    maxSockets: Number.POSITIVE_INFINITY,
    timeout: config.idleConnectionTimeoutMs,
    ...(proxyEnv === undefined ? {} : { proxyEnv }),
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

  function close(): Promise<void> {
    draining ??= drain()
    return draining
  }

  const handle: NetworkResources = Object.freeze({ close, [NETWORK_RESOURCES]: true })
  const internals: NetworkInternals = {
    agent,
    tls: config.tls,
    diagnostics,
    inFlight,
    capacity,
    get closed() {
      return draining !== undefined
    },
    close,
    handle,
  }
  internalsOfHandle.set(handle, internals)
  return internals
}

const NO_COUNTERS = Object.freeze({ failed: 0, pending: 0, dropped: 0 })

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

function proxyEnvOf(
  proxy: ProxyConfig,
  nodeVersion: string,
): Readonly<{ HTTPS_PROXY: string; NO_PROXY: string }> {
  const { url, bypass } = proxy
  if (typeof url !== 'string' || !URL.canParse(url))
    throw new RangeError('proxy.url must be a valid URL')
  const parsed = new URL(url)
  if (!PROXY_PROTOCOLS.has(parsed.protocol))
    throw new RangeError('proxy.url must use the http: or https: protocol')
  if (!Array.isArray(bypass) || !bypass.every(isBypassEntry))
    throw new RangeError(
      'proxy.bypass entries must be non-empty strings without commas or whitespace',
    )
  if (!supportsProxyEnv(nodeVersion)) throw new RangeError('proxy requires Node 24.5.0 or later')
  return { HTTPS_PROXY: parsed.href, NO_PROXY: bypass.join(',') }
}

function isBypassEntry(entry: unknown): boolean {
  return typeof entry === 'string' && entry !== '' && !BYPASS_SEPARATOR.test(entry)
}
