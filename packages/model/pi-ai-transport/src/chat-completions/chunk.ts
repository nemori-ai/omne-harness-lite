// Derived from pi 1.0.0, commit a13d35a742c6ef8462812a28fbe1d8c8b7431c32 (the chunk loop of
// `stream`, parseChunkUsage; the source file is named in provenance.json). Copyright (c) 2025
// Mario Zechner. MIT: ../../LICENSE.pi. See provenance.json.
//
// The boundary of the stream decoder: one data frame of the gateway stream becomes one typed
// chunk, or a named shape failure. Nothing after this file reads a raw frame.
import type { JsonEntry, JsonValue } from '@omne-harness/json-text'
import type { GatewayUsage, ReasoningDetail } from './vocabulary.ts'

/** A non-negative decimal integer without leading zeros. */
const DECIMAL = /^(0|[1-9][0-9]*)$/

/** One `reasoning_details` item as it arrived, before any joining. */
export type DetailFragment = Readonly<{
  type: ReasoningDetail['type']
  /** `null`: the item has no `id` member, or it is `null` or empty. */
  id: string | null
  /** The decimal `index`; `null` when the item has none. */
  index: string | null
  format: string | null
  raw: Readonly<Record<string, JsonValue>>
}>

/** One `tool_calls` item as it arrived. */
export type ToolFragment = Readonly<{
  /** The decimal `index`: the identity of the call inside the response. */
  index: string
  id: string | null
  name: string | null
  /** `null`: the item carries no argument text. */
  arguments: string | null
}>

/** The delta of the choice. Empty strings are `null`. */
export type Delta = Readonly<{
  content: string | null
  refusal: string | null
  reasoning: string | null
  details: readonly DetailFragment[]
  toolCalls: readonly ToolFragment[]
}>

export type Choice = Readonly<{ finish: string | null; delta: Delta }>

/** One data frame of the gateway stream. */
export type Chunk = Readonly<{
  model: string | null
  provider: string | null
  /** Present when the frame carries an in-band error. Only the numeric code is kept. */
  error: Readonly<{ code: number | null }> | null
  /** `null`: the frame has no choice. */
  choice: Choice | null
  usage: GatewayUsage | null
}>

/** Why a data frame is not a chunk of the gateway stream. */
export type ChunkFailure =
  | 'chunk-not-object'
  | 'choices-shape'
  | 'multiple-choices'
  | 'delta-shape'
  | 'unsupported-delta-member'
  | 'reasoning-detail-shape'
  | 'tool-call-shape'
  | 'finish-shape'
  | 'serving-shape'
  | 'usage-shape'

export type ChunkRead = Readonly<{ ok: Chunk }> | Readonly<{ failure: ChunkFailure }>

/** A thrown shape failure inside the reader; `readChunk` turns it into its result. */
class ChunkShapeError extends Error {
  readonly reason: ChunkFailure

  constructor(reason: ChunkFailure) {
    super(`gateway chunk: ${reason}`)
    this.name = 'ChunkShapeError'
    this.reason = reason
  }
}

/** Delta members that would carry output this engine does not decode. */
const UNSUPPORTED_DELTA_MEMBERS = ['images', 'audio'] as const

/** Reads one data frame. Unknown members are ignored, except the unsupported output members. */
export function readChunk(value: JsonValue): ChunkRead {
  try {
    return { ok: chunkOf(value) }
  } catch (error) {
    if (error instanceof ChunkShapeError) return { failure: error.reason }
    throw error
  }
}

function chunkOf(value: JsonValue): Chunk {
  const members = membersOf(value, 'chunk-not-object')
  const error = members.get('error')
  return {
    model: optionalText(members.get('model'), 'serving-shape'),
    provider: optionalText(members.get('provider'), 'serving-shape'),
    error: error === undefined || error.kind === 'null' ? null : errorOf(error),
    choice: choiceOf(members.get('choices')),
    usage: usageOf(members.get('usage')),
  }
}

function errorOf(value: JsonValue): Readonly<{ code: number | null }> {
  if (value.kind !== 'object') return { code: null }
  const code = memberMap(value).get('code')
  if (code === undefined || code.kind !== 'number' || !DECIMAL.test(code.lexeme))
    return { code: null }
  const number = Number(code.lexeme)
  return { code: Number.isSafeInteger(number) ? number : null }
}

function choiceOf(value: JsonValue | undefined): Choice | null {
  if (value === undefined || value.kind === 'null') return null
  if (value.kind !== 'array') throw new ChunkShapeError('choices-shape')
  if (value.items.length === 0) return null
  if (value.items.length > 1) throw new ChunkShapeError('multiple-choices')
  const [first] = value.items
  if (first === undefined) return null
  const members = membersOf(first, 'choices-shape')
  return {
    finish: optionalText(members.get('finish_reason'), 'finish-shape'),
    delta: deltaOf(members.get('delta')),
  }
}

const EMPTY_DELTA: Delta = Object.freeze({
  content: null,
  refusal: null,
  reasoning: null,
  details: [],
  toolCalls: [],
})

