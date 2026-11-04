// The construction configuration of the pi transport and its checks. Every limit and every route
// comes from the caller; the package holds no default.
import type { JsonLimits } from '@omne-harness/json-text'
import type { PiFamilyContributions } from './family.ts'
import { isPlainHttpsUrl } from './http.ts'
import { isPositiveInteger, isTimerDuration, MAX_TIMER_MS } from './limits.ts'
import { networkInternalsOf, type NetworkInternals, type NetworkResources } from './network.ts'

/** One recipient: its complete endpoint and the SSE protocol it answers with. */
export type PiRoute = Readonly<{
  /** The complete `https:` endpoint, e.g. `https://openrouter.ai/api/v1/chat/completions`. No credentials, query or fragment. */
  url: string
  /** The data text of the SSE event that marks the protocol end, e.g. `[DONE]`. `null`: the protocol has none. */
  endMarker: string | null
}>

/**
 * The slot that holds the secret of the send that is starting. The transport reads it once, inside
 * the synchronous `start` call. `undefined`: no credential was given, and nothing is sent.
 */
export type PiCredentialSlot = Readonly<{ read(): string | undefined }>

/** At most this many retries: the backoff is bounded, not a loop without end. */
export const MAX_CONNECT_RETRIES = 8

export type ConnectRetryLimits = Readonly<{
  /** The wait before each retry, in order; each at most `MAX_TIMER_MS`. */
  backoffMs: readonly number[]
}>

export type PiTransportLimits = Readonly<{
  /** From the start of an exchange until it has a connected socket. `null`: no connect timeout. At most `MAX_TIMER_MS`. */
  connectTimeoutMs: number | null
  /**
   * The longest gap between two response bytes, counted from the start of an exchange. Absent: no
   * stall timeout. The package gives no default. At most `MAX_TIMER_MS`.
   */
  streamStallTimeoutMs?: number
  /**
   * Retries of a send whose request bytes were not yet written: a connection that timed out, was
   * refused, failed DNS or failed the TLS handshake. `backoffMs[i]` is the wait before retry
   * `i + 1`, so the length is the most retries; an empty list retries nothing. Once the request
   * may have reached the wire nothing is retried. Absent: no retry. The package gives no default.
   */
  connectRetry?: ConnectRetryLimits
  /** A non-2xx body beyond this many bytes is dropped. */
  maxErrorBodyBytes: number
  /** The largest SSE event, line breaks included. */
  maxEventBytes: number
  /** The budgets for the JSON of one SSE event. */
  json: JsonLimits
}>

export type PiTransportConfig = Readonly<{
  /** Created and closed by the assembly. Several transports may share it; the transport never closes it. */
  network: NetworkResources
  families: PiFamilyContributions
  /** Looked up by `supplier.recipient`. Own properties only. */
  routes: Readonly<Record<string, PiRoute>>
  credential: PiCredentialSlot
  limits: PiTransportLimits
}>

/** A route after its checks: the URL is parsed once. */
export type CheckedRoute = Readonly<{ url: URL; endMarker: string | null }>

/** The configuration after its checks. */
export type CheckedConfig = Readonly<{
  network: NetworkInternals
  families: PiFamilyContributions
  routes: ReadonlyMap<string, CheckedRoute>
  credential: PiCredentialSlot
  limits: PiTransportLimits
}>

const JSON_LIMIT_NAMES = [
  'maxBytes',
  'maxDepth',
  'maxItems',
  'maxMembers',
  'maxStringLength',
  'maxNumberLength',
] as const satisfies readonly (keyof JsonLimits)[]

/**
 * Checks the configuration and throws `RangeError` for the first value out of its rule. The
 * messages name the field and the rule only, never a URL.
 */
