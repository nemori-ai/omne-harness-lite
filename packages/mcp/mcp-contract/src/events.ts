import type { JsonValue } from '@omne-harness/json-text'
import type { CatalogRevision } from './brands.ts'
import type { AdoptionBasis, Freshness } from './catalog.ts'
import { encodeMcpHeaderValue } from './envelope.ts'
import { isObject, itemsOf, member, textOf } from './json.ts'
import { isModernProtocolVersion } from './revisions.ts'
import type { PeerIdentity, Untrusted } from './values.ts'
import { headersInvalid } from './withheld.ts'

export const EVENTS_EXTENSION = 'io.modelcontextprotocol/events'

export type EventDelivery = 'poll' | 'push' | 'webhook'

const DELIVERIES: readonly EventDelivery[] = ['poll', 'push', 'webhook']

/** One kind of event a peer offers; its description is the peer's text. */
export type EventType = Readonly<{
  name: string
  description: Untrusted<string>
  delivery: readonly EventDelivery[]
  inputSchema: JsonValue
  payloadSchema: JsonValue
}>

export type EventTypeRefusal = 'malformed' | 'header-invalid'

export type EventCatalogRecord = Readonly<{
  revision: CatalogRevision
  basis: AdoptionBasis
  freshness: Freshness
  declared: boolean
  types: readonly EventType[]
}>

export type EventListingPage = Readonly<{ events: readonly JsonValue[]; nextCursor?: string }>

/** Whether a peer offers events: the extension on its capabilities, on a connection of the 2026-07-28 revision or later. */
export function declaresEvents(
  peer: Pick<PeerIdentity, 'protocolVersion' | 'capabilities'>,
): boolean {
  const { capabilities } = peer
  if (!isModernProtocolVersion(peer.protocolVersion) || !isObject(capabilities)) return false
  const extensions = member(capabilities, 'extensions')
  return isObject(extensions) && isObject(member(extensions, EVENTS_EXTENSION))
}

function deliveryOf(value: JsonValue | undefined): readonly EventDelivery[] | undefined {
  const items = itemsOf(value)
  if (items === undefined || items.length === 0) return undefined
  const modes = items.map(textOf)
  if (!modes.every((mode): mode is EventDelivery => DELIVERIES.includes(mode as EventDelivery)))
    return undefined
  return [...new Set(modes)]
}

/** A described event type, or why it is not taken: unreadable, or arguments it marks as headers wrongly. */
export function readEventType(
  json: JsonValue,
): Readonly<{ ok: EventType }> | Readonly<{ refused: EventTypeRefusal; name: string }> {
  const name = isObject(json) ? textOf(member(json, 'name')) : undefined
  if (!isObject(json) || name === undefined || name === '')
    return { refused: 'malformed', name: name ?? '' }
  const description = textOf(member(json, 'description'))
  const delivery = deliveryOf(member(json, 'delivery'))
  const inputSchema = member(json, 'inputSchema')
  const payloadSchema = member(json, 'payloadSchema')
  if (
    description === undefined ||
    delivery === undefined ||
    !isObject(inputSchema) ||
    !isObject(payloadSchema)
  )
    return { refused: 'malformed', name }
  if (headersInvalid(inputSchema)) return { refused: 'header-invalid', name }
  return {
    ok: { name, description: { untrusted: description }, delivery, inputSchema, payloadSchema },
  }
}

/** One subscription asked of a peer: by poll, or as the long request of a stream. */
export type EventRequest = Readonly<{
  name: string
  arguments: JsonValue
  cursor: string | null
  headers: Readonly<Record<string, string>>
}>

export type EventPollAnswer = Readonly<{
  events: readonly JsonValue[]
  cursor: string | null
  truncated: boolean
  hasMore: boolean
  nextPollMs: number
}>

