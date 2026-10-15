import {
  judgeMessage,
  judgePart,
  type LogMessageRole,
  type Message,
  type MessageId,
  type MessagePart,
} from '@omne-harness/message'

export const STREAM_ARRIVAL_STEPS = ['open', 'fill', 'close', 'trim', 'finish'] as const

export type StreamArrivalStep = (typeof STREAM_ARRIVAL_STEPS)[number]

export interface StreamArrival {
  readonly step: StreamArrivalStep
  readonly index: string
}

export type StreamArrivalJudgment =
  { readonly ok: StreamArrival } | { readonly rejected: 'step' | 'index' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** JSON is null, a boolean, a string, a finite number, or an array or plain object of those. */
function isJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (value === null) return true
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true
    case 'number':
      return Number.isFinite(value)
    case 'object':
      return jsonContainer(value, seen)
    default:
      return false
  }
}

function jsonContainer(value: object, seen: WeakSet<object>): boolean {
  if (seen.has(value)) return false
  if (Array.isArray(value)) return jsonItems(value, seen)
  if (!isPlainRecord(value)) return false
  seen.add(value)
  for (const key of Object.keys(value)) {
    if (!isJsonValue(value[key], seen)) {
      seen.delete(value)
      return false
    }
  }
  seen.delete(value)
  return true
}

function jsonItems(value: readonly unknown[], seen: WeakSet<object>): boolean {
  seen.add(value)
  for (const item of value) {
    if (!isJsonValue(item, seen)) {
      seen.delete(value)
      return false
    }
  }
  seen.delete(value)
  return true
}

/** Own enumerable keys only. `__proto__` is a data property, not a prototype assignment. */
function copyJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => copyJson(item))
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: copyJson((value as Record<string, unknown>)[key]),
      writable: true,
      enumerable: true,
      configurable: true,
    })
  }
  return copy
}

/** Admit one streaming-delivery step. Cordis dispatch and inbound intake are not steps. */
export function judgeStreamArrival(value: unknown): StreamArrivalJudgment {
  if (!isRecord(value) || typeof value.step !== 'string') return { rejected: 'step' }
  if (!STREAM_ARRIVAL_STEPS.includes(value.step as StreamArrivalStep)) return { rejected: 'step' }
  if (typeof value.index !== 'string' || value.index.length === 0) return { rejected: 'index' }
  return { ok: { step: value.step as StreamArrivalStep, index: value.index } }
}

export interface AssemblyTarget {
  readonly id: MessageId
  readonly role: LogMessageRole
}

export type StreamEnd =
  | { readonly kind: 'stopped' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'cancelled' }

export interface TrimRecord {
  readonly index: string
  readonly removed: string
  readonly reason: string
}

export type StreamTerminal =
  | { readonly kind: 'complete'; readonly message: Message; readonly trims: readonly TrimRecord[] }
  | {
      readonly kind: 'truncated'
      readonly blocks: readonly MessagePart[]
      readonly trims: readonly TrimRecord[]
    }
  | {
      readonly kind: 'failed'
      readonly reason: string
      readonly blocks: readonly MessagePart[]
      readonly trims: readonly TrimRecord[]
    }
  | {
      readonly kind: 'cancelled'
      readonly blocks: readonly MessagePart[]
      readonly trims: readonly TrimRecord[]
    }

/** Callers see `live`, or `ended` with a terminal. Continuation state is not part of this type. */
export type StreamAssembly =
  { readonly phase: 'live' } | { readonly phase: 'ended'; readonly terminal: StreamTerminal }

export interface AssembleInput {
  readonly target: AssemblyTarget
  /** A prior result. Omitted starts a live assembly. */
  readonly from?: StreamAssembly
  readonly steps: readonly unknown[]
  /** Applied after `steps`. Not a stream step. Observer disconnect is not an input. */
  readonly end?: StreamEnd
}

export type AssemblyRejection =
  | 'step'
  | 'index'
  | 'mode'
  | 'open'
  | 'unopened'
  | 'closed'
  | 'seq'
  | 'conflict'
  | 'block'
  | 'empty'
  | 'late'
  | 'json'

export type AssembleResult =
  | { readonly ok: StreamAssembly }
  | {
      readonly rejected: AssemblyRejection
      readonly detail?: string
      readonly at: number
      readonly assembly: StreamAssembly
    }

