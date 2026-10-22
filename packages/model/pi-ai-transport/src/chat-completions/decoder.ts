// Derived from pi 1.0.0, commit a13d35a742c6ef8462812a28fbe1d8c8b7431c32 (the chunk loop of
// `stream`, finishBlock, mapStopReason; the source file is named in provenance.json). Copyright
// (c) 2025 Mario Zechner. MIT: ../../LICENSE.pi. See provenance.json.
//
// The stream decoder of the gateway engine: a phase union and one pure reduce step per frame.
// The decoder object only holds the phase. The single `ended` of the fact stream stays guarded by
// the fact stream; the decoder gives its termination once, from `end()`. A response that failed
// after its finish still gives the account of the usage it received, from `end()`.
import { judgeBlockIdentity, type BlockId } from '@omne-harness/content-block'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type {
  CallAccountReport,
  ModelBlock,
  ModelFault,
  ProviderDiagnostic,
  TransportFact,
  TransportTermination,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { PiProtocolFrame, PiResponseDecoder } from '../family.ts'
import { causeOfStatus } from '../termination.ts'
import {
  readChunk,
  type Chunk,
  type Delta,
  type DetailFragment,
  type ToolFragment,
} from './chunk.ts'
import {
  bufferedLength,
  hookDetails,
  joinDetail,
  REDACTED,
  visibleTextOf,
  type JoinedDetail,
} from './details.ts'
import type {
  ChatCompletionsLimits,
  ChatCompletionsRecord,
  GatewayUsage,
  VendorHooks,
} from './vocabulary.ts'

export type DecoderInput = Readonly<{
  record: ChatCompletionsRecord
  hooks: VendorHooks
  limits: ChatCompletionsLimits
}>

/**
 * The most UTF-16 code units that the payload of a reasoning state part may have: the value of
 * `REASONING_STATE_PAYLOAD_MAX_LENGTH` of `@omne-harness/message`, which this package does not
 * depend on. A sealed payload beyond it gives no part.
 */
const REASONING_STATE_PAYLOAD_MAX_LENGTH = 1048576

/** The gateway that every record of this engine is served through: the prefix of `place`. */
const GATEWAY_PLACE = 'openrouter'
/** The event of the one account of a dispatch. */
const ACCOUNT_EVENT = 'usage'
/** The unit of the gateway `usage.cost`: gateway credits, not a currency. */
const COST_UNIT = 'openrouter-credit'
const COST_LEXEME = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/
/** The usage of a response that reported none: every count unknown. */
const NO_USAGE: GatewayUsage = Object.freeze({
  promptTokens: null,
  completionTokens: null,
  cachedTokens: null,
  reasoningTokens: null,
  raw: Object.freeze({}),
})

const SHOWN = Object.freeze({ toHuman: true, toModel: true })
const HIDDEN = Object.freeze({ toHuman: false, toModel: true })

/** A block that the decoder opened and fills by appending. */
type OpenBlock = Readonly<{ index: string; value: string }>

/** One tool call of the response, keyed by its stream `index`. */
type ToolCall = Readonly<{
  key: string
  id: string | null
  name: string | null
  /** The argument text that arrived before the name. */
  pending: string
  /** UTF-8 bytes of all argument text so far. */
  bytes: number
  /** `null` until the name arrives. */
  block: OpenBlock | null
}>

/** Where the visible reasoning of this response comes from. The first non-empty source wins. */
type VisibleSource = 'plain' | 'reasoning.text' | 'reasoning.summary'

type Serving = Readonly<{ model: string; provider: string }>

type Streaming = Readonly<{
  kind: 'streaming'
  /** Fixed by the first chunk. */
  serving: Serving | null
  /** The index of the next block. */
  next: number
  text: OpenBlock | null
  thinking: OpenBlock | null
  source: VisibleSource | null
  details: readonly JoinedDetail[]
  /** What the reasoning buffer holds, in UTF-16 code units. */
  reasoningText: number
  tools: readonly ToolCall[]
  usage: GatewayUsage | null
}>

type Finished = Readonly<{
  kind: 'finished'
  serving: Serving
  finish: string
  termination: TransportTermination
  /** Tail frames accepted after the finish chunk. */
  tail: number
  usage: GatewayUsage | null
}>

/**
 * A finished response whose later frame the decoder refused. `end()` still gives the account of
 * the usage received before the fault, then the fault as the termination.
 */
type Faulted = Readonly<{ kind: 'faulted'; finished: Finished; fault: ModelFault }>

type Ended = Readonly<{ kind: 'ended' }>

type Phase = Streaming | Finished | Faulted | Ended

type Step = Readonly<{ phase: Phase; facts: readonly TransportFact[] }>

/** A step that refuses the frame. The fact stream ends with this fault. */
type Refusal = Readonly<{ fault: ModelFault }>

type StepResult = Step | Refusal

const START: Streaming = Object.freeze({
  kind: 'streaming',
  serving: null,
  next: 0,
  text: null,
  thinking: null,
  source: null,
  details: [],
  reasoningText: 0,
  tools: [],
  usage: null,
})

const ENDED: Ended = Object.freeze({ kind: 'ended' })

/** Creates the decoder of one dispatch. Each call has its own phase; nothing is shared. */
export function createChatCompletionsDecoder(input: DecoderInput): PiResponseDecoder {
  let phase: Phase = START
  const settle = (
    result: StepResult,
    faulted: (fault: ModelFault) => Phase,
  ): Outcome<readonly TransportFact[], ModelFault> => {
    if ('fault' in result) {
      phase = faulted(result.fault)
      return { failure: result.fault }
    }
    phase = result.phase
    return { ok: result.facts }
  }
  return Object.freeze({
    accept: (frame: PiProtocolFrame) => {
      const current = phase
      return settle(accept(input, current, frame), fault => afterFault(current, fault))
    },
    end: () => settle(end(input, phase), () => ENDED),
  })
}

/** A refused frame ends the decoding; a finished response keeps its usage for the account. */
function afterFault(phase: Phase, fault: ModelFault): Phase {
  switch (phase.kind) {
    case 'finished':
      return { kind: 'faulted', finished: phase, fault }
    case 'faulted':
      return phase
    case 'streaming':
    case 'ended':
      return ENDED
    default: {
      const _exhaustive: never = phase
      return _exhaustive
    }
  }
}

function accept(input: DecoderInput, phase: Phase, frame: PiProtocolFrame): StepResult {
  if (phase.kind === 'ended' || phase.kind === 'faulted') return protocol('frame-after-end')
  // The end marker only ends the protocol; `end()` gives the termination.
  if (frame.kind === 'end-marker') return { phase, facts: [] }
  const chunk = readChunk(frame.value)
  if ('failure' in chunk) return protocol(chunk.failure)
  return reduce(input, phase, chunk.ok)
}

/**
 * EOF, the end marker, or the end of a failed read: the account of a finished response, its usage
 * diagnostics and its termination, or a lost stream. A response faulted after its finish ends
 * with the account and that fault.
 */
function end(input: DecoderInput, phase: Phase): StepResult {
  switch (phase.kind) {
    case 'streaming':
      return {
        fault: { cause: 'stream-lost', diagnostic: 'ended-without-finish', upstreamStatus: null },
      }
    case 'finished':
      return accounted(input, phase, phase.termination)
    case 'faulted':
      return accounted(input, phase.finished, { kind: 'failed', fault: phase.fault })
    case 'ended':
      return protocol('decoder-already-ended')
    default: {
      const _exhaustive: never = phase
      return _exhaustive
    }
  }
}

/** The account of the usage kept so far, its usage diagnostics, then the termination. */
function accounted(
  input: DecoderInput,
  finished: Finished,
  termination: TransportTermination,
): StepResult {
  const usage = input.hooks.usage(finished.usage ?? NO_USAGE)
  if (!('ok' in usage)) return { fault: usage.failure }
  const report: CallAccountReport = {
    usage: usage.ok.items,
    cost: costOf(finished.usage),
    trimmed: { state: 'unknown', unit: 'token' },
    place: `${GATEWAY_PLACE}/${finished.serving.provider}`,
    duration: { state: 'unknown' },
    revision: '1',
  }
  return {
    phase: ENDED,
    facts: [
      { kind: 'account', event: ACCOUNT_EVENT, value: report },
      ...usage.ok.diagnostics.map(diagnosticFact),
      { kind: 'ended', termination },
    ],
  }
}

/** The one reduce step: the phase and one chunk give the next phase and the facts. Pure. */
function reduce(input: DecoderInput, phase: Streaming | Finished, chunk: Chunk): StepResult {
  if (chunk.error !== null) return inBandError(chunk.error.code)
  const serving = servingOf(input.record, phase.serving, chunk)
  if ('fault' in serving) return serving
  return phase.kind === 'streaming'
    ? stream(input, { ...phase, serving: serving.ok }, chunk)
    : tail(input.record, { ...phase, serving: serving.ok }, chunk)
}

function servingOf(
  record: ChatCompletionsRecord,
  fixed: Serving | null,
  chunk: Chunk,
): Readonly<{ ok: Serving }> | Refusal {
  if (fixed === null) {
    if (chunk.model === null || chunk.provider === null) return protocol('serving-not-reported')
    if (!record.serving.reports.includes(chunk.provider)) return protocol('provider-not-pinned')
    return { ok: { model: chunk.model, provider: chunk.provider } }
  }
  if (chunk.provider !== null && chunk.provider !== fixed.provider)
    return protocol('provider-changed')
  if (chunk.model !== null && chunk.model !== fixed.model) return protocol('model-changed')
  return { ok: fixed }
}

/** The error member of a frame: the gateway code maps like an HTTP status; the text is never read. */
function inBandError(code: number | null): Refusal {
  if (code === null)
    return { fault: { cause: 'unclassified', diagnostic: 'in-band-error', upstreamStatus: null } }
  return {
    fault: {
      cause: causeOfStatus(code),
      diagnostic: 'in-band-error',
      upstreamStatus: String(code),
    },
  }
}

// --- streaming -------------------------------------------------------------------------------

type Serves = Streaming & Readonly<{ serving: Serving }>

/** Facts and the phase while a chunk is applied. */
type Work = { phase: Serves; facts: TransportFact[] }

function stream(input: DecoderInput, phase: Serves, chunk: Chunk): StepResult {
  const work: Work = {
    phase: chunk.usage === null ? phase : { ...phase, usage: chunk.usage },
    facts: [],
  }
  const choice = chunk.choice
  if (choice === null) return work
  const applied = applyDelta(input, work, choice.delta)
  if (applied !== null) return applied
  if (choice.finish === null) return work
  return finish(input, work, choice.finish)
}

function applyDelta(input: DecoderInput, work: Work, delta: Delta): Refusal | null {
  for (const piece of [delta.content, delta.refusal]) if (piece !== null) appendText(work, piece)
  for (const piece of visiblePieces(work, delta)) appendThinking(work, piece)
  for (const fragment of delta.details) {
    const added = addDetail(input.limits, work, fragment)
    if (added !== null) return added
  }
  for (const fragment of delta.toolCalls) {
    const added = addToolFragment(input.limits, work, fragment)
    if (added !== null) return added
  }
  return null
}

/** Opens a block at the next index. */
function open(work: Work, content: 'text' | 'thinking' | 'tool-arguments'): OpenBlock {
  const index = String(work.phase.next)
  work.phase = { ...work.phase, next: work.phase.next + 1 }
  work.facts.push({ kind: 'block-open', index, mode: 'append', content })
  return { index, value: '' }
}

function filled(work: Work, block: OpenBlock, delta: string): OpenBlock {
  work.facts.push({ kind: 'block-delta', index: block.index, delta })
  return { index: block.index, value: block.value + delta }
}

/** Content and refusal share one text channel; a refusal does not decide the termination. */
function appendText(work: Work, piece: string): void {
  const block = work.phase.text ?? open(work, 'text')
  work.phase = { ...work.phase, text: filled(work, block, piece) }
}

function appendThinking(work: Work, piece: string): void {
  const block = work.phase.thinking ?? open(work, 'thinking')
  work.phase = { ...work.phase, thinking: filled(work, block, piece) }
}

/** The visible reasoning of a delta from the source of this response, chosen on first use. */
function visiblePieces(work: Work, delta: Delta): readonly string[] {
  const plain = delta.reasoning !== null && delta.reasoning !== REDACTED ? [delta.reasoning] : []
  const fromDetails = (type: DetailFragment['type']): readonly string[] =>
    delta.details.flatMap(fragment => {
      const text = fragment.type === type ? visibleTextOf(fragment) : null
      return text === null ? [] : [text]
    })
  const pieces: Readonly<Record<VisibleSource, readonly string[]>> = {
    plain,
    'reasoning.text': fromDetails('reasoning.text'),
    'reasoning.summary': fromDetails('reasoning.summary'),
  }
  const source =
    work.phase.source ?? VISIBLE_SOURCES.find(candidate => pieces[candidate].length > 0) ?? null
  if (source === null) return []
  work.phase = { ...work.phase, source }
  return pieces[source]
}

const VISIBLE_SOURCES: readonly VisibleSource[] = ['plain', 'reasoning.text', 'reasoning.summary']

function addDetail(
  limits: ChatCompletionsLimits,
  work: Work,
  fragment: DetailFragment,
): Refusal | null {
  const reasoningText = work.phase.reasoningText + bufferedLength(fragment)
  if (reasoningText > limits.maxReasoningText) return protocol('reasoning-over-buffer-limit')
  work.phase = {
    ...work.phase,
    reasoningText,
    details: joinDetail(work.phase.details, fragment),
  }
  return null
}

/** Buffers argument text until the name arrives, then streams it into a tool-arguments block. */
function addToolFragment(
  limits: ChatCompletionsLimits,
  work: Work,
  fragment: ToolFragment,
): Refusal | null {
  const known = work.phase.tools.find(call => call.key === fragment.index)
  let call: ToolCall = known ?? {
    key: fragment.index,
    id: null,
    name: null,
    pending: '',
    bytes: 0,
    block: null,
  }
  if (fragment.id !== null) {
    if (call.id !== null && call.id !== fragment.id) return protocol('tool-call-id-changed')
    call = { ...call, id: fragment.id }
  }
  if (fragment.name !== null) {
    if (call.name !== null && call.name !== fragment.name) return protocol('tool-name-changed')
    call = call.block === null ? named(work, call, fragment.name) : call
  }
  if (fragment.arguments !== null) {
    const bytes = call.bytes + Buffer.byteLength(fragment.arguments, 'utf8')
    if (bytes > limits.toolArguments.maxBytes) return protocol('tool-arguments-over-limit')
    call =
      call.block === null
        ? { ...call, bytes, pending: call.pending + fragment.arguments }
        : { ...call, bytes, block: filled(work, call.block, fragment.arguments) }
  }
  const tools =
    known === undefined
      ? [...work.phase.tools, call]
      : work.phase.tools.map(item => (item.key === call.key ? call : item))
  work.phase = { ...work.phase, tools }
  return null
}

/** The name arrived: the block opens and takes the buffered argument text. */
function named(work: Work, call: ToolCall, name: string): ToolCall {
  const block = open(work, 'tool-arguments')
  return {
    ...call,
    name,
    pending: '',
    block: call.pending.length === 0 ? block : filled(work, block, call.pending),
  }
}

// --- finish ----------------------------------------------------------------------------------

/** How a finish value ends the response. */
type Ending =
  | Readonly<{ kind: 'completed'; reason: 'stop' | 'tool-suggestions' | 'limit' }>
  | Readonly<{ kind: 'failed' }>

function endingOf(finish: string): Ending {
  switch (finish) {
    case 'stop':
      return { kind: 'completed', reason: 'stop' }
    case 'tool_calls':
      return { kind: 'completed', reason: 'tool-suggestions' }
    case 'length':
      return { kind: 'completed', reason: 'limit' }
    default:
      return { kind: 'failed' }
  }
}

/** A finish value is written into the diagnostic only when it is a short plain word. */
const FINISH_WORD = /^[a-z][a-z_]{0,63}$/

function finish(input: DecoderInput, work: Work, value: string): StepResult {
  if (work.phase.tools.some(call => call.block === null)) return protocol('tool-call-without-name')
  const termination = finishTermination(work.phase, endingOf(value), value)
  if (termination.kind === 'completed') {
    const sealed = sealAll(input, work, termination.reason === 'limit')
    if (sealed !== null) return sealed
  }
  const { serving, usage } = work.phase
  return {
    phase: { kind: 'finished', serving, finish: value, termination, tail: 0, usage },
    facts: work.facts,
  }
}

/**
 * The termination of a finish. A `stop` or `tool_calls` finish completes only with content: at
 * least one block, and for `tool_calls` at least one tool call. Without it the finish fails as
 * `upstream-protocol`, because a completed reply must hold a valid block. A failed finish seals
 * nothing; the tail frames and the account still follow.
 */
function finishTermination(phase: Serves, ending: Ending, value: string): TransportTermination {
  if (ending.kind === 'failed')
    return failedFinish(
      'input-rejected',
      `finish-reason-${FINISH_WORD.test(value) ? value : 'other'}`,
    )
  const calls = phase.tools.some(call => call.block !== null)
  const content = calls || phase.text !== null || phase.thinking !== null
  if (ending.reason !== 'limit' && !content)
    return failedFinish('upstream-protocol', 'finish-without-content')
  if (ending.reason === 'tool-suggestions' && !calls)
    return failedFinish('upstream-protocol', 'finish-without-tool-call')
  return { kind: 'completed', reason: ending.reason }
}

function failedFinish(
  cause: 'input-rejected' | 'upstream-protocol',
  diagnostic: string,
): TransportTermination {
  return { kind: 'failed', fault: { cause, diagnostic, upstreamStatus: null } }
}

/**
 * Seals every open block in index order, then the reasoning state parts at new indices. After a
 * `length` finish a tool-arguments block stays open: its arguments may be cut, so it never
 * becomes an executable call.
 */
function sealAll(input: DecoderInput, work: Work, truncated: boolean): Refusal | null {
  const { text, thinking, tools } = work.phase
  const thinkingId = thinking === null ? null : blockId(thinking.index)
  const seals: { index: string; block: () => ModelBlock | Refusal }[] = []
  if (text !== null) seals.push({ index: text.index, block: () => written('text', text) })
  if (thinking !== null)
    seals.push({ index: thinking.index, block: () => written('thinking', thinking) })
  if (!truncated)
    for (const call of tools) {
      const block = call.block
      if (block !== null)
        seals.push({ index: block.index, block: () => toolCall(input, call, block) })
    }
  for (const seal of seals.toSorted((left, right) => Number(left.index) - Number(right.index))) {
    const block = seal.block()
    if ('fault' in block) return block
    work.facts.push({ kind: 'block-seal', index: seal.index, block })
  }
  return sealReasoning(input, work, thinkingId)
}

function written(kind: 'text' | 'thinking', block: OpenBlock): ModelBlock {
  return { kind, id: blockId(block.index), visibility: SHOWN, text: block.value }
}

function toolCall(input: DecoderInput, call: ToolCall, block: OpenBlock): ModelBlock | Refusal {
  if (call.id === null) return protocol('tool-call-without-id')
  if (call.name === null) return protocol('tool-call-without-name')
  const decoded = decodeArguments(input.limits, block.value)
  if (decoded === null) return protocol('tool-arguments-invalid')
  return {
    kind: 'tool_call',
    id: blockId(block.index),
    visibility: SHOWN,
    callId: call.id,
    name: call.name,
    arguments: decoded,
  }
}

/** Empty argument text is an empty object, as upstream reads it. */
function decodeArguments(limits: ChatCompletionsLimits, text: string): JsonValue | null {
  if (text.length === 0) return { kind: 'object', entries: [] }
  const read = readJsonText(text, limits.toolArguments)
  return read.kind === 'ok' ? read.value : null
}

/**
 * All joined details go to the reasoning hook once. Each payload it gives becomes one reasoning
 * state part, sealed whole at a new index and paired with the thinking block. An empty payload
 * gives no part; a payload longer than the message limit gives a `reasoning-state-dropped`
 * diagnostic with its length instead.
 */
function sealReasoning(
  input: DecoderInput,
  work: Work,
  thinkingId: BlockId | null,
): Refusal | null {
  const codec = input.hooks.reasoning
  const { details } = work.phase
  if (codec === null || details.length === 0) return null
  const sealed = codec.seal(hookDetails(details))
  if (!('ok' in sealed)) return { fault: sealed.failure }
  for (const { payload } of sealed.ok) {
    if (payload.length === 0) continue
    if (payload.length > REASONING_STATE_PAYLOAD_MAX_LENGTH) {
      work.facts.push(
        diagnosticFact({
          kind: 'reasoning-state-dropped',
          reason: 'payload-too-long',
          length: payload.length,
        }),
      )
      continue
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
        pairs: thinkingId === null ? [] : [thinkingId],
      },
    })
  }
  return null
}

