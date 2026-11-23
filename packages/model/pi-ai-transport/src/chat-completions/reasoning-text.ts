import {
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import type { ModelFault, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { REDACTED } from './details.ts'
import { object } from './json.ts'
import type { ReasoningCodec, ReasoningDetail, ReplayPart, ReplayWire } from './vocabulary.ts'

const TEXT_DETAIL = 'reasoning.text'

function stringMember(raw: Readonly<Record<string, JsonValue>>, key: string): string | null {
  const value = raw[key]
  return value?.kind === 'string' ? value.value : null
}

function isReplayable(raw: Readonly<Record<string, JsonValue>>): boolean {
  const text = stringMember(raw, 'text')
  return (
    stringMember(raw, 'type') === TEXT_DETAIL &&
    text !== null &&
    text.length > 0 &&
    text !== REDACTED
  )
}

function payloadLimits(payload: string): JsonLimits {
  const bound = Math.max(1, payload.length * 4)
  return {
    maxBytes: bound,
    maxDepth: bound,
    maxItems: bound,
    maxMembers: bound,
    maxStringLength: bound,
    maxNumberLength: bound,
  }
}

function itemOf(part: ReplayPart): Readonly<Record<string, JsonValue>> | null {
  const read = readJsonText(part.payload, payloadLimits(part.payload))
  if (read.kind !== 'ok' || read.value.kind !== 'object') return null
  const raw = Object.fromEntries(read.value.entries.map(entry => [entry.key, entry.value]))
  return isReplayable(raw) ? raw : null
}

function seal(
  details: readonly ReasoningDetail[],
): Outcome<readonly Readonly<{ payload: string }>[], ModelFault> {
  const payloads = details
    .filter(detail => isReplayable(detail.raw))
    .map(detail => Object.freeze({ payload: writeJsonText(object(detail.raw)) }))
  return { ok: Object.freeze(payloads) }
}

function replay(
  parts: readonly ReplayPart[],
  thinking: readonly string[],
): Outcome<ReplayWire, TransportFailure> {
  if (parts.length > 0) {
    const details: Readonly<Record<string, JsonValue>>[] = []
    for (const part of parts) {
      const item = itemOf(part)
      if (item === null)
        return {
          failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
        }
      details.push(item)
    }
    return { ok: { kind: 'details', details } }
  }
  const text = thinking.join('')
  return { ok: text.length > 0 ? { kind: 'plain', text } : { kind: 'none' } }
}

export const reasoningTextCodec: ReasoningCodec = Object.freeze({ seal, replay })