const DECIMAL = /^(0|[1-9][0-9]*)$/u
const LEXEME = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/u
const PART_KINDS = [
  'text',
  'thinking',
  'voice',
  'image',
  'file',
  'tool_call',
  'tool_result',
] as const
const STEP_KEYS: Readonly<Record<StreamArrivalStep, readonly string[]>> = {
  open: ['step', 'index', 'mode', 'head'],
  fill: ['step', 'index', 'seq', 'chunk'],
  close: ['step', 'index', 'block'],
  trim: ['step', 'index', 'removed', 'reason'],
  finish: ['step', 'index'],
}

type PartKind = (typeof PART_KINDS)[number]
type AppendKind = 'text' | 'thinking' | 'voice' | 'tool_call'

/** Body field for a fill. Image, file, and tool_result have no append form. */
const BODY: Readonly<Record<PartKind, { readonly field?: 'text' | 'inline' | 'arguments' }>> = {
  text: { field: 'text' },
  thinking: { field: 'text' },
  voice: { field: 'inline' },
  image: { field: 'inline' },
  file: {},
  tool_call: { field: 'arguments' },
  tool_result: {},
}

type OpenBlock =
  | {
      readonly slot: 'open'
      readonly mode: 'append'
      readonly index: number
      readonly kind: AppendKind
      readonly head: Readonly<Record<string, unknown>>
      readonly body: string
      readonly nextSeq: number
    }
  | {
      readonly slot: 'open'
      readonly mode: 'replace'
      readonly index: number
      readonly kind: PartKind
      readonly head: Readonly<Record<string, unknown>>
      readonly body: string
      readonly nextSeq: number
    }

interface ClosedBlock {
  readonly slot: 'closed'
  readonly index: number
  readonly part: MessagePart
}

type LiveBlock = OpenBlock | ClosedBlock

interface LiveState {
  readonly phase: 'live'
  readonly target: AssemblyTarget
  readonly blocks: readonly LiveBlock[]
  readonly trims: readonly TrimRecord[]
  readonly nextIndex: number
  readonly ledger: ReadonlyMap<string, string>
}

interface EndedState {
  readonly phase: 'ended'
  readonly target: AssemblyTarget
  readonly terminal: StreamTerminal
  readonly ledger: ReadonlyMap<string, string>
}

type InternalState = LiveState | EndedState

interface OpenStep {
  readonly step: 'open'
  readonly index: string
  readonly mode: 'append' | 'replace'
  readonly head: Readonly<Record<string, unknown>>
}

interface FillStep {
  readonly step: 'fill'
  readonly index: string
  readonly seq: string
  readonly chunk: string
}

interface CloseStep {
  readonly step: 'close'
  readonly index: string
  /** Present means this JSON value is the sealed part. Absent seals the fragments. */
  readonly block?: unknown
}

interface TrimStep {
  readonly step: 'trim'
  readonly index: string
  readonly removed: string
  readonly reason: string
}

interface FinishStep {
  readonly step: 'finish'
  readonly index: string
}

type AssemblyStep = OpenStep | FillStep | CloseStep | TrimStep | FinishStep

type Parsed =
  { readonly step: AssemblyStep } | { readonly rejected: 'step' | 'index' | 'seq' | 'json' }

type Applied =
  | { readonly state: InternalState }
  | { readonly rejected: AssemblyRejection; readonly detail?: string }

/**
 * Ledger and open blocks stay off the public value. A later `from` still finds them.
 * `ended` keeps the ledger and drops open drafts.
 */
const CONTINUATION: unique symbol = Symbol('stream-assembly-continuation')

function carried(assembly: StreamAssembly): InternalState | undefined {
  return (assembly as { readonly [CONTINUATION]?: InternalState })[CONTINUATION]
}

function publish(state: InternalState): StreamAssembly {
  const pub =
    state.phase === 'ended'
      ? { phase: 'ended' as const, terminal: state.terminal }
      : { phase: 'live' as const }
  Object.defineProperty(pub, CONTINUATION, { value: state })
  return pub
}

function reject(
  rejected: AssemblyRejection,
  at: number,
  assembly: StreamAssembly,
  detail?: string,
): AssembleResult {
  if (detail === undefined) return { rejected, at, assembly }
  return { rejected, detail, at, assembly }
}

