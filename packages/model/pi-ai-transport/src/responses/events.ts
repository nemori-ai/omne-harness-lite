import type { JsonValue } from '@omne-harness/json-text'
import { sorted } from '../chat-completions/json.ts'
import { PHASE } from './vocabulary.ts'

/** One stream event of the Responses interface, read into what the decoder needs. */
export type ResponsesEvent =
  | Readonly<{ type: 'created' }>
  | Readonly<{ type: 'in-progress' }>
  | Readonly<{ type: 'item-added'; at: number; item: AddedItem }>
  | Readonly<{ type: 'item-done'; at: number; item: DoneItem }>
  | Readonly<{ type: 'text'; at: number; step: PartStep }>
  | Readonly<{ type: 'summary'; at: number; step: PartStep }>
  | Readonly<{ type: 'arguments'; at: number; delta: string | null }>
  | Readonly<{ type: 'completed'; usage: Usage }>
  | Readonly<{ type: 'incomplete'; reason: string | null; usage: Usage }>
  | Readonly<{ type: 'failed'; code: string | null; errorType: string | null }>

/**
 * One step of a part of an item: a text part of a message, or a summary part of a reasoning
 * item. Its text is the first text of a start, the piece of a delta, the whole text when the
 * text is done, and empty otherwise.
 */
export type PartStep = Readonly<{
  kind: 'start' | 'delta' | 'text-done' | 'end'
  part: number
  text: string
}>

export type AddedItem =
  | Readonly<{ type: 'reasoning'; id: string }>
  | Readonly<{ type: 'message'; id: string }>
  | Readonly<{ type: 'function_call'; id: string; callId: string; name: string; arguments: string }>

export type DoneItem =
  | Readonly<{ type: 'reasoning'; id: string; item: JsonValue }>
  | Readonly<{ type: 'message'; id: string; phase: string | null }>
  | Readonly<{ type: 'function_call'; id: string; callId: string }>

/** The usage members an event carried, as decimal lexemes. */
export type Usage = Readonly<{
  input: string | null
  output: string | null
  cacheRead: string | null
  cacheWrite: string | null
  reasoning: string | null
  cost: string | null
}>

export type EventRead = Readonly<{ ok: ResponsesEvent }> | Readonly<{ failure: string }>

type Members = ReadonlyMap<string, JsonValue>
type Reader = (members: Members) => EventRead
type ItemFailure = 'unsupported-item' | 'item-without-members'
type ItemHead = Readonly<{ type: 'reasoning' | 'message' | 'function_call'; id: string }>

