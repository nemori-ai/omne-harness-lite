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
import { unreportedCost } from '../cost-lookup.ts'
import type { PiProtocolFrame, PiResponseDecoder } from '../family.ts'
import { plainDecimal } from '../chat-completions/decimal.ts'
import type { ToolNames } from '../chat-completions/tool-names.ts'
import {
  readEvent,
  type BlockDelta,
  type MessagesEvent,
  type StartedBlock,
  type Transformation,
  type Usage,
} from './events.ts'
import { sealThinking } from './reasoning.ts'
import type { MessagesLimits, MessagesRecord, ThinkingBlock } from './vocabulary.ts'

export type MessagesDecoderInput = Readonly<{
  record: MessagesRecord
  accounting: RouteAccounting
  limits: MessagesLimits
  names: ToolNames
}>

const REASONING_STATE_PAYLOAD_MAX_LENGTH = 1048576
const ACCOUNT_EVENT = 'usage'
const SHOWN = Object.freeze({ toHuman: true, toModel: true })
const HIDDEN = Object.freeze({ toHuman: false, toModel: true })
const UPSTREAM_WORD = /^[a-z][a-z0-9_.]{0,127}$/
const STOP_WORD = /^[a-z][a-z_]{0,63}$/
const REPLAY_REFUSAL = /Invalid `(signature|data)` in `(thinking|redacted_thinking)` block/

type Written = Readonly<{ kind: 'text' | 'thinking'; index: string; value: string }>
type ToolUse = Readonly<{ kind: 'tool'; index: string; id: string; name: string; json: string }>
type Open =
  | (Written & Readonly<{ at: number; signature: string }>)
  | (ToolUse & Readonly<{ at: number }>)
  | Readonly<{ kind: 'redacted'; at: number; data: string }>

type Streaming = Readonly<{
  kind: 'streaming'
  provider: string | null
  next: number
  expected: number
  open: Open | null
  closed: readonly (Written | ToolUse)[]
  thinking: readonly ThinkingBlock[]
  reasoningText: number
  usage: Usage | null
  reported: ReadonlySet<string>
}>

type Finished = Readonly<{
  kind: 'finished'
  provider: string
  termination: TransportTermination
  usage: Usage | null
  stopped: boolean
}>

type Phase = Streaming | Finished | Readonly<{ kind: 'ended' }>
type Step = Readonly<{ phase: Phase; facts: readonly TransportFact[] }>
type Refusal = Readonly<{ fault: ModelFault }>
type StepResult = Step | Refusal
type Work = { phase: Streaming; facts: TransportFact[] }

const ENDED = Object.freeze({ kind: 'ended' as const })
const START: Streaming = Object.freeze({
  kind: 'streaming',
  provider: null,
  next: 0,
  expected: 0,
  open: null,
  closed: [],
  thinking: [],
  reasoningText: 0,
  usage: null,
  reported: new Set<string>(),
})

export function createMessagesDecoder(input: MessagesDecoderInput): PiResponseDecoder {
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
    refused: (status: number, body: string): ModelFault | null =>
      status === 400 && REPLAY_REFUSAL.test(body)
        ? {
            cause: 'replay-rejected',
            replayCarried: true,
            diagnostic: 'replay-signature',
            upstreamStatus: '400',
          }
        : null,
  })
}

function accept(input: MessagesDecoderInput, phase: Phase, frame: PiProtocolFrame): StepResult {
  if (phase.kind === 'ended') return protocol('frame-after-end')
  if (frame.kind === 'end-marker') return protocol('unexpected-end-marker')
  const read = readEvent(frame.value)
  if ('failure' in read) return protocol(read.failure)
  const event = read.ok
  if (event.type === 'ping') return { phase, facts: [] }
  if (event.type === 'error') return inBandError(event.errorType)
  if (phase.kind === 'finished') return afterFinish(phase, event)
  return stream(input, phase, event)
}

function afterFinish(phase: Finished, event: MessagesEvent): StepResult {
  if (event.type === 'message_stop' && !phase.stopped)
    return { phase: { ...phase, stopped: true }, facts: [] }
  return protocol('content-after-finish')
}