export type EventStreamMessage =
  | Readonly<{ kind: 'active'; cursor: string | null; truncated: boolean; heartbeatMs: number }>
  | Readonly<{ kind: 'event'; event: JsonValue; cursor: string | null }>
  | Readonly<{ kind: 'error' }>
  | Readonly<{ kind: 'heartbeat'; cursor: string | null }>
  | Readonly<{ kind: 'terminated'; code: number | null; data: JsonValue | null }>

const cursorOf = (value: JsonValue | undefined): string | null => textOf(value) ?? null
const flagOf = (value: JsonValue | undefined): boolean => value?.kind === 'boolean' && value.value
const countIn = (value: JsonValue | undefined): number | undefined =>
  value?.kind === 'number' && Number.isFinite(Number(value.lexeme))
    ? Number(value.lexeme)
    : undefined

/** The arguments a type marks as headers, as the `Mcp-Param-` headers of a request that has them. */
export function eventParamHeadersOf(
  inputSchema: JsonValue,
  args: JsonValue,
): Readonly<Record<string, string>> {
  const properties = isObject(inputSchema) ? member(inputSchema, 'properties') : undefined
  if (!isObject(properties) || !isObject(args)) return {}
  const headers: Record<string, string> = {}
  for (const entry of properties.entries) {
    const header = isObject(entry.value) ? textOf(member(entry.value, 'x-mcp-header')) : undefined
    const value = member(args, entry.key)
    if (header === undefined || value === undefined) continue
    const text =
      value.kind === 'string'
        ? value.value
        : value.kind === 'boolean'
          ? String(value.value)
          : value.kind === 'number'
            ? value.lexeme
            : undefined
    if (text !== undefined)
      headers[`mcp-param-${header.toLowerCase()}`] = encodeMcpHeaderValue(text)
  }
  return headers
}

export function readEventPollAnswer(
  result: JsonValue,
): Readonly<{ ok: EventPollAnswer }> | Readonly<{ failure: 'events-missing' }> {
  const events = isObject(result) ? itemsOf(member(result, 'events')) : undefined
  if (!isObject(result) || events === undefined) return { failure: 'events-missing' }
  const flag = (key: string) => flagOf(member(result, key))
  return {
    ok: {
      events,
      cursor: cursorOf(member(result, 'cursor')),
      truncated: flag('truncated'),
      hasMore: flag('hasMore'),
      nextPollMs: countIn(member(result, 'nextPollMs')) ?? 0,
    },
  }
}

/** A notification on an event stream; one of another method is none. */
export function eventStreamMessageOf(
  method: string,
  params: JsonValue | undefined,
): EventStreamMessage | undefined {
  const at = (key: string) => (isObject(params) ? member(params, key) : undefined)
  switch (method) {
    case 'notifications/events/active':
      return {
        kind: 'active',
        cursor: cursorOf(at('cursor')),
        truncated: flagOf(at('truncated')),
        heartbeatMs: countIn(at('heartbeatMs')) ?? 0,
      }
    case 'notifications/events/event':
      return params === undefined
        ? undefined
        : { kind: 'event', event: params, cursor: cursorOf(at('cursor')) }
    case 'notifications/events/error':
      return { kind: 'error' }
    case 'notifications/events/heartbeat':
      return { kind: 'heartbeat', cursor: cursorOf(at('cursor')) }
    case 'notifications/events/terminated': {
      const error = at('error')
      const code = isObject(error) ? countIn(member(error, 'code')) : undefined
      const data = isObject(error) ? member(error, 'data') : undefined
      return { kind: 'terminated', code: code ?? null, data: data ?? null }
    }
    default:
      return undefined
  }
}

export function readOccurrence(
  json: JsonValue,
): Readonly<{ eventId: string; name: string; timestamp: string; data: JsonValue }> | undefined {
  if (!isObject(json)) return undefined
  const eventId = textOf(member(json, 'eventId'))
  const name = textOf(member(json, 'name'))
  const timestamp = textOf(member(json, 'timestamp'))
  const data = member(json, 'data')
  if (eventId === undefined || name === undefined || timestamp === undefined || !isObject(data))
    return undefined
  return { eventId, name, timestamp, data }
}