const DECIMAL = /^(0|[1-9][0-9]*)$/
const NUMBER = /^(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/

function membersOf(value: JsonValue | undefined): Members | null {
  return value?.kind === 'object'
    ? new Map(value.entries.map(entry => [entry.key, entry.value]))
    : null
}

function textOf(members: Members | null, key: string): string | null {
  const value = members?.get(key)
  return value?.kind === 'string' ? value.value : null
}

function wordOf(members: Members, key: string): string | null {
  const value = textOf(members, key)
  return value === '' ? null : value
}

function lexemeOf(members: Members | null, key: string): string | null {
  const value = members?.get(key)
  return value?.kind === 'number' && DECIMAL.test(value.lexeme) ? value.lexeme : null
}

function countOf(members: Members, key: string): number | null {
  const lexeme = lexemeOf(members, key)
  return lexeme === null ? null : Number(lexeme)
}

function usageOf(response: Members | null): Usage {
  const usage = membersOf(response?.get('usage'))
  const input = membersOf(usage?.get('input_tokens_details'))
  const output = membersOf(usage?.get('output_tokens_details'))
  const cost = usage?.get('cost')
  return {
    input: lexemeOf(usage, 'input_tokens'),
    output: lexemeOf(usage, 'output_tokens'),
    cacheRead: lexemeOf(input, 'cached_tokens'),
    cacheWrite: lexemeOf(input, 'cache_write_tokens'),
    reasoning: lexemeOf(output, 'reasoning_tokens'),
    cost: cost?.kind === 'number' && NUMBER.test(cost.lexeme) ? cost.lexeme : null,
  }
}

function headOf(item: Members): ItemHead | ItemFailure {
  const type = textOf(item, 'type')
  if (type !== 'reasoning' && type !== 'message' && type !== 'function_call')
    return 'unsupported-item'
  const id = wordOf(item, 'id')
  return id === null ? 'item-without-members' : { type, id }
}

function addedOf(item: Members): AddedItem | ItemFailure {
  const head = headOf(item)
  if (typeof head === 'string') return head
  if (head.type === 'reasoning') return { type: 'reasoning', id: head.id }
  if (head.type === 'message')
    return textOf(item, 'role') === 'assistant'
      ? { type: 'message', id: head.id }
      : 'unsupported-item'
  const callId = wordOf(item, 'call_id')
  const name = textOf(item, 'name')
  if (callId === null || name === null) return 'item-without-members'
  return {
    type: 'function_call',
    id: head.id,
    callId,
    name,
    arguments: textOf(item, 'arguments') ?? '',
  }
}

// A reasoning item is kept as written, but for its status.
function doneOf(value: Extract<JsonValue, { kind: 'object' }>): DoneItem | ItemFailure {
  const item: Members = new Map(value.entries.map(entry => [entry.key, entry.value]))
  const head = headOf(item)
  if (typeof head === 'string') return head
  if (head.type === 'reasoning') {
    const kept = value.entries.filter(entry => entry.key !== 'status')
    return { type: 'reasoning', id: head.id, item: sorted({ kind: 'object', entries: kept }) }
  }
  if (head.type === 'message') {
    const phase = textOf(item, 'phase')
    return {
      type: 'message',
      id: head.id,
      phase: phase !== null && PHASE.test(phase) ? phase : null,
    }
  }
  const callId = wordOf(item, 'call_id')
  return callId === null ? 'item-without-members' : { type: 'function_call', id: head.id, callId }
}

function itemEvent(done: boolean): Reader {
  return members => {
    const at = countOf(members, 'output_index')
    if (at === null) return { failure: 'event-without-index' }
    const value = members.get('item')
    if (value?.kind !== 'object') return { failure: 'item-without-members' }
    if (done) {
      const item = doneOf(value)
      return typeof item === 'string' ? { failure: item } : { ok: { type: 'item-done', at, item } }
    }
    const item = addedOf(new Map(value.entries.map(entry => [entry.key, entry.value])))
    return typeof item === 'string' ? { failure: item } : { ok: { type: 'item-added', at, item } }
  }
}

type StepText = (members: Members) => Readonly<{ text: string }> | Readonly<{ failure: string }>

const NO_TEXT: StepText = () => ({ text: '' })

function member(key: 'delta' | 'text'): StepText {
  return members => {
    const text = textOf(members, key)
    return text === null ? { failure: 'event-without-text' } : { text }
  }
}

// The first text of a message part, which must be a text part.
const partText: StepText = members => {
  const part = membersOf(members.get('part'))
  const text = textOf(part, 'text')
  return textOf(part, 'type') !== 'output_text' || text === null
    ? { failure: 'unsupported-part' }
    : { text }
}

function partStep(type: 'text' | 'summary', kind: PartStep['kind'], read: StepText): Reader {
  const index = type === 'text' ? 'content_index' : 'summary_index'
  return members => {
    const at = countOf(members, 'output_index')
    const part = countOf(members, index)
    if (at === null || part === null) return { failure: 'event-without-index' }
    const text = read(members)
    return 'failure' in text ? text : { ok: { type, at, step: { kind, part, text: text.text } } }
  }
}

function argumentsEvent(done: boolean): Reader {
  return members => {
    const at = countOf(members, 'output_index')
    if (at === null) return { failure: 'event-without-index' }
    const delta = done ? null : textOf(members, 'delta')
    return !done && delta === null
      ? { failure: 'event-without-text' }
      : { ok: { type: 'arguments', at, delta } }
  }
}

const finished: Reader = members => {
  const response = membersOf(members.get('response'))
  if (textOf(members, 'type') === 'response.completed')
    return { ok: { type: 'completed', usage: usageOf(response) } }
  const details = membersOf(response?.get('incomplete_details'))
  return {
    ok: { type: 'incomplete', reason: textOf(details, 'reason'), usage: usageOf(response) },
  }
}

const failedResponse: Reader = members => {
  const response = membersOf(members.get('response'))
  const code = textOf(membersOf(response?.get('error')), 'code')
  return { ok: { type: 'failed', code, errorType: textOf(response, 'error_type') } }
}

const READERS: ReadonlyMap<string, Reader> = new Map<string, Reader>([
  ['response.created', () => ({ ok: { type: 'created' } })],
  ['response.in_progress', () => ({ ok: { type: 'in-progress' } })],
  ['response.output_item.added', itemEvent(false)],
  ['response.output_item.done', itemEvent(true)],
  ['response.content_part.added', partStep('text', 'start', partText)],
  ['response.output_text.delta', partStep('text', 'delta', member('delta'))],
  ['response.output_text.done', partStep('text', 'text-done', NO_TEXT)],
  ['response.content_part.done', partStep('text', 'end', NO_TEXT)],
  ['response.reasoning_summary_part.added', partStep('summary', 'start', NO_TEXT)],
  ['response.reasoning_summary_text.delta', partStep('summary', 'delta', member('delta'))],
  ['response.reasoning_summary_text.done', partStep('summary', 'text-done', member('text'))],
  ['response.reasoning_summary_part.done', partStep('summary', 'end', NO_TEXT)],
  ['response.function_call_arguments.delta', argumentsEvent(false)],
  ['response.function_call_arguments.done', argumentsEvent(true)],
  ['response.completed', finished],
  ['response.incomplete', finished],
  ['response.failed', failedResponse],
  [
    'error',
    members => ({ ok: { type: 'failed', code: textOf(members, 'code'), errorType: null } }),
  ],
])

/** Reads one data frame; an event this engine cannot read is a protocol failure, never skipped. */
export function readEvent(value: JsonValue): EventRead {
  const members = membersOf(value)
  if (members === null) return { failure: 'event-not-object' }
  const reader = READERS.get(textOf(members, 'type') ?? '')
  return reader === undefined ? { failure: 'unsupported-event' } : reader(members)
}