export function checkConfig(config: PiTransportConfig): CheckedConfig {
  if (!isObject(config.families) || typeof config.families.acquire !== 'function')
    throw new RangeError('families must have an acquire function')
  if (!isObject(config.credential) || typeof config.credential.read !== 'function')
    throw new RangeError('credential must have a read function')
  const network = networkInternalsOf(config.network)
  return {
    network,
    families: config.families,
    routes: checkRoutes(config.routes),
    credential: config.credential,
    limits: checkLimits(config.limits),
  }
}

function checkRoutes(routes: Readonly<Record<string, PiRoute>>): ReadonlyMap<string, CheckedRoute> {
  if (!isObject(routes) || Array.isArray(routes)) throw new RangeError('routes must be an object')
  const checked = new Map<string, CheckedRoute>()
  for (const [recipient, route] of Object.entries(routes)) {
    if (!isObject(route)) throw new RangeError('each route must be an object')
    const url = typeof route.url === 'string' && URL.canParse(route.url) ? new URL(route.url) : null
    if (url === null || !isPlainHttpsUrl(url))
      throw new RangeError(
        'each route url must be an https: URL without credentials, query or fragment',
      )
    if (route.endMarker !== null && typeof route.endMarker !== 'string')
      throw new RangeError('each route endMarker must be a string or null')
    checked.set(recipient, { url, endMarker: route.endMarker })
  }
  return checked
}

function checkLimits(limits: PiTransportLimits): PiTransportLimits {
  if (!isObject(limits)) throw new RangeError('limits must be an object')
  const {
    connectTimeoutMs,
    streamStallTimeoutMs,
    connectRetry,
    maxErrorBodyBytes,
    maxEventBytes,
    json,
  } = limits
  if (connectTimeoutMs !== null && !isTimerDuration(connectTimeoutMs))
    throw new RangeError(
      `limits.connectTimeoutMs must be null or a positive integer of at most ${MAX_TIMER_MS}`,
    )
  if (streamStallTimeoutMs !== undefined && !isTimerDuration(streamStallTimeoutMs))
    throw new RangeError(
      `limits.streamStallTimeoutMs must be absent or a positive integer of at most ${MAX_TIMER_MS}`,
    )
  const checkedRetry = checkConnectRetry(connectRetry)
  if (!isPositiveInteger(maxErrorBodyBytes))
    throw new RangeError('limits.maxErrorBodyBytes must be a positive integer')
  if (!isPositiveInteger(maxEventBytes))
    throw new RangeError('limits.maxEventBytes must be a positive integer')
  if (!isObject(json)) throw new RangeError('limits.json must be an object')
  for (const name of JSON_LIMIT_NAMES)
    if (!isPositiveInteger(json[name]))
      throw new RangeError(`limits.json.${name} must be a positive integer`)
  return Object.freeze({
    connectTimeoutMs,
    ...(streamStallTimeoutMs === undefined ? {} : { streamStallTimeoutMs }),
    ...(checkedRetry === undefined ? {} : { connectRetry: checkedRetry }),
    maxErrorBodyBytes,
    maxEventBytes,
    json: Object.freeze({ ...json }),
  })
}

function checkConnectRetry(retry: ConnectRetryLimits | undefined): ConnectRetryLimits | undefined {
  if (retry === undefined) return undefined
  if (!isObject(retry)) throw new RangeError('limits.connectRetry must be absent or an object')
  const { backoffMs } = retry
  // `Array.from` turns a hole into `undefined`, which the duration check refuses; `every` skips holes.
  const delays: unknown[] = Array.isArray(backoffMs) ? Array.from(backoffMs as unknown[]) : []
  if (
    !Array.isArray(backoffMs) ||
    delays.length > MAX_CONNECT_RETRIES ||
    !delays.every(isTimerDuration)
  )
    throw new RangeError(
      `limits.connectRetry.backoffMs must be a list of at most ${MAX_CONNECT_RETRIES} positive integers of at most ${MAX_TIMER_MS}`,
    )
  return Object.freeze({ backoffMs: Object.freeze(delays as number[]) })
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}