// --- tail ------------------------------------------------------------------------------------

/**
 * A frame after the finish chunk: at most `usageTail.maxFrames` of them. Each may carry usage and
 * may repeat the same finish with an empty delta; content or another finish is a protocol fault.
 */
function tail(record: ChatCompletionsRecord, phase: Finished, chunk: Chunk): StepResult {
  const count = phase.tail + 1
  if (count > record.wire.usageTail.maxFrames) return protocol('usage-tail-too-long')
  const choice = chunk.choice
  if (choice !== null) {
    if (!isEmptyDelta(choice.delta)) return protocol('content-after-finish')
    if (choice.finish !== null && choice.finish !== phase.finish) return protocol('finish-changed')
  }
  return {
    phase: { ...phase, tail: count, usage: chunk.usage ?? phase.usage },
    facts: [],
  }
}

function isEmptyDelta(delta: Delta): boolean {
  return (
    delta.content === null &&
    delta.refusal === null &&
    delta.reasoning === null &&
    delta.details.length === 0 &&
    delta.toolCalls.length === 0
  )
}

// --- values ----------------------------------------------------------------------------------

/** The identity of the block at `index`. Unique inside the reply of one dispatch. */
function blockId(index: string): BlockId {
  const judged = judgeBlockIdentity({ id: `b${index}`, visibility: SHOWN })
  if ('rejected' in judged) throw new Error(`block identity b${index} was refused`)
  return judged.ok.id
}

function diagnosticFact(value: ProviderDiagnostic): TransportFact {
  return { kind: 'diagnostic', value }
}

/**
 * The cost of the account: the gateway `usage.cost` as supplier cost when it is a plain decimal,
 * unknown when it is reported in another form, and no item when the usage has no cost.
 */
function costOf(usage: GatewayUsage | null): CallAccountReport['cost'] {
  const cost = usage?.raw['cost']
  if (cost === undefined || cost.kind === 'null') return []
  if (cost.kind === 'number' && COST_LEXEME.test(cost.lexeme))
    return [{ state: 'known', lexeme: cost.lexeme, unit: COST_UNIT, source: 'supplier' }]
  return [{ state: 'unknown', unit: COST_UNIT, source: 'supplier' }]
}

function protocol(diagnostic: string): Refusal {
  return { fault: { cause: 'upstream-protocol', diagnostic, upstreamStatus: null } }
}
