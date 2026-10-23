// The boundary parse of the lineage a caller declares at acquire. Identities are decoded once here;
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

/** The declared sources as a map, one source per message. */
function parseSources(
  raw: PreparationLineage['sources'],
): Outcome<ReadonlyMap<MessageId, ModelCallId>, ModelFailure> {
  const sources = new Map<MessageId, ModelCallId>()
  for (const source of raw ?? []) {
    const message = parseMessageId(source.message)
    if (!message.ok) return invalid('lineage.sources', 'message-identity')
    const call = decodeModelCallId(source.call)
    if (!('ok' in call)) return invalid('lineage.sources', 'call-identity')
    if (sources.has(message.value)) return invalid('lineage.sources', 'duplicate-message')
    sources.set(message.value, call.ok)
  }
  return { ok: sources }
}

/**
 * `null` when the caller declared nothing: the meters of the lease then answer as the family meters do.
 * More distinct calls than `maxCitedCalls` is `invalid` (`lineage`, `too-many-calls`); a message
 * with two sources is `invalid` (`lineage.sources`, `duplicate-message`).
 */
export function parseLineage(
  raw: PreparationLineage | undefined,
  maxCitedCalls: number,
): Outcome<Lineage | null, ModelFailure> {
  if (raw === undefined) return { ok: null }
  let continues: ModelCallId | null = null
  if (raw.continues !== undefined) {
    const decoded = decodeModelCallId(raw.continues)
    if (!('ok' in decoded)) return invalid('lineage.continues', 'identity')
    continues = decoded.ok
  }
  const sources = parseSources(raw.sources)
  if (!('ok' in sources)) return sources
  if (continues === null && sources.ok.size === 0) return { ok: null }
  const named = continues === null ? [] : [continues]
  const calls = [...new Set([...named, ...sources.ok.values()])]
  if (calls.length > maxCitedCalls) return invalid('lineage', 'too-many-calls')
  return { ok: { continues, sources: sources.ok, calls } }
}