function stream(input: MessagesDecoderInput, phase: Streaming, event: MessagesEvent): StepResult {
  if (event.type === 'message_start') return started(input.record, phase, event)
  if (phase.provider === null) return protocol('event-before-start')
  const work: Work = { phase, facts: [] }
  switch (event.type) {
    case 'content_block_start':
      return opened(work, event.index, event.block) ?? work
    case 'content_block_delta':
      return filled(input.limits, work, event.index, event.delta) ?? work
    case 'content_block_stop':
      return closed(work, event.index) ?? work
    case 'message_delta':
      return finish(input, work, event.stopReason, event.usage)
    case 'message_stop':
      return protocol('stop-before-finish')
    default:
      return protocol('unexpected-event')
  }
}

function started(
  record: MessagesRecord,
  phase: Streaming,
  event: Extract<MessagesEvent, { type: 'message_start' }>,
): StepResult {
  if (phase.provider !== null) return protocol('message-restarted')
  if (event.provider === null) return protocol('serving-not-reported')
  if (!record.serving.reports.includes(event.provider)) return protocol('provider-not-pinned')
  const work: Work = { phase: { ...phase, provider: event.provider }, facts: [] }
  report(work, event.usage)
  return work
}

function report(work: Work, usage: Usage): void {
  const merged = mergeUsage(work.phase.usage, usage)
  const reported = new Set(work.phase.reported)
  for (const item of usage.transformations) {
    const key = JSON.stringify(item)
    if (reported.has(key)) continue
    reported.add(key)
    work.facts.push(diagnosticFact(transformed(item)))
  }
  work.phase = { ...work.phase, usage: merged, reported }
}

function transformed(item: Transformation): ProviderDiagnostic {
  const word = (value: string): string => (UPSTREAM_WORD.test(value) ? value : 'unreadable')
  return {
    kind: 'upstream-transformed',
    type: word(item.type),
    path: word(item.path),
    reason: word(item.reason),
  }
}

function mergeUsage(earlier: Usage | null, later: Usage): Usage {
  if (earlier === null) return later
  return {
    input: later.input ?? earlier.input,
    output: later.output ?? earlier.output,
    cacheRead: later.cacheRead ?? earlier.cacheRead,
    cacheWrite: later.cacheWrite ?? earlier.cacheWrite,
    thinking: later.thinking ?? earlier.thinking,
    cost: later.cost ?? earlier.cost,
    transformations: [],
  }
}

function opened(work: Work, at: number, block: StartedBlock): Refusal | null {
  const { phase } = work
  if (phase.open !== null || at !== phase.expected) return protocol('block-out-of-order')
  if (block.type === 'redacted_thinking') {
    work.phase = { ...phase, open: { kind: 'redacted', at, data: block.data } }
    return null
  }
  const index = String(phase.next)
  const content = block.type === 'tool_use' ? 'tool-arguments' : block.type
  work.facts.push({ kind: 'block-open', index, mode: 'append', content })
  const open: Open =
    block.type === 'tool_use'
      ? { kind: 'tool', at, index, id: block.id, name: block.name, json: '' }
      : block.type === 'text'
        ? { kind: 'text', at, index, value: '', signature: '' }
        : { kind: 'thinking', at, index, value: '', signature: block.signature }
  work.phase = { ...phase, next: phase.next + 1, open }
  const initial =
    block.type === 'text' ? block.text : block.type === 'thinking' ? block.thinking : ''
  return initial === '' ? null : filled(null, work, at, deltaOf(block.type, initial))
}

function deltaOf(type: 'text' | 'thinking' | 'tool_use', piece: string): BlockDelta {
  return type === 'text'
    ? { type: 'text_delta', text: piece }
    : { type: 'thinking_delta', thinking: piece }
}

