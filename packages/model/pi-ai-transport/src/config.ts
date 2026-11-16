import type { JsonLimits } from '@omne-harness/json-text'
import type { ConnectRetryDiagnostic } from './diagnostics.ts'
import type { PiFamilyContributions } from './family.ts'
import { isPlainHttpsUrl } from './http.ts'
import { isPositiveInteger, isTimerDuration, MAX_TIMER_MS } from './limits.ts'
import { networkInternalsOf, type NetworkInternals, type NetworkResources } from './network.ts'

export type RouteAccounting = Readonly<{ place: string; costUnit: string }>

export type PiRouteAuth = Readonly<{ kind: 'bearer'; item: string }> | null

export type PiRoute = Readonly<{
  url: string
  endMarker: string | null
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
}>

export type CheckedRoute = Readonly<{
  url: URL
  endMarker: string | null
  accounting: RouteAccounting
  auth: PiRouteAuth
}>

export type CheckedConfig = Readonly<{
  network: NetworkInternals
  families: PiFamilyContributions
  routes: ReadonlyMap<string, CheckedRoute>
  credential: PiCredentialSlot
  limits: PiTransportLimits
  onConnectRetry?: ((event: ConnectRetryDiagnostic) => void) | undefined
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
  if (config.onConnectRetry !== undefined && typeof config.onConnectRetry !== 'function')
    throw new RangeError('onConnectRetry must be absent or a function')
  const network = networkInternalsOf(config.network)
  return {
    network,
    families: config.families,
    routes: checkRoutes(config.routes),
    credential: config.credential,
    limits: checkLimits(config.limits),
    onConnectRetry: config.onConnectRetry,
  }
}

function checkRoutes(routes: Readonly<Record<string, PiRoute>>): ReadonlyMap<string, CheckedRoute> {
  if (!isObject(routes) || Array.isArray(routes)) throw new RangeError('routes must be an object')
  const checked = new Map<string, CheckedRoute>()
  for (const [provider, route] of Object.entries(routes)) {
    if (!isObject(route)) throw new RangeError('each route must be an object')
    const url = typeof route.url === 'string' && URL.canParse(route.url) ? new URL(route.url) : null
    if (url === null || !isPlainHttpsUrl(url))
      throw new RangeError(
        'each route url must be an https: URL without credentials, query or fragment',
      )
    if (route.endMarker !== null && typeof route.endMarker !== 'string')
      throw new RangeError('each route endMarker must be a string or null')
    const accounting = checkAccounting(route.accounting)
    const auth = checkAuth(route.auth)
    checked.set(provider, { url, endMarker: route.endMarker, accounting, auth })
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
  return { place: accounting.place, costUnit: accounting.costUnit }
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
