import { judgeBlockIdentity, type BlockId } from '@omne-harness/content-block'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type { ModelBlock, ModelFault } from '@omne-harness/model-contract'
import type {
  CallAccountReport,
  ProviderDiagnostic,
  TransportFact,
  TransportTermination,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { RouteAccounting } from '../config.ts'
import type { PiProtocolFrame, PiResponseDecoder } from '../family.ts'
import { plainDecimal } from '../chat-completions/decimal.ts'
import type { ToolNames } from '../chat-completions/tool-names.ts'
import {
  readEvent,
  type DoneItem,
  type PartStep,
  type ResponsesEvent,
  type Usage,
} from './events.ts'
import { sealItems } from './reasoning.ts'
import type { ItemEntry, ResponsesLimits, ResponsesRecord } from './vocabulary.ts'

export type ResponsesDecoderInput = Readonly<{
  record: ResponsesRecord
  accounting: RouteAccounting
  limits: ResponsesLimits
  names: ToolNames
}>

const REASONING_STATE_PAYLOAD_MAX_LENGTH = 1048576
const ACCOUNT_EVENT = 'usage'
const SHOWN = Object.freeze({ toHuman: true, toModel: true })
const HIDDEN = Object.freeze({ toHuman: false, toModel: true })
const STOP_WORD = /^[a-z][a-z_]{0,63}$/

type Written = Readonly<{ kind: 'text' | 'thinking'; index: string; value: string }>
type ToolUse = Readonly<{ kind: 'tool'; index: string; id: string; name: string; json: string }>

/** The part of the open item that grows now: a text part of a message, a summary part of reasoning. */
type Growing = Readonly<{ index: string; at: number; value: string }>

// `count` is how many parts of the item were closed; the next part has that number.
type Open =
  | Readonly<{
      kind: 'reasoning' | 'message'
      at: number
      id: string
      count: number
      growing: Growing | null
    }>
  | Readonly<{ kind: 'function_call'; at: number; id: string; tool: ToolUse }>

type Streaming = Readonly<{
  kind: 'streaming'
  started: boolean
  next: number
  expected: number
  open: Open | null
  closed: readonly (Written | ToolUse)[]
  entries: readonly ItemEntry[]
  reasoningText: number
}>

type Finished = Readonly<{
  kind: 'finished'
  termination: TransportTermination
  usage: Usage
}>

type Phase = Streaming | Finished | Readonly<{ kind: 'ended' }>
type Step = Readonly<{ phase: Phase; facts: readonly TransportFact[] }>
type Refusal = Readonly<{ fault: ModelFault }>
type StepResult = Step | Refusal
type Work = { phase: Streaming; facts: TransportFact[] }

const ENDED = Object.freeze({ kind: 'ended' as const })
const START: Streaming = Object.freeze({
  kind: 'streaming',
  started: false,
  next: 0,
  expected: 0,
  open: null,
  closed: [],
  entries: [],
  reasoningText: 0,
})

export function createResponsesDecoder(input: ResponsesDecoderInput): PiResponseDecoder {
  let phase: Phase = START
  const settle = (result: StepResult): Outcome<readonly TransportFact[], ModelFault> => {
    if ('fault' in result) {
      phase = ENDED
      return { failure: result.fault }
    }
    phase = result.phase
    return { ok: result.facts }
  }
  return Object.freeze({
    accept: (frame: PiProtocolFrame) => settle(accept(input, phase, frame)),
    end: () => settle(end(input, phase)),
  })
}

function accept(input: ResponsesDecoderInput, phase: Phase, frame: PiProtocolFrame): StepResult {
  if (phase.kind === 'ended') return protocol('frame-after-end')
  if (frame.kind === 'end-marker')
    return phase.kind === 'finished' ? { phase, facts: [] } : protocol('unexpected-end-marker')
  if (phase.kind === 'finished') return protocol('content-after-finish')
  const read = readEvent(frame.value)
  if ('failure' in read) return protocol(read.failure)
  const event = read.ok
  if (event.type === 'failed') return inBandError(event.code, event.errorType)
  return stream(input, phase, event)
}

function stream(
  input: ResponsesDecoderInput,
  phase: Streaming,
  event: Exclude<ResponsesEvent, { type: 'failed' }>,
): StepResult {
  if (event.type === 'created') return started(phase)
  if (!phase.started) return protocol('event-before-start')
  const work: Work = { phase, facts: [] }
  switch (event.type) {
    case 'in-progress':
      return work
    case 'item-added':
      return added(input.limits, work, event)
    case 'item-done':
      return itemDone(work, event)
    case 'text':
    case 'summary':
      return partStep(input.limits, work, event)
    case 'arguments':
      return argumentsStep(input.limits, work, event)
    case 'completed':
    case 'incomplete':
      return finish(input, work, event)
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

function started(phase: Streaming): StepResult {
  if (phase.started) return protocol('response-restarted')
  return { phase: { ...phase, started: true }, facts: [] }
}

function openBlock(work: Work, content: 'text' | 'thinking' | 'tool-arguments'): string {
  const index = String(work.phase.next)
  work.facts.push({ kind: 'block-open', index, mode: 'append', content })
  work.phase = { ...work.phase, next: work.phase.next + 1 }
  return index
}

function added(
  limits: ResponsesLimits,
  work: Work,
  event: Extract<ResponsesEvent, { type: 'item-added' }>,
): StepResult {
  const { at, item } = event
  if (work.phase.open !== null || at !== work.phase.expected) return protocol('item-out-of-order')
  if (item.type !== 'function_call') {
    const open: Open = { kind: item.type, at, id: item.id, count: 0, growing: null }
    work.phase = { ...work.phase, open }
    return work
  }
  const index = openBlock(work, 'tool-arguments')
  const tool: ToolUse = { kind: 'tool', index, id: item.callId, name: item.name, json: '' }
  work.phase = { ...work.phase, open: { kind: 'function_call', at, id: item.id, tool } }
  return argumentsStep(limits, work, { at, delta: item.arguments })
}

type PartOpen = Extract<Open, { kind: 'reasoning' | 'message' }>

/** Opens the next part of the open message or reasoning item as a block of the given kind. */
function opened(work: Work, open: PartOpen, content: 'text' | 'thinking'): void {
  const index = openBlock(work, content)
  const growing = { index, at: open.count, value: '' }
  work.phase = { ...work.phase, open: { ...open, growing } }
}

function grow(limits: ResponsesLimits, work: Work, piece: string): StepResult {
  const open = work.phase.open
  if (piece === '' || open === null || open.kind === 'function_call' || open.growing === null)
    return work
  if (open.kind === 'reasoning') {
    const reasoningText = work.phase.reasoningText + piece.length
    if (reasoningText > limits.maxReasoningText) return protocol('reasoning-over-buffer-limit')
    work.phase = { ...work.phase, reasoningText }
  }
  const { growing } = open
  work.facts.push({ kind: 'block-delta', index: growing.index, delta: piece })
  const grown = { ...growing, value: growing.value + piece }
  work.phase = { ...work.phase, open: { ...open, growing: grown } }
  return work
}

function closed(work: Work, open: PartOpen, part: number): StepResult {
  if (open.growing?.at !== part) return protocol('stop-out-of-place')
  const { index, value } = open.growing
  const written: Written = { kind: open.kind === 'message' ? 'text' : 'thinking', index, value }
  work.phase = {
    ...work.phase,
    open: { ...open, growing: null, count: open.count + 1 },
    closed: [...work.phase.closed, written],
  }
  return work
}

type PartRun = (limits: ResponsesLimits, work: Work, open: PartOpen, step: PartStep) => StepResult
type PartRule = Readonly<{ misplaced: string; run: PartRun }>

const unchanged: PartRun = (_limits, work) => work

// A text part opens at its start and closes when its text is done.
const TEXT_STEPS: Readonly<Record<PartStep['kind'], PartRule>> = {
  start: {
    misplaced: 'part-out-of-order',
    run: (limits, work, open, step) => {
      if (open.growing !== null || open.count !== step.part) return protocol('part-out-of-order')
      opened(work, open, 'text')
      return grow(limits, work, step.text)
    },
  },
  delta: {
    misplaced: 'delta-out-of-place',
    run: (limits, work, open, step) =>
      open.growing?.at === step.part
        ? grow(limits, work, step.text)
        : protocol('delta-out-of-place'),
  },
  'text-done': {
    misplaced: 'stop-out-of-place',
    run: (_limits, work, open, step) => closed(work, open, step.part),
  },
  end: {
    misplaced: 'stop-out-of-place',
    run: (_limits, work, open, step) =>
      open.growing === null && open.count === step.part + 1 ? work : protocol('stop-out-of-place'),
  },
}

// A summary part opens with its first text; one with no text opens no block and only counts.
const SUMMARY_STEPS: Readonly<Record<PartStep['kind'], PartRule>> = {
  start: { misplaced: 'delta-out-of-place', run: unchanged },
  delta: {
    misplaced: 'delta-out-of-place',
    run: (limits, work, open, step) => {
      const next = open.growing === null ? open.count : open.growing.at
      if (next !== step.part) return protocol('delta-out-of-place')
      if (open.growing === null) opened(work, open, 'thinking')
      return grow(limits, work, step.text)
    },
  },
  'text-done': {
    misplaced: 'stop-out-of-place',
    run: (_limits, work, open, step) => {
      if (open.growing !== null || step.text !== '') return closed(work, open, step.part)
      if (open.count !== step.part) return protocol('stop-out-of-place')
      work.phase = { ...work.phase, open: { ...open, count: open.count + 1 } }
      return work
    },
  },
  end: { misplaced: 'delta-out-of-place', run: unchanged },
}

function partStep(
  limits: ResponsesLimits,
  work: Work,
  event: Extract<ResponsesEvent, { type: 'text' | 'summary' }>,
): StepResult {
  const rule = (event.type === 'text' ? TEXT_STEPS : SUMMARY_STEPS)[event.step.kind]
  const open = work.phase.open
  const kind = event.type === 'text' ? 'message' : 'reasoning'
  if (open === null || open.kind !== kind || open.at !== event.at) return protocol(rule.misplaced)
  return rule.run(limits, work, open, event.step)
}

function argumentsStep(
  limits: ResponsesLimits,
  work: Work,
  { at, delta }: Readonly<{ at: number; delta: string | null }>,
): StepResult {
  const open = work.phase.open
  if (open?.kind !== 'function_call' || open.at !== at) return protocol('delta-out-of-place')
  if (delta === null || delta === '') return work
  const json = open.tool.json + delta
  if (json.length > limits.toolArguments.maxBytes) return protocol('tool-arguments-over-limit')
  work.facts.push({ kind: 'block-delta', index: open.tool.index, delta })
  work.phase = { ...work.phase, open: { ...open, tool: { ...open.tool, json } } }
  return work
}

function itemDone(
  work: Work,
  { at, item }: Extract<ResponsesEvent, { type: 'item-done' }>,
): StepResult {
  const open = work.phase.open
  if (open === null || open.at !== at || open.id !== item.id) return protocol('item-out-of-place')
  const entry = entryOf(open, item)
  if (entry === null) return protocol('item-out-of-place')
  const tool = open.kind === 'function_call' ? [open.tool] : []
  work.phase = {
    ...work.phase,
    open: null,
    expected: work.phase.expected + 1,
    closed: [...work.phase.closed, ...tool],
    entries: [...work.phase.entries, entry],
  }
  return work
}

function entryOf(open: Open, item: DoneItem): ItemEntry | null {
  if (open.kind === 'function_call')
    return item.type === 'function_call' && item.callId === open.tool.id
      ? { type: 'function_call', id: item.id, callId: item.callId }
      : null
  if (open.kind !== item.type || open.growing !== null) return null
  if (item.type === 'reasoning') return { type: 'reasoning', item: item.item }
  return item.type === 'message'
    ? { type: 'message', id: item.id, parts: open.count, phase: item.phase }
    : null
}

function finish(
  input: ResponsesDecoderInput,
  work: Work,
  event: Extract<ResponsesEvent, { type: 'completed' | 'incomplete' }>,
): StepResult {
  if (work.phase.open !== null) return protocol('finish-with-open-item')
  const termination = terminationOf(work.phase, event)
  if (termination === null) return protocol('finish-without-reason')
  if (termination.kind === 'completed') {
    const sealed = sealAll(input, work, termination.reason === 'limit')
    if (sealed !== null) return sealed
  }
  return { phase: { kind: 'finished', termination, usage: event.usage }, facts: work.facts }
}

function terminationOf(
  phase: Streaming,
  event: Extract<ResponsesEvent, { type: 'completed' | 'incomplete' }>,
): TransportTermination | null {
  if (event.type === 'incomplete') {
    if (event.reason === null) return null
    if (event.reason === 'max_output_tokens') return { kind: 'completed', reason: 'limit' }
    return failed(
      'input-rejected',
      `finish-reason-${STOP_WORD.test(event.reason) ? event.reason : 'other'}`,
    )
  }
  if (phase.closed.length === 0) return failed('upstream-protocol', 'finish-without-content')
  const calls = phase.closed.some(block => block.kind === 'tool')
  return { kind: 'completed', reason: calls ? 'tool-suggestions' : 'stop' }
}

function failed(
  cause: 'input-rejected' | 'upstream-protocol',
  diagnostic: string,
): TransportTermination {
  return { kind: 'failed', fault: { cause, diagnostic, upstreamStatus: null } }
}

function sealAll(input: ResponsesDecoderInput, work: Work, truncated: boolean): Refusal | null {
  const thinkingIds: BlockId[] = []
  for (const block of work.phase.closed) {
    if (block.kind === 'tool' && truncated) continue
    const sealed = block.kind === 'tool' ? toolCall(input, block) : written(block)
    if ('fault' in sealed) return sealed
    if (block.kind === 'thinking') thinkingIds.push(sealed.id)
    work.facts.push({ kind: 'block-seal', index: block.index, block: sealed })
  }
  // A call the output limit cut is not sealed, so its item does not go back either.
  const entries = truncated
    ? work.phase.entries.filter(entry => entry.type !== 'function_call')
    : work.phase.entries
  sealReasoning(work, entries, thinkingIds)
  return null
}

function written(block: Written): ModelBlock {
  return { kind: block.kind, id: blockId(block.index), visibility: SHOWN, text: block.value }
}

function toolCall(input: ResponsesDecoderInput, block: ToolUse): ModelBlock | Refusal {
  const decoded = decodeArguments(input.limits, block.json)
  if (decoded === null) return protocol('tool-arguments-invalid')
  return {
    kind: 'tool_call',
    id: blockId(block.index),
    visibility: SHOWN,
    callId: block.id,
    name: input.names.canonical(block.name),
    arguments: decoded,
  }
}

function decodeArguments(limits: ResponsesLimits, text: string): JsonValue | null {
  if (text.length === 0) return { kind: 'object', entries: [] }
  const read = readJsonText(text, limits.toolArguments)
  return read.kind === 'ok' ? read.value : null
}

// Only a reasoning item or a phase has anything to go back; without either nothing is sealed.
function sealReasoning(work: Work, entries: readonly ItemEntry[], pairs: readonly BlockId[]): void {
  const carries = entries.some(
    entry => entry.type === 'reasoning' || (entry.type === 'message' && entry.phase !== null),
  )
  if (!carries) return
  const payload = sealItems(entries)
  if (payload.length > REASONING_STATE_PAYLOAD_MAX_LENGTH) {
    work.facts.push(
      diagnosticFact({
        kind: 'reasoning-state-dropped',
        reason: 'payload-too-long',
        length: payload.length,
      }),
    )
    return
  }
  const index = String(work.phase.next)
  work.phase = { ...work.phase, next: work.phase.next + 1 }
  work.facts.push({
    kind: 'block-seal',
    index,
    block: { kind: 'reasoning_state', id: blockId(index), visibility: HIDDEN, payload, pairs },
  })
}

function end(input: ResponsesDecoderInput, phase: Phase): StepResult {
  switch (phase.kind) {
    case 'streaming':
      return {
        fault: { cause: 'stream-lost', diagnostic: 'ended-without-finish', upstreamStatus: null },
      }
    case 'finished':
      return {
        phase: ENDED,
        facts: [accountFact(input, phase), { kind: 'ended', termination: phase.termination }],
      }
    case 'ended':
      return protocol('decoder-already-ended')
    default: {
      const _exhaustive: never = phase
      return _exhaustive
    }
  }
}

function counted(name: string, lexeme: string | null): CallAccountReport['usage'][number] {
  return lexeme === null
    ? { name, state: 'unknown', unit: 'token' }
    : { name, state: 'known', lexeme, unit: 'token' }
}

// The interface does not report which upstream served; the record pins exactly one.
function accountFact(input: ResponsesDecoderInput, phase: Finished): TransportFact {
  const { usage } = phase
  const report: CallAccountReport = {
    usage: [
      counted('input', usage.input),
      counted('output', usage.output),
      counted('cache-read', usage.cacheRead),
      counted('cache-write', usage.cacheWrite),
      counted('reasoning', usage.reasoning),
    ],
    cost: costOf(usage, input.accounting.costUnit),
    trimmed: { state: 'unknown', unit: 'token' },
    place: `${input.accounting.place}/${input.record.serving.reports[0]}`,
    duration: { state: 'unknown' },
    revision: '1',
  }
  return { kind: 'account', event: ACCOUNT_EVENT, value: report }
}

function costOf(usage: Usage, costUnit: string): CallAccountReport['cost'] {
  if (usage.cost === null) return []
  const lexeme = plainDecimal(usage.cost)
  if (lexeme !== null) return [{ state: 'known', lexeme, unit: costUnit, source: 'billable' }]
  return [{ state: 'unknown', unit: costUnit, source: 'billable' }]
}

function inBandError(code: string | null, errorType: string | null): Refusal {
  const cause =
    errorType === 'authentication'
      ? 'credential'
      : code === 'server_error' || code === 'rate_limit_exceeded'
        ? 'upstream-unavailable'
        : code === 'invalid_prompt' ||
            code === 'permission_denied' ||
            code === 'image_content_policy_violation'
          ? 'input-rejected'
          : 'unclassified'
  return { fault: { cause, diagnostic: 'in-band-error', upstreamStatus: null } }
}

function blockId(index: string): BlockId {
  const judged = judgeBlockIdentity({ id: `b${index}`, visibility: SHOWN })
  if ('rejected' in judged) throw new Error(`block identity b${index} was refused`)
  return judged.ok.id
}

function diagnosticFact(value: ProviderDiagnostic): TransportFact {
  return { kind: 'diagnostic', value }
}

function protocol(diagnostic: string): Refusal {
  return { fault: { cause: 'upstream-protocol', diagnostic, upstreamStatus: null } }
}
