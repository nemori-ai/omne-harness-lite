import type { JsonLimits } from '@omne-harness/json-text'
import type { ModelKind } from '@omne-harness/model-contract'
import type { ConnectRetryDiagnostic } from './diagnostics.ts'
import type { PiFamilyContributions } from './family.ts'
import { isPlainHttpsUrl } from './http.ts'
import { isPositiveInteger, isTimerDuration, MAX_TIMER_MS } from './limits.ts'
import type { PiMediaReader } from './media.ts'
import { networkInternalsOf, type NetworkInternals, type NetworkResources } from './network.ts'

export type RouteAccounting = Readonly<{
  place: string
  costUnit: string
  generation?: Readonly<{ requestHeader: string; path: string }>
}>

export type PiRouteAuth = Readonly<{ kind: 'bearer'; item: string }> | null

/** The interface an engine speaks at the gateway. */
export type EngineEndpoint = 'chat-completions' | 'messages' | 'responses'

export type DecisionsEndpoint = 'decisions' | 'decisions-v1'

export type ProviderEndpoint = EngineEndpoint | DecisionsEndpoint

export type Framing = 'events' | 'whole'

/** Every interface a provider can offer, with the kind of model it serves and its framing. */
export const PROTOCOLS = {
  'chat-completions': { kind: 'llm', framing: 'events' },
  messages: { kind: 'llm', framing: 'events' },
  responses: { kind: 'llm', framing: 'events' },
  decisions: { kind: 'decisions', framing: 'whole' },
  'decisions-v1': { kind: 'decisions', framing: 'whole' },
} as const satisfies Readonly<
  Record<ProviderEndpoint, Readonly<{ kind: ModelKind; framing: Framing }>>
>

export function isProviderEndpoint(name: string): name is ProviderEndpoint {
  return Object.hasOwn(PROTOCOLS, name)
}

export type PiRouteEndpoint = Readonly<{ url: string; endMarker: string | null }>

export type PiRoute = Readonly<{
  endpoints: Readonly<Partial<Record<ProviderEndpoint, PiRouteEndpoint>>>
  accounting: RouteAccounting
  auth: PiRouteAuth
}>

export type PiCredentialSlot = Readonly<{ read(): ReadonlyMap<string, string> | undefined }>

export const MAX_CONNECT_RETRIES = 8

export type ConnectRetryLimits = Readonly<{
  backoffMs: readonly number[]
}>

export type PiTransportLimits = Readonly<{
  connectTimeoutMs: number | null
  streamStallTimeoutMs?: number
  connectRetry?: ConnectRetryLimits
  maxDecisionBytes?: number
  maxErrorBodyBytes: number
  maxEventBytes: number
  json: JsonLimits
}>

export type PiTransportConfig = Readonly<{
  network: NetworkResources
  families: PiFamilyContributions
  routes: Readonly<Record<string, PiRoute>>
  credential: PiCredentialSlot
  limits: PiTransportLimits
  onConnectRetry?: (event: ConnectRetryDiagnostic) => void
  onResponseBody?: () => void
  /** Reads the media of this transport's requests; absent, a request that refers to media is unavailable. */
  media?: PiMediaReader
}>

/** The route of one dispatch: the endpoint its engine speaks, with the accounting and auth. */
export type CheckedRoute = Readonly<{
  url: URL
  endMarker: string | null
  framing: Framing
  accounting: RouteAccounting
  auth: PiRouteAuth
}>

export type CheckedProviderRoute = Readonly<{
  endpoints: ReadonlyMap<ProviderEndpoint, Readonly<{ url: URL; endMarker: string | null }>>
  accounting: RouteAccounting
  auth: PiRouteAuth
}>

const ENGINE_ENDPOINTS: readonly EngineEndpoint[] = ['chat-completions', 'messages', 'responses']

/** Whether a protocol name is an interface some engine of this transport speaks. */
export function isEngineEndpoint(name: string): name is EngineEndpoint {
  return ENGINE_ENDPOINTS.some(item => item === name)
}

/** The route a dispatch takes; undefined when the provider has no endpoint for this engine. */
export function routeFor(
  route: CheckedProviderRoute,
  endpoint: ProviderEndpoint,
): CheckedRoute | undefined {
  const found = route.endpoints.get(endpoint)
  if (found === undefined) return undefined
  const { url, endMarker } = found
  const { framing } = PROTOCOLS[endpoint]
  return { url, endMarker, framing, accounting: route.accounting, auth: route.auth }
}

export type { PiMediaReader } from './media.ts'
export type CheckedConfig = Readonly<{
  network: NetworkInternals
  families: PiFamilyContributions
  routes: ReadonlyMap<string, CheckedProviderRoute>
  credential: PiCredentialSlot
  limits: PiTransportLimits
  onConnectRetry?: ((event: ConnectRetryDiagnostic) => void) | undefined
  onResponseBody?: (() => void) | undefined
  media?: PiMediaReader | undefined
}>

const JSON_LIMIT_NAMES = [
  'maxBytes',
  'maxDepth',
  'maxItems',
  'maxMembers',
  'maxStringLength',
  'maxNumberLength',
] as const satisfies readonly (keyof JsonLimits)[]