function filled(
  limits: MessagesLimits | null,
  work: Work,
  at: number,
  delta: BlockDelta,
): Refusal | null {
  const open = work.phase.open
  if (open === null || open.at !== at) return protocol('delta-out-of-place')
  if (delta.type === 'text_delta' && open.kind === 'text') return grow(work, open, delta.text)
  if (delta.type === 'thinking_delta' && open.kind === 'thinking') {
    const reasoningText = work.phase.reasoningText + delta.thinking.length
    if (limits !== null && reasoningText > limits.maxReasoningText)
      return protocol('reasoning-over-buffer-limit')
    work.phase = { ...work.phase, reasoningText }
    return grow(work, open, delta.thinking)
  }
  if (delta.type === 'signature_delta' && open.kind === 'thinking') {
    work.phase = { ...work.phase, open: { ...open, signature: open.signature + delta.signature } }
    return null
  }
  if (delta.type === 'input_json_delta' && open.kind === 'tool') {
    const json = open.json + delta.partialJson
    if (limits !== null && json.length > limits.toolArguments.maxBytes)
      return protocol('tool-arguments-over-limit')
    work.facts.push({ kind: 'block-delta', index: open.index, delta: delta.partialJson })
    work.phase = { ...work.phase, open: { ...open, json } }
    return null
  }
  return protocol('delta-out-of-place')
}

function grow(work: Work, open: Extract<Open, { kind: 'text' | 'thinking' }>, piece: string) {
  if (piece === '') return null
  work.facts.push({ kind: 'block-delta', index: open.index, delta: piece })
  work.phase = { ...work.phase, open: { ...open, value: open.value + piece } }
  return null
}

function closed(work: Work, at: number): Refusal | null {
  const { phase } = work
  const open = phase.open
  if (open === null || open.at !== at) return protocol('stop-out-of-place')
  const next = { ...phase, open: null, expected: phase.expected + 1 }
  switch (open.kind) {
    case 'redacted':
      work.phase = {
        ...next,
        thinking: [...phase.thinking, { type: 'redacted_thinking', data: open.data }],
      }
      return null
    case 'thinking': {
      const signed: readonly ThinkingBlock[] =
        open.signature === ''
          ? []
          : [{ type: 'thinking', thinking: open.value, signature: open.signature }]
      const written: Written = { kind: 'thinking', index: open.index, value: open.value }
      work.phase = {
        ...next,
        thinking: [...phase.thinking, ...signed],
        closed: [...phase.closed, written],
      }
      return null
    }
    case 'text':
      work.phase = {
        ...next,
        closed: [...phase.closed, { kind: 'text', index: open.index, value: open.value }],
      }
      return null
    case 'tool': {
      const { kind, index, id, name, json } = open
      work.phase = { ...next, closed: [...phase.closed, { kind, index, id, name, json }] }
      return null
    }
    default: {
      const _exhaustive: never = open
      return _exhaustive
    }
  }
}

type Ending = Readonly<{ kind: 'completed'; reason: 'stop' | 'limit' | 'tool-suggestions' }> | null

function endingOf(stopReason: string): Ending {
  switch (stopReason) {
    case 'end_turn':
    case 'stop_sequence':
      return { kind: 'completed', reason: 'stop' }
    case 'tool_use':
      return { kind: 'completed', reason: 'tool-suggestions' }
    case 'max_tokens':
      return { kind: 'completed', reason: 'limit' }
    default:
      return null
  }
}

function finish(
  input: MessagesDecoderInput,
  work: Work,
  stopReason: string | null,
  usage: Usage,
): StepResult {
  if (work.phase.open !== null) return protocol('finish-with-open-block')
  if (stopReason === null) return protocol('finish-without-reason')
  report(work, usage)
  const termination = terminationOf(work.phase, endingOf(stopReason), stopReason)
  if (termination.kind === 'completed') {
    const sealed = sealAll(input, work, termination.reason === 'limit')
    if (sealed !== null) return sealed
  }
  const { provider, usage: merged } = work.phase
  if (provider === null) return protocol('event-before-start')
  return {
    phase: { kind: 'finished', provider, termination, usage: merged, stopped: false },
    facts: work.facts,
  }
}

function terminationOf(phase: Streaming, ending: Ending, stopReason: string): TransportTermination {
  if (ending === null)
    return failed(
      'input-rejected',
      `finish-reason-${STOP_WORD.test(stopReason) ? stopReason : 'other'}`,
    )
  const calls = phase.closed.some(block => block.kind === 'tool')
  if (ending.reason !== 'limit' && phase.closed.length === 0)
    return failed('upstream-protocol', 'finish-without-content')
  if (ending.reason === 'tool-suggestions' && !calls)
    return failed('upstream-protocol', 'finish-without-tool-call')
  return ending
}

