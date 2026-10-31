// The boundary parse of the lineage a caller declares at acquire. The shape and the identities are
// checked once here, item by item, so a malformed value is a named `invalid` and never a throw;
// the lease trusts the parsed value. An empty lineage is no lineage.
import { parseMessageId, type MessageId } from '@omne-harness/message'
import {
  decodeModelCallId,
  type ModelCallId,
  type ModelFailure,
  type PreparationLineage,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'

export type Lineage = Readonly<{
  continues: ModelCallId | null
  /** The source call of each message, one per message. */
  sources: ReadonlyMap<MessageId, ModelCallId>
  /** Every distinct call the lineage names, in declaration order. */
  calls: readonly ModelCallId[]
}>

function invalid(field: string, reason: string): Outcome<never, ModelFailure> {
  return { failure: { kind: 'invalid', field, reason } }
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/** The member `key` of an object, read as a property; nothing about its type is assumed. */
function memberOf(value: object, key: string): unknown {
  const member: unknown = Reflect.get(value, key)
  return member
}

/** One declared source: an object with a message identity and a call identity. */
function parseSource(
  raw: unknown,
): Outcome<Readonly<{ message: MessageId; call: ModelCallId }>, ModelFailure> {
  if (!isObject(raw)) return invalid('lineage.sources', 'shape')
  const text = memberOf(raw, 'message')
  const message = typeof text === 'string' ? parseMessageId(text) : null
  if (message === null || !message.ok) return invalid('lineage.sources', 'message-identity')
  const call = decodeModelCallId(memberOf(raw, 'call'))
  if (!('ok' in call)) return invalid('lineage.sources', 'call-identity')
  return { ok: { message: message.value, call: call.ok } }
}

/** The declared sources as a map, one source per message. Absent sources are no sources. */
function parseSources(raw: unknown): Outcome<ReadonlyMap<MessageId, ModelCallId>, ModelFailure> {
  const sources = new Map<MessageId, ModelCallId>()
  if (raw === undefined) return { ok: sources }
  if (!Array.isArray(raw)) return invalid('lineage.sources', 'shape')
  for (const item of raw) {
    const source = parseSource(item)
    if (!('ok' in source)) return source
    if (sources.has(source.ok.message)) return invalid('lineage.sources', 'duplicate-message')
    sources.set(source.ok.message, source.ok.call)
  }
  return { ok: sources }
}

/**
 * `null` when the caller declared nothing: the meters of the lease then answer as the family meters do.
 * A lineage that is not an object is `invalid` (`lineage`, `shape`); `sources` that is not an array,
 * or an item that is not an object, is `invalid` (`lineage.sources`, `shape`); a bad identity names
 * its field. More distinct calls than `maxCitedCalls` is `invalid` (`lineage`, `too-many-calls`); a
 * message with two sources is `invalid` (`lineage.sources`, `duplicate-message`).
 */
export function parseLineage(
  raw: PreparationLineage | undefined,
  maxCitedCalls: number,
): Outcome<Lineage | null, ModelFailure> {
  if (raw === undefined) return { ok: null }
  if (!isObject(raw)) return invalid('lineage', 'shape')
  let continues: ModelCallId | null = null
  const declared = memberOf(raw, 'continues')
  if (declared !== undefined) {
    const decoded = decodeModelCallId(declared)
    if (!('ok' in decoded)) return invalid('lineage.continues', 'identity')
    continues = decoded.ok
  }
  const sources = parseSources(memberOf(raw, 'sources'))
  if (!('ok' in sources)) return sources
  if (continues === null && sources.ok.size === 0) return { ok: null }
  const named = continues === null ? [] : [continues]
  const calls = [...new Set([...named, ...sources.ok.values()])]
  if (calls.length > maxCitedCalls) return invalid('lineage', 'too-many-calls')
  return { ok: { continues, sources: sources.ok, calls } }
}