export function checkConfig(config: PiTransportConfig): CheckedConfig {
  if (!isObject(config.families) || typeof config.families.acquire !== 'function')
    throw new RangeError('families must have an acquire function')
  if (!isObject(config.credential) || typeof config.credential.read !== 'function')
    throw new RangeError('credential must have a read function')
  for (const name of ['onConnectRetry', 'onResponseBody', 'media'] as const)
    if (config[name] !== undefined && typeof config[name] !== 'function')
      throw new RangeError(`${name} must be absent or a function`)
  const network = networkInternalsOf(config.network)
  return {
    network,
    families: config.families,
    routes: checkRoutes(config.routes),
    credential: config.credential,
    limits: checkLimits(config.limits),
    onConnectRetry: config.onConnectRetry,
    onResponseBody: config.onResponseBody,
    media: config.media,
  }
}

function checkEndpoint(
  endpoint: PiRouteEndpoint,
): Readonly<{ url: URL; endMarker: string | null }> {
  if (!isObject(endpoint)) throw new RangeError('each route endpoint must be an object')
  const url =
    typeof endpoint.url === 'string' && URL.canParse(endpoint.url) ? new URL(endpoint.url) : null
  if (url === null || !isPlainHttpsUrl(url))
    throw new RangeError(
      'each route url must be an https: URL without credentials, query or fragment',
    )
  if (endpoint.endMarker !== null && typeof endpoint.endMarker !== 'string')
    throw new RangeError('each route endMarker must be a string or null')
  return { url, endMarker: endpoint.endMarker }
}

function checkRoutes(
  routes: Readonly<Record<string, PiRoute>>,
): ReadonlyMap<string, CheckedProviderRoute> {
  if (!isObject(routes) || Array.isArray(routes)) throw new RangeError('routes must be an object')
  const checked = new Map<string, CheckedProviderRoute>()
  for (const [provider, route] of Object.entries(routes)) {
    if (!isObject(route) || !isObject(route.endpoints) || Array.isArray(route.endpoints))
      throw new RangeError('each route must be an object with endpoints')
    const endpoints = new Map<ProviderEndpoint, Readonly<{ url: URL; endMarker: string | null }>>()
    for (const [name, endpoint] of Object.entries(route.endpoints)) {
      if (!isProviderEndpoint(name))
        throw new RangeError(`a route names an unknown endpoint: ${name}`)
      if (endpoint !== undefined) {
        if (PROTOCOLS[name].framing === 'whole' && endpoint.endMarker !== null)
          throw new RangeError(`the ${name} endpoint accepts one whole response`)
        endpoints.set(name, checkEndpoint(endpoint))
      }
    }
    if (endpoints.size === 0) throw new RangeError('each route needs at least one endpoint')
    checked.set(provider, {
      endpoints,
      accounting: checkAccounting(route.accounting),
      auth: checkAuth(route.auth),
    })
  }
  return checked
}

function checkAuth(auth: PiRouteAuth): PiRouteAuth {
  if (auth === null) return null
  if (
    !isObject(auth) ||
    auth.kind !== 'bearer' ||
    typeof auth.item !== 'string' ||
    auth.item === ''
  )
    throw new RangeError('each route auth must be null or a bearer of a non-empty item')
  return { kind: 'bearer', item: auth.item }
}

function checkAccounting(accounting: RouteAccounting): RouteAccounting {
  if (
    !isObject(accounting) ||
    typeof accounting.place !== 'string' ||
    accounting.place === '' ||
    typeof accounting.costUnit !== 'string' ||
    accounting.costUnit === ''
  )
    throw new RangeError('each route accounting must have a non-empty place and costUnit')
  const { place, costUnit, generation } = accounting
  if (generation === undefined) return { place, costUnit }
  if (
    !isObject(generation) ||
    typeof generation.requestHeader !== 'string' ||
    generation.requestHeader === '' ||
    typeof generation.path !== 'string' ||
    !generation.path.startsWith('/')
  )
    throw new RangeError('a route accounting that states generation must name its header and path')
  return {
    place,
    costUnit,
    generation: { requestHeader: generation.requestHeader, path: generation.path },
  }
}

function checkLimits(limits: PiTransportLimits): PiTransportLimits {
  if (!isObject(limits)) throw new RangeError('limits must be an object')
  const {
    connectTimeoutMs,
    streamStallTimeoutMs,
    connectRetry,
    maxDecisionBytes,
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
  if (maxDecisionBytes !== undefined && !isPositiveInteger(maxDecisionBytes))
    throw new RangeError('limits.maxDecisionBytes must be absent or a positive integer')
  if (!isPositiveInteger(maxErrorBodyBytes))
    throw new RangeError('limits.maxErrorBodyBytes must be a positive integer')
  if (!isPositiveInteger(maxEventBytes))
    throw new RangeError('limits.maxEventBytes must be a positive integer')
  return Object.freeze({
    connectTimeoutMs,
    ...(streamStallTimeoutMs === undefined ? {} : { streamStallTimeoutMs }),
    ...(checkedRetry === undefined ? {} : { connectRetry: checkedRetry }),
    ...(maxDecisionBytes === undefined ? {} : { maxDecisionBytes }),
    maxErrorBodyBytes,
    maxEventBytes,
    json: checkJsonLimits(json),
  })
}

export function checkJsonLimits(json: JsonLimits): JsonLimits {
  if (!isObject(json)) throw new RangeError('limits.json must be an object')
  for (const name of JSON_LIMIT_NAMES)
    if (!isPositiveInteger(json[name]))
      throw new RangeError(`limits.json.${name} must be a positive integer`)
  return Object.freeze({ ...json })
}

function checkConnectRetry(retry: ConnectRetryLimits | undefined): ConnectRetryLimits | undefined {
  if (retry === undefined) return undefined
  if (!isObject(retry)) throw new RangeError('limits.connectRetry must be absent or an object')
  const { backoffMs } = retry
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