function failed(
  cause: 'input-rejected' | 'upstream-protocol',
  diagnostic: string,
): TransportTermination {
  return { kind: 'failed', fault: { cause, diagnostic, upstreamStatus: null } }
}

function sealAll(input: MessagesDecoderInput, work: Work, truncated: boolean): Refusal | null {
  const thinkingIds: BlockId[] = []
  for (const block of work.phase.closed) {
    if (block.kind === 'tool' && truncated) continue
    const sealed = block.kind === 'tool' ? toolCall(input, block) : written(block)
    if ('fault' in sealed) return sealed
    if (block.kind === 'thinking') thinkingIds.push(sealed.id)
    work.facts.push({ kind: 'block-seal', index: block.index, block: sealed })
  }
  return sealReasoning(work, thinkingIds)
}

function written(block: Written): ModelBlock {
  return { kind: block.kind, id: blockId(block.index), visibility: SHOWN, text: block.value }
}

function toolCall(input: MessagesDecoderInput, block: ToolUse): ModelBlock | Refusal {
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

function decodeArguments(limits: MessagesLimits, text: string): JsonValue | null {
  if (text.length === 0) return { kind: 'object', entries: [] }
  const read = readJsonText(text, limits.toolArguments)
  return read.kind === 'ok' ? read.value : null
}

function sealReasoning(work: Work, thinkingIds: readonly BlockId[]): Refusal | null {
  if (work.phase.thinking.length === 0) return null
  const payload = sealThinking(work.phase.thinking)
  if (payload.length > REASONING_STATE_PAYLOAD_MAX_LENGTH) {
    work.facts.push(
      diagnosticFact({
        kind: 'reasoning-state-dropped',
        reason: 'payload-too-long',
        length: payload.length,
      }),
    )
    return null
  }
  const index = String(work.phase.next)
  work.phase = { ...work.phase, next: work.phase.next + 1 }
  work.facts.push({
    kind: 'block-seal',
    index,
    block: {
      kind: 'reasoning_state',
      id: blockId(index),
      visibility: HIDDEN,
      payload,
      pairs: thinkingIds,
    },
  })
  return null
}

function end(input: MessagesDecoderInput, phase: Phase): StepResult {
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

function accountFact(input: MessagesDecoderInput, phase: Finished): TransportFact {
  const usage = phase.usage
  const report: CallAccountReport = {
    usage: [
      counted('input', usage?.input ?? null),
      counted('output', usage?.output ?? null),
      counted('cache-read', usage?.cacheRead ?? null),
      counted('cache-write', usage?.cacheWrite ?? null),
      counted('reasoning', usage?.thinking ?? null),
    ],
    cost: costOf(usage, input.accounting),
    trimmed: { state: 'unknown', unit: 'token' },
    place: `${input.accounting.place}/${phase.provider}`,
    duration: { state: 'unknown' },
    revision: '1',
  }
  return { kind: 'account', event: ACCOUNT_EVENT, value: report }
}

function costOf(usage: Usage | null, accounting: RouteAccounting): CallAccountReport['cost'] {
  const { costUnit } = accounting
  if (usage?.cost === null || usage?.cost === undefined) return unreportedCost(accounting)
  const lexeme = plainDecimal(usage.cost)
  if (lexeme !== null) return [{ state: 'known', lexeme, unit: costUnit, source: 'billable' }]
  return [{ state: 'unknown', unit: costUnit, source: 'billable' }]
}

function inBandError(errorType: string | null): Refusal {
  const cause =
    errorType === 'overloaded_error' ||
    errorType === 'api_error' ||
    errorType === 'rate_limit_error'
      ? 'upstream-unavailable'
      : errorType === 'invalid_request_error' || errorType === 'request_too_large'
        ? 'input-rejected'
        : errorType === 'authentication_error' || errorType === 'permission_error'
          ? 'credential'
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
