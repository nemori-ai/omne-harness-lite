import {
  checkAppendInput,
  checkLogPayload,
  checkSourceToken,
  compareInteger,
  type LogEntry,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { copyJsonValue, isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { checkedRules } from './key.ts'
import {
  counters,
  ingest,
  validateOriginalReply,
  newIndex,
  type IndexState,
  type IndexedMessage,
} from './index-state.ts'
import { selectBlocks } from './blocks.ts'
import type { Message } from '@omne-harness-lite/messages'
import type {
  Projection,
  ProjectionFailure,
  ProjectionInput,
  ProjectionOptions,
  ProjectionSegment,
  SourceMapping,
} from './types.ts'
const invalid = { invalidInput: true, reason: 'shape' } as const
const sourceInvalid = { invalidInput: true, reason: 'source' } as const
function rejectedBody(payload: unknown): ProjectionFailure {
  if (payload === null || typeof payload !== 'object' || !('owner' in payload)) return sourceInvalid
  return 'failure' in checkLogPayload(payload)
    ? { invalidInput: true, reason: 'claimedPayload' }
    : sourceInvalid
}
export function ownedEntries(
  input: unknown,
  source: SourceToken,
  after: number,
): { readonly entries: readonly LogEntry[] } | ProjectionFailure {
  const copy = copyJsonValue(input)
  if ('failed' in copy || !Array.isArray(copy.ok)) return invalid
  const entries: LogEntry[] = []
  for (const [index, item] of copy.ok.entries()) {
    const checked = ownedEntry(item, source, after + index + 1)
    if ('invalidInput' in checked || 'unavailable' in checked) return checked
    entries.push(checked)
  }
  if (compareInteger(source.tail, after + entries.length) !== 0) return sourceInvalid
  return { entries: Object.freeze(entries) }
}
function ownedEntry(
  item: unknown,
  source: SourceToken,
  position: number,
): LogEntry | ProjectionFailure {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return invalid
  const row = item as LogEntry
  if (
    Object.keys(row).some(
      key =>
        ![
          'session',
          'position',
          'tenant',
          'run',
          'attempt',
          'dedupeKey',
          'readKeys',
          'payload',
        ].includes(key),
    )
  )
    return invalid
  if (
    row.session !== source.session ||
    !isNonNegativeJsonInteger(row.position) ||
    compareInteger(row.position, position) !== 0
  )
    return sourceInvalid
  const { session: _session, position: _position, ...body } = row
  const owned = checkAppendInput(
    source.session,
    [body],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in owned) return rejectedBody(row.payload)
  if (!tenantIdEquals(row.tenant, source.tenant)) return sourceInvalid
  return Object.freeze({ ...owned.ok.entries[0]!, session: source.session, position: row.position })
}
function segment(
  previous: ProjectionSegment | null,
  indexed: IndexedMessage,
): ProjectionSegment | null {
  const selected = selectBlocks(indexed.roots, indexed.silenced)
  if (selected.blocks.length === 0) return previous
  const message = Object.freeze({ ...indexed.message, blocks: selected.blocks }) as Message
  const mapping: SourceMapping = Object.freeze({
    messageId: message.id,
    position: indexed.entry.position,
    blockIds: selected.ids,
  })
  return Object.freeze({ previous, message, source: mapping })
}
export function appendSegments(
  previous: ProjectionSegment | null,
  messages: Iterable<IndexedMessage>,
  state: IndexState,
): { readonly segments: ProjectionSegment | null } | ProjectionFailure {
  let tail = previous
  for (const indexed of messages) {
    const rejected = validateOriginalReply(state, indexed)
    if (rejected !== undefined) return rejected
    tail = segment(tail, indexed)
  }
  return { segments: tail }
}
export function projection(
  state: IndexState,
  source: SourceToken,
  key: string,
  segments: ProjectionSegment | null,
): Projection {
  const value = Object.freeze({ source, inputKey: key, segments, workCounters: counters(state) })
  projections.add(value)
  return value
}
export const projections = new WeakSet<Projection>()
function captureInput(input: ProjectionInput):
  | {
      readonly source: SourceToken
      readonly rules: import('./types.ts').ProjectionRules
      readonly key: string
      readonly entries: readonly LogEntry[]
    }
  | ProjectionFailure {
  const copy = copyJsonValue(input)
  if ('failed' in copy || copy.ok === null || typeof copy.ok !== 'object' || Array.isArray(copy.ok))
    return invalid
  const value = copy.ok as unknown as ProjectionInput
  if (
    Object.keys(value).length !== 3 ||
    !['source', 'entries', 'rules'].every(key => Object.hasOwn(value, key))
  )
    return invalid
  const source = checkSourceToken(value.source),
    rules = checkedRules(value.rules)
  if ('failure' in source) return sourceInvalid
  if (!('rules' in rules)) return rules
  const owned = ownedEntries(value.entries, source.ok, 0)
  if (!('entries' in owned)) return owned
  return { source: source.ok, rules: rules.rules, key: rules.key, entries: owned.entries }
}
export function cold(
  input: ProjectionInput,
  options: ProjectionOptions = {},
): { readonly projected: Projection; readonly state: IndexState } | ProjectionFailure {
  const value = captureInput(input)
  if (!('entries' in value)) return value
  const state = newIndex(value.rules, options)
  for (const entry of value.entries) {
    const failure = ingest(state, entry)
    if (failure !== undefined) return failure
  }
  let segments: ProjectionSegment | null = null
  for (const message of state.rules.system) {
    const mapping: SourceMapping = Object.freeze({
      messageId: message.id,
      position: null,
      blockIds: Object.freeze(message.blocks.map(block => block.id)),
    })
    segments = Object.freeze({ previous: segments, message, source: mapping })
  }
  const selected = appendSegments(segments, state.messages.values(), state)
  if (!('segments' in selected)) return selected
  segments = selected.segments
  return { projected: projection(state, value.source, value.key, segments), state }
}
export function projectMessages(
  input: ProjectionInput,
  options: ProjectionOptions = {},
): { readonly projected: Projection } | ProjectionFailure {
  const result = cold(input, options)
  return 'projected' in result ? { projected: result.projected } : result
}
export function materializeMessages(input: Projection):
  | {
      readonly materialized: readonly Message[]
      readonly sources: readonly SourceMapping[]
      readonly outputMessages: number
      readonly outputBlocks: number
    }
  | ProjectionFailure {
  if (!projections.has(input)) return invalid
  const messages: Message[] = [],
    sources: SourceMapping[] = []
  let blocks = 0
  for (let current = input.segments; current !== null; current = current.previous) {
    messages.push(current.message)
    sources.push(current.source)
    blocks += current.source.blockIds.length
  }
  messages.reverse()
  sources.reverse()
  return {
    materialized: Object.freeze(messages),
    sources: Object.freeze(sources),
    outputMessages: messages.length,
    outputBlocks: blocks,
  }
}
