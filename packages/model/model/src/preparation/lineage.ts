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
  sources: ReadonlyMap<MessageId, ModelCallId>
  calls: readonly ModelCallId[]
}>

function invalid(field: string, reason: string): Outcome<never, ModelFailure> {
  return { failure: { kind: 'invalid', field, reason } }
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function memberOf(value: object, key: string): unknown {
  const member: unknown = Reflect.get(value, key)
  return member
}

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