function isPartKind(kind: string): kind is PartKind {
  return (PART_KINDS as readonly string[]).includes(kind)
}

/** Append image, file, and tool_result cannot be constructed. */
function appendKind(kind: PartKind): AppendKind | undefined {
  switch (kind) {
    case 'text':
    case 'thinking':
    case 'voice':
    case 'tool_call':
      return kind
    case 'image':
    case 'file':
    case 'tool_result':
      return undefined
  }
}

function hasUnknownKey(value: Record<string, unknown>, legal: readonly string[]): boolean {
  const allowed = new Set<string>(legal)
  return Object.keys(value).some(key => !allowed.has(key))
}

function stable(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(item => stable(item)).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function decimalIndex(index: string): number | undefined {
  if (!DECIMAL.test(index)) return undefined
  const value = Number(index)
  if (!Number.isSafeInteger(value)) return undefined
  return value
}

function admitTarget(target: AssemblyTarget): AssemblyTarget {
  return { id: target.id, role: target.role }
}

function fresh(target: AssemblyTarget): LiveState {
  return {
    phase: 'live',
    target: admitTarget(target),
    blocks: [],
    trims: [],
    nextIndex: 0,
    ledger: new Map(),
  }
}

function remember(state: InternalState, key: string, fp: string): InternalState {
  const ledger = new Map(state.ledger)
  ledger.set(key, fp)
  return { ...state, ledger }
}

function stepKey(step: AssemblyStep): string {
  switch (step.step) {
    case 'open':
      return `open:${step.index}`
    case 'fill':
      return `fill:${step.index}:${step.seq}`
    case 'close':
      return `close:${step.index}`
    case 'trim':
      return `trim:${step.index}`
    case 'finish':
      return 'finish'
  }
}

function parseStep(value: unknown): Parsed {
  const admitted = judgeStreamArrival(value)
  if ('rejected' in admitted) return { rejected: admitted.rejected }
  if (!isRecord(value)) return { rejected: 'step' }
  const name = admitted.ok.step
  if (hasUnknownKey(value, STEP_KEYS[name])) return { rejected: 'step' }
  const index = admitted.ok.index
  if (decimalIndex(index) === undefined) return { rejected: 'index' }
  if (name === 'close') return parseClose(value, index)
  if (name === 'finish') return { step: { step: name, index } }
  if (name === 'open') return parseOpen(value, index)
  if (name === 'fill') return parseFill(value, index)
  return parseTrim(value, index)
}

function parseOpen(value: Record<string, unknown>, index: string): Parsed {
  if (value.mode !== 'append' && value.mode !== 'replace') return { rejected: 'step' }
  if (!isJsonValue(value.head)) return { rejected: 'json' }
  if (!isPlainRecord(value.head)) return { rejected: 'step' }
  const head = copyJson(value.head)
  if (!isPlainRecord(head)) return { rejected: 'json' }
  return { step: { step: 'open', index, mode: value.mode, head } }
}

function parseClose(value: Record<string, unknown>, index: string): Parsed {
  if (!Object.hasOwn(value, 'block')) return { step: { step: 'close', index } }
  if (!isJsonValue(value.block)) return { rejected: 'json' }
  return { step: { step: 'close', index, block: copyJson(value.block) } }
}

function parseFill(value: Record<string, unknown>, index: string): Parsed {
  if (typeof value.seq !== 'string' || !DECIMAL.test(value.seq)) return { rejected: 'seq' }
  if (typeof value.chunk !== 'string') return { rejected: 'step' }
  return { step: { step: 'fill', index, seq: value.seq, chunk: value.chunk } }
}

function parseTrim(value: Record<string, unknown>, index: string): Parsed {
  if (typeof value.removed !== 'string' || !LEXEME.test(value.removed)) return { rejected: 'step' }
  if (typeof value.reason !== 'string' || value.reason.length === 0) return { rejected: 'step' }
  return {
    step: { step: 'trim', index, removed: value.removed, reason: value.reason },
  }
}

function isStreamEnd(value: unknown): value is StreamEnd {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  if (value.kind === 'stopped' || value.kind === 'cancelled') return keys.length === 1
  return (
    value.kind === 'failed' &&
    keys.length === 2 &&
    typeof value.reason === 'string' &&
    value.reason.length > 0
  )
}

function blockAt(state: LiveState, index: string): LiveBlock | undefined {
  const parsed = decimalIndex(index)
  if (parsed === undefined) return undefined
  return state.blocks.find(block => block.index === parsed)
}

function replaceBlock(blocks: readonly LiveBlock[], next: LiveBlock): readonly LiveBlock[] {
  return blocks.map(block => (block.index === next.index ? next : block))
}

function closedParts(state: LiveState): readonly MessagePart[] {
  return state.blocks.flatMap(block => (block.slot === 'closed' ? [block.part] : []))
}

function applyOpen(state: LiveState, step: OpenStep): Applied {
  const index = decimalIndex(step.index)
  if (index === undefined || index < state.nextIndex) return { rejected: 'index' }
  const kind = step.head.kind
  if (typeof kind !== 'string' || !isPartKind(kind)) return { rejected: 'step' }
  const field = BODY[kind].field
  if (field !== undefined && Object.hasOwn(step.head, field)) return { rejected: 'step' }
  if (step.mode === 'append') {
    const append = appendKind(kind)
    if (append === undefined) return { rejected: 'mode' }
    const block: OpenBlock = {
      slot: 'open',
      mode: 'append',
      index,
      kind: append,
      head: step.head,
      body: '',
      nextSeq: 0,
    }
    return {
      state: { ...state, blocks: [...state.blocks, block], nextIndex: index + 1 },
    }
  }
  const block: OpenBlock = {
    slot: 'open',
    mode: 'replace',
    index,
    kind,
    head: step.head,
    body: '',
    nextSeq: 0,
  }
  return { state: { ...state, blocks: [...state.blocks, block], nextIndex: index + 1 } }
}

function applyFill(state: LiveState, step: FillStep): Applied {
  const block = blockAt(state, step.index)
  if (block === undefined) return { rejected: 'unopened' }
  if (block.slot !== 'open') return { rejected: 'closed' }
  const field = BODY[block.kind].field
  if (field === undefined) return { rejected: 'mode' }
  if (step.seq !== String(block.nextSeq)) return { rejected: 'seq' }
  const body = block.mode === 'append' ? block.body + step.chunk : step.chunk
  const next: OpenBlock = { ...block, body, nextSeq: block.nextSeq + 1 }
  return { state: { ...state, blocks: replaceBlock(state.blocks, next) } }
}

function bodyConflicts(block: OpenBlock, sealed: MessagePart): boolean {
  const field = BODY[block.kind].field
  if (field !== 'text' && field !== 'inline') return false
  const record = sealed as unknown as Record<string, unknown>
  return record[field] !== block.body
}

function seal(state: LiveState, index: number, candidate: unknown, open: OpenBlock): Applied {
  const judged = judgePart(candidate)
  if ('rejected' in judged) return { rejected: 'block', detail: judged.rejected }
  if (bodyConflicts(open, judged.ok)) return { rejected: 'conflict' }
  const closed: ClosedBlock = { slot: 'closed', index, part: judged.ok }
  return { state: { ...state, blocks: replaceBlock(state.blocks, closed) } }
}

function applyClose(state: LiveState, step: CloseStep): Applied {
  const block = blockAt(state, step.index)
  if (block === undefined) return { rejected: 'unopened' }
  if (block.slot !== 'open') return { rejected: 'closed' }
  if (step.block !== undefined) return seal(state, block.index, step.block, block)
  const field = BODY[block.kind].field
  const head = copyJson(block.head) as Record<string, unknown>
  const candidate = field === undefined ? head : { ...head, [field]: block.body }
  return seal(state, block.index, candidate, block)
}

function applyTrim(state: LiveState, step: TrimStep): Applied {
  if (blockAt(state, step.index) === undefined) return { rejected: 'unopened' }
  const record: TrimRecord = { index: step.index, removed: step.removed, reason: step.reason }
  return { state: { ...state, trims: [...state.trims, record] } }
}

function applyFinish(state: LiveState): Applied {
  if (state.blocks.some(block => block.slot === 'open')) return { rejected: 'open' }
  const blocks = closedParts(state)
  if (blocks.length === 0) return { rejected: 'empty' }
  const judged = judgeMessage({ id: state.target.id, role: state.target.role, blocks })
  if ('rejected' in judged) {
    if (judged.rejected === 'empty') return { rejected: 'empty' }
    return { rejected: 'block', detail: judged.rejected }
  }
  return {
    state: {
      phase: 'ended',
      target: state.target,
      terminal: { kind: 'complete', message: judged.ok, trims: state.trims },
      ledger: state.ledger,
    },
  }
}

/** One step table. `assembleStream` does not switch on the step name. */
const APPLY: Readonly<
  Record<StreamArrivalStep, (state: LiveState, step: AssemblyStep) => Applied>
> = {
  open: (state, step) => (step.step === 'open' ? applyOpen(state, step) : { rejected: 'step' }),
  fill: (state, step) => (step.step === 'fill' ? applyFill(state, step) : { rejected: 'step' }),
  close: (state, step) => (step.step === 'close' ? applyClose(state, step) : { rejected: 'step' }),
  trim: (state, step) => (step.step === 'trim' ? applyTrim(state, step) : { rejected: 'step' }),
  finish: (state, step) => (step.step === 'finish' ? applyFinish(state) : { rejected: 'step' }),
}

function applyLive(state: LiveState, step: AssemblyStep): Applied {
  return APPLY[step.step](state, step)
}

function settle(state: LiveState, end: StreamEnd): Applied {
  const blocks = closedParts(state)
  const trims = state.trims
  const terminal: StreamTerminal =
    end.kind === 'stopped'
      ? { kind: 'truncated', blocks, trims }
      : end.kind === 'failed'
        ? { kind: 'failed', reason: end.reason, blocks, trims }
        : { kind: 'cancelled', blocks, trims }
  return {
    state: { phase: 'ended', target: state.target, terminal, ledger: state.ledger },
  }
}

function sameTarget(left: AssemblyTarget, right: AssemblyTarget): boolean {
  return left.id === right.id && left.role === right.role
}

interface Fold {
  readonly state: InternalState
  readonly published: StreamAssembly
}

type Folded = { readonly fold: Fold }

function resume(input: AssembleInput): Folded | AssembleResult {
  if (input.from === undefined) {
    const state = fresh(input.target)
    return { fold: { state, published: publish(state) } }
  }
  const existing = carried(input.from)
  if (existing === undefined) return reject('step', 0, input.from, 'from')
  if (!sameTarget(existing.target, input.target)) return reject('step', 0, input.from, 'target')
  return { fold: { state: existing, published: input.from } }
}

function takeStep(fold: Fold, value: unknown, at: number): Folded | AssembleResult {
  const parsed = parseStep(value)
  if ('rejected' in parsed) return reject(parsed.rejected, at, fold.published)
  const key = stepKey(parsed.step)
  const fp = stable(parsed.step)
  const seen = fold.state.ledger.get(key)
  if (seen !== undefined) {
    if (seen === fp) return { fold }
    return reject(parsed.step.step === 'open' ? 'index' : 'conflict', at, fold.published)
  }
  if (fold.state.phase === 'ended') return reject('late', at, fold.published)
  const applied = applyLive(fold.state, parsed.step)
  if ('rejected' in applied) return reject(applied.rejected, at, fold.published, applied.detail)
  const state = remember(applied.state, key, fp)
  return { fold: { state, published: publish(state) } }
}

function takeEnd(fold: Fold, end: StreamEnd | undefined, at: number): AssembleResult {
  if (end === undefined) return { ok: fold.published }
  if (!isStreamEnd(end)) return reject('step', at, fold.published)
  const endFp = stable(end)
  const seenEnd = fold.state.ledger.get('end')
  if (seenEnd !== undefined) {
    if (seenEnd === endFp) return { ok: fold.published }
    return reject('conflict', at, fold.published)
  }
  if (fold.state.phase === 'ended') return reject('late', at, fold.published)
  const settled = settle(fold.state, end)
  if ('rejected' in settled) return reject(settled.rejected, at, fold.published, settled.detail)
  return { ok: publish(remember(settled.state, 'end', endFp)) }
}

/** Pure fold of one target. A novel step after a terminal returns `late` and the previous assembly. */
export function assembleStream(input: AssembleInput): AssembleResult {
  const started = resume(input)
  if (!('fold' in started)) return started
  let fold = started.fold
  for (let at = 0; at < input.steps.length; at += 1) {
    const next = takeStep(fold, input.steps[at], at)
    if (!('fold' in next)) return next
    fold = next.fold
  }
  return takeEnd(fold, input.end, input.steps.length)
}