function deltaOf(value: JsonValue | undefined): Delta {
  if (value === undefined || value.kind === 'null') return EMPTY_DELTA
  const members = membersOf(value, 'delta-shape')
  for (const name of UNSUPPORTED_DELTA_MEMBERS)
    if (isFilled(members.get(name))) throw new ChunkShapeError('unsupported-delta-member')
  return {
    content: optionalText(members.get('content'), 'delta-shape'),
    refusal: optionalText(members.get('refusal'), 'delta-shape'),
    reasoning: optionalText(members.get('reasoning'), 'delta-shape'),
    details: itemsOf(members.get('reasoning_details'), 'reasoning-detail-shape').map(detailOf),
    toolCalls: itemsOf(members.get('tool_calls'), 'tool-call-shape').map(toolFragmentOf),
  }
}

const DETAIL_TYPES: readonly ReasoningDetail['type'][] = [
  'reasoning.text',
  'reasoning.summary',
  'reasoning.encrypted',
]

function detailOf(value: JsonValue): DetailFragment {
  if (value.kind !== 'object') throw new ChunkShapeError('reasoning-detail-shape')
  const members = memberMap(value)
  const type = members.get('type')
  if (type === undefined || type.kind !== 'string')
    throw new ChunkShapeError('reasoning-detail-shape')
  const known = DETAIL_TYPES.find(name => name === type.value)
  return {
    type: known ?? 'other',
    id: optionalText(members.get('id'), 'reasoning-detail-shape'),
    index: optionalIndex(members.get('index'), 'reasoning-detail-shape'),
    format: optionalText(members.get('format'), 'reasoning-detail-shape'),
    raw: Object.freeze(Object.fromEntries(value.entries.map(entry => [entry.key, entry.value]))),
  }
}

function toolFragmentOf(value: JsonValue): ToolFragment {
  const members = membersOf(value, 'tool-call-shape')
  const index = optionalIndex(members.get('index'), 'tool-call-shape')
  if (index === null) throw new ChunkShapeError('tool-call-shape')
  const type = members.get('type')
  if (
    type !== undefined &&
    type.kind !== 'null' &&
    !(type.kind === 'string' && type.value === 'function')
  )
    throw new ChunkShapeError('tool-call-shape')
  const call = members.get('function')
  const fields =
    call === undefined || call.kind === 'null'
      ? new Map<string, JsonValue>()
      : membersOf(call, 'tool-call-shape')
  return {
    index,
    id: optionalText(members.get('id'), 'tool-call-shape'),
    name: optionalText(fields.get('name'), 'tool-call-shape'),
    arguments: optionalText(fields.get('arguments'), 'tool-call-shape'),
  }
}

/** The usage object of the gateway. A count that is not a decimal integer is unknown (`null`). */
function usageOf(value: JsonValue | undefined): GatewayUsage | null {
  if (value === undefined || value.kind === 'null') return null
  const members = membersOf(value, 'usage-shape')
  const nested = (name: string, key: string): JsonValue | undefined => {
    const holder = members.get(name)
    return holder?.kind === 'object' ? memberMap(holder).get(key) : undefined
  }
  return {
    promptTokens: countOf(members.get('prompt_tokens')),
    completionTokens: countOf(members.get('completion_tokens')),
    cachedTokens: countOf(nested('prompt_tokens_details', 'cached_tokens')),
    reasoningTokens: countOf(nested('completion_tokens_details', 'reasoning_tokens')),
    raw: Object.freeze(Object.fromEntries(members)),
  }
}

function countOf(value: JsonValue | undefined): string | null {
  return value?.kind === 'number' && DECIMAL.test(value.lexeme) ? value.lexeme : null
}

function membersOf(value: JsonValue, failure: ChunkFailure): ReadonlyMap<string, JsonValue> {
  if (value.kind !== 'object') throw new ChunkShapeError(failure)
  return memberMap(value)
}

/** The members of an object. The JSON reader refuses repeated keys, so each key is unique. */
function memberMap(value: Extract<JsonValue, { kind: 'object' }>): Map<string, JsonValue> {
  return new Map(value.entries.map((entry: JsonEntry) => [entry.key, entry.value]))
}

function itemsOf(value: JsonValue | undefined, failure: ChunkFailure): readonly JsonValue[] {
  if (value === undefined || value.kind === 'null') return []
  if (value.kind !== 'array') throw new ChunkShapeError(failure)
  return value.items
}

/** A string member; absent, `null` and the empty string are `null`. */
function optionalText(value: JsonValue | undefined, failure: ChunkFailure): string | null {
  if (value === undefined || value.kind === 'null') return null
  if (value.kind !== 'string') throw new ChunkShapeError(failure)
  return value.value.length === 0 ? null : value.value
}

function optionalIndex(value: JsonValue | undefined, failure: ChunkFailure): string | null {
  if (value === undefined || value.kind === 'null') return null
  if (value.kind !== 'number' || !DECIMAL.test(value.lexeme)) throw new ChunkShapeError(failure)
  return value.lexeme
}

/** True for a member that carries something: not absent, `null`, `""`, `[]` or `{}`. */
function isFilled(value: JsonValue | undefined): boolean {
  if (value === undefined) return false
  switch (value.kind) {
    case 'null':
      return false
    case 'string':
      return value.value.length > 0
    case 'array':
      return value.items.length > 0
    case 'object':
      return value.entries.length > 0
    case 'boolean':
    case 'number':
      return true
    default: {
      const _exhaustive: never = value
      return _exhaustive
    }
  }
}
