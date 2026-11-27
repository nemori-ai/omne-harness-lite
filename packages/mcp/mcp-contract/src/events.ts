import type { JsonValue } from '@omne-harness/json-text'
import type { CatalogRevision } from './brands.ts'
import type { AdoptionBasis, Freshness } from './catalog.ts'
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
