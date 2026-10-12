import { writeJsonLossless, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  inspectModelMessageEntry,
  inspectModelLogEntry,
  readModelLogEnvelope,
  modelLogJsonEqual,
  type CapturedModelLogValue,
} from '@omne-harness-lite/model-request-runtime'
import { readSessionFact } from '@omne-harness-lite/session-runtime'
import type { Message } from '@omne-harness-lite/messages'
import { checkLogPayload, compareInteger, type LogEntry } from '@omne-harness-lite/session-log'
import { indexBlocks } from './blocks.ts'
import type {
  BlockNode,
  ProjectionFailure,
  ProjectionOptions,
  ProjectionRules,
  WorkCounters,
} from './types.ts'
export interface IndexedMessage {
  readonly message: Message
  readonly entry: LogEntry
  readonly roots: readonly BlockNode[]
  readonly blocks: ReadonlyMap<string, BlockNode>
  readonly silenced: Set<string>
  readonly index: number
}
interface OriginalReply {
  readonly value: JsonValue
  readonly entry: LogEntry
  readonly captured: CapturedModelLogValue
}
export interface IndexState {
  readonly dedupes: Set<string>
  readonly messages: Map<string, IndexedMessage>
  readonly originals: Map<string, OriginalReply>
  readonly assistantResponses: Set<string>
  readonly completeCalls: Map<string, LogEntry>
  readonly toolReturns: Set<string>
  readonly internalReturns: Set<string>
  readonly backgroundCalls: Set<string>
  readonly backgroundEnded: Set<string>
  readonly pending: Map<string, Set<string>>
  readonly rules: ProjectionRules
  readonly options: ProjectionOptions
  entries: number
  blocks: number
  references: number
}
export const pairingFailure = { invalidInput: true, reason: 'pairing' } as const
export const claimedFailure = { invalidInput: true, reason: 'claimedPayload' } as const
export const compactionFailure = { invalidInput: true, reason: 'compaction' } as const
export const requiredSource = { unavailable: true, reason: 'requiredSource' } as const
export function newIndex(rules: ProjectionRules, options: ProjectionOptions): IndexState {
  const pending = new Map<string, Set<string>>()
  for (const ref of rules.pendingCardBlocks ?? []) {
    let blocks = pending.get(ref.messageId)
    if (blocks === undefined) {
      blocks = new Set()
      pending.set(ref.messageId, blocks)
    }
    blocks.add(ref.blockId)
  }
  return {
    dedupes: new Set(),
    messages: new Map(),
    originals: new Map(),
    assistantResponses: new Set(),
    completeCalls: new Map(),
    toolReturns: new Set(),
    internalReturns: new Set(),
    backgroundCalls: new Set(),
    backgroundEnded: new Set(),
    pending,
    rules,
    options: {
      factReaders: new Map(options.factReaders),
      entryReaders: Object.freeze([...(options.entryReaders ?? [])]),
    },
    entries: 0,
    blocks: 0,
    references: 0,
  }
}
function ownModelFact(state: IndexState, entry: LogEntry): ProjectionFailure | undefined {
  const decoded = readModelLogEnvelope(entry.payload)
  if ('failure' in decoded || decoded.kind !== 'model' || decoded.envelope.format !== 'mrr/3')
    return claimedFailure
  if (decoded.envelope.category === 'message') return claimedFailure
  const captured = inspectModelLogEntry({
    session: entry.session,
    tenant: entry.tenant,
    entry,
    purpose: { kind: decoded.envelope.category },
    messagePrefix: null,
  })
  if ('invalidValue' in captured) return claimedFailure
  return originalResponse(state, entry, captured.ok.captured)
}
function originalResponse(
  state: IndexState,
  entry: LogEntry,
  captured: CapturedModelLogValue,
): ProjectionFailure | undefined {
  const response = captured.response
  if (response === null) return undefined
  const existing = state.originals.get(response.id)
  if (existing !== undefined)
    return modelLogJsonEqual(existing.entry, entry) ? undefined : pairingFailure
  const reply = response.reply
  if (response.replyDisposition === 'persisted') {
    if (reply === undefined || reply === null) return pairingFailure
    state.originals.set(response.id, { value: reply, entry, captured })
  }
  return undefined
}
function fact(
  state: IndexState,
  entry: LogEntry,
  owner: string,
  value: JsonValue,
): ProjectionFailure | undefined {
  if (owner === 'model-request-runtime') return ownModelFact(state, entry)
  if (owner === 'session-runtime')
    return 'failure' in readSessionFact(entry) ? claimedFailure : undefined
  const reader = state.options.factReaders?.get(owner)
  if (reader === undefined)
    return ['runtime-context', 'tool-execution-runtime', 'loop-extension-runner'].includes(owner)
      ? requiredSource
      : undefined
  const result = reader(value, entry)
  if (result === 'unavailable') return requiredSource
  return result === 'invalid' ? claimedFailure : undefined
}
function assistant(
  state: IndexState,
  entry: LogEntry,
  message: Extract<Message, { type: 'assistant' }>,
): ProjectionFailure | undefined {
  if (state.assistantResponses.has(message.response)) return pairingFailure
  state.assistantResponses.add(message.response)
  for (const block of message.blocks) {
    if (block.kind !== 'tool_call' || !block.complete) continue
    if (state.completeCalls.has(block.callId)) return pairingFailure
    state.completeCalls.set(block.callId, entry)
  }
  return undefined
}
/** Validate once after the fixed batch has indexed its original responses. */
export function validateOriginalReply(
  state: IndexState,
  indexed: IndexedMessage,
): ProjectionFailure | undefined {
  const message = indexed.message,
    entry = indexed.entry
  if (message.type !== 'assistant') return undefined
  const original = state.originals.get(message.response)
  if (original === undefined) return requiredSource

  if (
    original.entry.run !== entry.run ||
    (original.entry.attempt === undefined) !== (entry.attempt === undefined)
  )
    return pairingFailure
  if (
    entry.attempt !== undefined &&
    original.entry.attempt !== undefined &&
    compareInteger(entry.attempt, original.entry.attempt) !== 0
  )
    return pairingFailure
  if (!modelLogJsonEqual(original.value, message)) return pairingFailure
  const checked = inspectModelMessageEntry({
    session: entry.session,
    tenant: entry.tenant,
    entry,
    purpose: { kind: 'persistedMessage', response: original.captured },
  })
  if ('invalidValue' in checked) return claimedFailure

  return undefined
}
function sameFence(left: LogEntry, right: LogEntry): boolean {
  if (left.run !== right.run || (left.attempt === undefined) !== (right.attempt === undefined))
    return false
  return (
    left.attempt === undefined ||
    (right.attempt !== undefined && compareInteger(left.attempt, right.attempt) === 0)
  )
}
function returned(
  state: IndexState,
  entry: LogEntry,
  message: Extract<Message, { type: 'tool' | 'tool_internal' }>,
): ProjectionFailure | undefined {
  const returns = message.type === 'tool' ? state.toolReturns : state.internalReturns
  const call = state.completeCalls.get(message.callId)
  if (call === undefined || !sameFence(call, entry) || returns.has(message.callId))
    return pairingFailure
  returns.add(message.callId)
  if (message.type === 'tool' && message.blocks[0].outcome === 'backgrounded')
    state.backgroundCalls.add(message.callId)
  return undefined
}
function reminder(
  state: IndexState,
  entry: LogEntry,
  message: Extract<Message, { type: 'system_reminder' }>,
): ProjectionFailure | undefined {
  const source = message.source
  if (
    source.kind !== 'background_execution_finished' &&
    source.kind !== 'background_execution_interrupted'
  )
    return undefined
  const call = state.completeCalls.get(source.callId)
  if (
    call === undefined ||
    !sameFence(call, entry) ||
    !state.backgroundCalls.has(source.callId) ||
    state.backgroundEnded.has(source.callId)
  )
    return pairingFailure
  state.backgroundEnded.add(source.callId)
  return undefined
}
function silence(
  state: IndexState,
  message: Extract<Message, { type: 'compaction' }>,
): ProjectionFailure | undefined {
  if (message.silenced.length === 0) return undefined
  if (state.rules.pendingCardBlocks === null || state.rules.lastModelRequestPrefixLength === null)
    return requiredSource
  const last = state.rules.lastModelRequestPrefixLength
  if (last > state.messages.size) return compactionFailure
  for (const ref of message.silenced) {
    state.references++
    const failure = silenceRef(state, ref, last)
    if (failure !== undefined) return failure
  }
  return undefined
}
function silenceRef(
  state: IndexState,
  ref: { readonly messageId: string; readonly blockId: string },
  last: number,
): ProjectionFailure | undefined {
  const target = state.messages.get(ref.messageId),
    node = target?.blocks.get(ref.blockId)
  if (target === undefined || node === undefined || target.index >= last) return compactionFailure
  if (node.pendingAncestor || node.hasPending) return compactionFailure
  if (
    target.message.type === 'tool' &&
    target.message.blocks[0].outcome === 'backgrounded' &&
    !state.backgroundEnded.has(target.message.callId)
  )
    return compactionFailure
  target.silenced.add(ref.blockId)
}
function messageFacts(
  state: IndexState,
  entry: LogEntry,
  message: Message,
): ProjectionFailure | undefined {
  if (state.messages.has(message.id) || message.type === 'system') return pairingFailure
  if (message.type !== 'assistant') {
    const checked = inspectModelMessageEntry({
      session: entry.session,
      tenant: entry.tenant,
      entry,
      purpose: { kind: 'message' },
    })
    if ('invalidValue' in checked) return claimedFailure
  }
  return messageAssociations(state, entry, message)
}
function messageAssociations(
  state: IndexState,
  entry: LogEntry,
  message: Message,
): ProjectionFailure | undefined {
  switch (message.type) {
    case 'assistant':
      return assistant(state, entry, message)
    case 'tool':
    case 'tool_internal':
      return returned(state, entry, message)
    case 'system_reminder':
      return reminder(state, entry, message)
    case 'compaction':
      return silence(state, message)
    case 'user':
    case 'system':
      return undefined
  }
}
function entryChecks(state: IndexState, entry: LogEntry): ProjectionFailure | undefined {
  for (const reader of state.options.entryReaders ?? []) {
    const read = reader(entry)
    if (read === 'invalid') return claimedFailure
    if (read === 'unavailable') return requiredSource
  }
  if (entry.dedupeKey !== undefined) {
    if (state.dedupes.has(entry.dedupeKey)) return pairingFailure
    state.dedupes.add(entry.dedupeKey)
  }
  return undefined
}
export function ingest(state: IndexState, entry: LogEntry): ProjectionFailure | undefined {
  state.entries++
  const checked = entryChecks(state, entry)
  if (checked !== undefined) return checked
  const payload = checkLogPayload(entry.payload)
  if ('failure' in payload) return claimedFailure
  if (payload.kind === 'other') return claimedModelKeys(entry) ? claimedFailure : undefined
  if (payload.kind === 'fact') {
    if (claimedModelKeys(entry) && payload.payload.owner !== 'model-request-runtime')
      return claimedFailure
    return fact(state, entry, payload.payload.owner, payload.payload.value)
  }
  return ingestMessage(state, entry, payload.payload.value)
}
function ingestMessage(
  state: IndexState,
  entry: LogEntry,
  message: Message,
): ProjectionFailure | undefined {
  const rejected = messageFacts(state, entry, message)
  if (rejected !== undefined) return rejected
  const indexed = indexBlocks(message.blocks, state.pending.get(message.id) ?? new Set())
  state.blocks += indexed.count
  state.messages.set(message.id, {
    message,
    entry,
    roots: indexed.roots,
    blocks: indexed.byId,
    silenced: new Set(),
    index: state.messages.size,
  })
  return undefined
}
export function counters(state: IndexState): WorkCounters {
  return Object.freeze({
    entries: state.entries,
    blocks: state.blocks,
    references: state.references,
    messages: state.messages.size,
  })
}

function claimedModelKeys(entry: LogEntry): boolean {
  return [entry.dedupeKey, ...entry.readKeys].some(
    key => typeof key === 'string' && /^mrr(?:\/|$)/u.test(key),
  )
}
