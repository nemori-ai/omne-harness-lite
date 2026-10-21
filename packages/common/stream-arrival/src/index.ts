import {
  CONTENT_BLOCK_HEAD_KEYS,
  judgeBlockIdentity,
  type BlockId,
  type Visibility,
} from '@omne-harness/content-block'
import { writeJsonText } from '@omne-harness/json-text'
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
  | { readonly ok: StreamArrival }
  | { readonly rejected: 'step' | 'index' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** True when a getter, a setter, or a non-enumerable key would hide what a read does. */
function hasUnreadableOwn(value: object): boolean {
  return Object.getOwnPropertyNames(value).some(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)
  })
}

/** Admit one streaming-delivery step. Cordis dispatch and inbound intake are not steps. */
function isStep(step: string): step is StreamArrivalStep {
  return STREAM_ARRIVAL_STEPS.some(known => known === step)
}

export function judgeStreamArrival(value: unknown): StreamArrivalJudgment {
  if (!isRecord(value) || typeof value.step !== 'string') return { rejected: 'step' }
  if (!isStep(value.step)) return { rejected: 'step' }
  if (typeof value.index !== 'string' || value.index.length === 0) return { rejected: 'index' }
  return { ok: { step: value.step, index: value.index } }
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
  | { readonly phase: 'live' }
  | { readonly phase: 'ended'; readonly terminal: StreamTerminal }

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
  'reasoning_state',
] as const
const STEP_KEYS: Readonly<Record<StreamArrivalStep, readonly string[]>> = {
  open: ['step', 'index', 'mode', 'head'],
  fill: ['step', 'index', 'seq', 'chunk'],
  close: ['step', 'index', 'block'],
  trim: ['step', 'index', 'removed', 'reason'],
  finish: ['step', 'index', 'replay'],
}

type PartKind = (typeof PART_KINDS)[number]
type AppendKind = 'text' | 'thinking' | 'voice' | 'tool_call'

/**
 * Body field for a fill. Image, file, tool_result, and reasoning_state have no append form. The `arguments` field of
 * `tool_call` only exists to refuse a head that carries arguments: an implicit close of a
 * `tool_call` is always refused, because the accumulated text is not a value tree.
 */
const BODY: Readonly<Record<PartKind, { readonly field?: 'text' | 'inline' | 'arguments' }>> = {
  text: { field: 'text' },
  thinking: { field: 'text' },
  voice: { field: 'inline' },
  image: { field: 'inline' },
  file: {},
  tool_call: { field: 'arguments' },
  tool_result: {},
  reasoning_state: {},
}

/**
 * The admitted head of a block. `rest` holds the head keys that carry text: `callId`, `name`,
 * `mediaType`, `storage` and `key`, whichever the kind has.
 */
interface Head {
  readonly kind: PartKind
  readonly id: BlockId
  readonly visibility: Visibility
  readonly rest: Readonly<Record<string, string>>
}

type OpenBlock =
  | {
      readonly slot: 'open'
      readonly mode: 'append'
      readonly index: number
      readonly kind: AppendKind
      readonly head: Head
      readonly body: string
      readonly nextSeq: number
    }
  | {
      readonly slot: 'open'
      readonly mode: 'replace'
      readonly index: number
      readonly kind: PartKind
      readonly head: Head
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
  readonly head: Head
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
  /** Present means this judged part is the sealed part. Absent seals the fragments. */
  readonly block?: MessagePart
}

interface TrimStep {
  readonly step: 'trim'
  readonly index: string
  readonly removed: string
  readonly reason: string
}

/** The replay scope and format that a `finish` brings. The assembly writes `at` itself. */
interface ReplayRange {
  readonly scope: string
  readonly format: string
}

interface FinishStep {
  readonly step: 'finish'
  readonly index: string
  /** Present only when the step carries it. An absent key is never an own `undefined`. */
  readonly replay?: ReplayRange
}

type AssemblyStep = OpenStep | FillStep | CloseStep | TrimStep | FinishStep

type Parsed =
  | { readonly step: AssemblyStep }
  | {
      readonly rejected: 'step' | 'index' | 'seq' | 'block'
      readonly detail?: string
    }

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

/** Append image, file, tool_result, and reasoning_state cannot be constructed. */
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
    case 'reasoning_state':
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

/**
 * The fingerprint of a step. `stable` only sees values that hold no value tree. The arguments of a
 * `tool_call` are held as the text `writeJsonText` writes for them, whose walk keeps its own stack.
 */
function fingerprint(step: AssemblyStep): string {
  if (step.step !== 'close' || step.block === undefined) return stable(step)
  const { block } = step
  if (block.kind !== 'tool_call') return stable(step)
  return stable({ ...step, block: { ...block, arguments: writeJsonText(block.arguments) } })
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
  if (name === 'finish') return parseFinish(value, index)
  if (name === 'open') return parseOpen(value, index)
  if (name === 'fill') return parseFill(value, index)
  return parseTrim(value, index)
}

type HeadRefusal = { readonly rejected: 'step'; readonly detail: string }

function refuse(detail: string): HeadRefusal {
  return { rejected: 'step', detail }
}

/** The head keys of each kind. A tool kind needs all of its keys. A content kind may carry its own. */
const TOOL_HEAD_KEYS: Readonly<Record<'tool_call' | 'tool_result', readonly string[]>> = {
  tool_call: ['kind', 'id', 'visibility', 'callId', 'name'],
  tool_result: ['kind', 'id', 'visibility', 'callId'],
}

/** A reasoning state head has the identity keys only. `payload` and `pairs` arrive in the close. */
const REASONING_STATE_HEAD_KEYS: readonly string[] = ['kind', 'id', 'visibility']

function headKeysOf(kind: PartKind): readonly string[] {
  if (kind === 'tool_call' || kind === 'tool_result') return TOOL_HEAD_KEYS[kind]
  if (kind === 'reasoning_state') return REASONING_STATE_HEAD_KEYS
  return CONTENT_BLOCK_HEAD_KEYS[kind]
}

function isToolHeadKind(kind: PartKind): boolean {
  return kind === 'tool_call' || kind === 'tool_result'
}

/** The head keys that `judgeBlockIdentity` judges. `headText` reads every other head key. */
const IDENTITY_KEYS: readonly string[] = ['kind', 'id', 'visibility']

type HeadTextRead = { readonly text: string | undefined } | HeadRefusal

/** One text key of a head. A content head may leave it out; a tool head may not. */
function headTextOf(kind: PartKind, value: Record<string, unknown>, key: string): HeadTextRead {
  const text = value[key]
  if (typeof text === 'string')
    return key === 'callId' && text.length === 0 ? refuse(key) : { text }
  if (Object.hasOwn(value, key) || isToolHeadKind(kind)) return refuse(key)
  return { text: undefined }
}

/** The text-valued head keys. A tool head must have them, and `callId` is not empty. */
function headText(
  kind: PartKind,
  value: Record<string, unknown>,
): { readonly ok: Readonly<Record<string, string>> } | HeadRefusal {
  const rest: Record<string, string> = {}
  for (const key of headKeysOf(kind)) {
    if (IDENTITY_KEYS.includes(key)) continue
    const read = headTextOf(kind, value, key)
    if ('rejected' in read) return read
    if (read.text !== undefined) rest[key] = read.text
  }
  return { ok: rest }
}

/**
 * A head is judged before anything is copied or fingerprinted: the keys must be closed, and
 * every value is text except `visibility`, which `judgeBlockIdentity` rebuilds. A deep value
 * under any key is refused at the key, and no walk reaches it.
 */
function judgeHead(value: unknown): { readonly ok: Head } | HeadRefusal {
  if (!isPlainRecord(value) || hasUnreadableOwn(value)) return refuse('json')
  const kind = value.kind
  if (typeof kind !== 'string' || !isPartKind(kind)) return refuse('kind')
  const legal = headKeysOf(kind)
  if (Object.keys(value).some(key => !legal.includes(key))) return refuse('extra')
  const identity = judgeBlockIdentity(value)
  if ('rejected' in identity) return refuse(identity.rejected)
  const rest = headText(kind, value)
  if ('rejected' in rest) return rest
  return { ok: { kind, id: identity.ok.id, visibility: identity.ok.visibility, rest: rest.ok } }
}

function parseOpen(value: Record<string, unknown>, index: string): Parsed {
  if (value.mode !== 'append' && value.mode !== 'replace') return { rejected: 'step' }
  const head = judgeHead(value.head)
  if ('rejected' in head) return head
  return { step: { step: 'open', index, mode: value.mode, head: head.ok } }
}

function parseClose(value: Record<string, unknown>, index: string): Parsed {
  if (!Object.hasOwn(value, 'block')) return { step: { step: 'close', index } }
  const part = judgePart(value.block)
  if ('rejected' in part) return { rejected: 'block', detail: part.rejected }
  return { step: { step: 'close', index, block: part.ok } }
}

const REPLAY_KEYS: readonly string[] = ['scope', 'format']

/**
 * The `replay` of a `finish`: a plain object with exactly `scope` and `format`, both text. Whether
 * the text is empty or too long is `judgeMessage`'s rule, so it is judged when the message is made.
 */
function parseReplay(raw: unknown): ReplayRange | undefined {
  if (!isPlainRecord(raw) || hasUnreadableOwn(raw)) return undefined
  const keys = Object.keys(raw)
  if (keys.length !== REPLAY_KEYS.length || hasUnknownKey(raw, REPLAY_KEYS)) return undefined
  const { scope, format } = raw
  if (typeof scope !== 'string' || typeof format !== 'string') return undefined
  return { scope, format }
}

/** A `replay` of `undefined` is no replay, the same as `judgeMessage` reads it. */
function parseFinish(value: Record<string, unknown>, index: string): Parsed {
  if (!Object.hasOwn(value, 'replay') || value.replay === undefined)
    return { step: { step: 'finish', index } }
  const replay = parseReplay(value.replay)
  if (replay === undefined) return refuse('replay')
  return { step: { step: 'finish', index, replay } }
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

function fieldsOf(part: MessagePart): ReadonlyMap<string, unknown> {
  return new Map(Object.entries(part))
}

/** The sealed part carries the head: the same identity, the same visibility, the same text keys. */
function sameHead(head: Head, part: MessagePart): boolean {
  if (part.id !== head.id) return false
  if (part.visibility.toHuman !== head.visibility.toHuman) return false
  if (part.visibility.toModel !== head.visibility.toModel) return false
  const fields = fieldsOf(part)
  return Object.entries(head.rest).every(([key, text]) => fields.get(key) === text)
}

/**
 * The accumulated text must be what the part holds. A `tool_call` part holds a value tree, not
 * the text, so its `arguments` are not compared. The text of an unparsed call is `raw`.
 */
function bodyConflicts(block: OpenBlock, sealed: MessagePart): boolean {
  if (
    block.mode === 'replace' &&
    block.nextSeq === 0 &&
    (sealed.kind === 'image' || sealed.kind === 'voice' || sealed.kind === 'file')
  )
    return false
  if (sealed.kind === 'tool_call_unparsed') return sealed.raw !== block.body
  const field = BODY[block.kind].field
  if (field !== 'text' && field !== 'inline') return false
  return fieldsOf(sealed).get(field) !== block.body
}

function hasTrim(state: LiveState, block: OpenBlock): boolean {
  return state.trims.some(trim => decimalIndex(trim.index) === block.index)
}

/**
 * A `tool_call` head is sealed as a `tool_call`, or as a `tool_call_unparsed`, which is the one
 * exception to equal kinds. A `tool_call_incomplete` is never sealed: the settling side builds
 * it after the stream. A `tool_call` block with a trim record is never sealed either: the text
 * left may decode, and that does not show that the model had finished.
 */
function sealRefusal(
  state: LiveState,
  block: OpenBlock,
  part: MessagePart,
): { readonly rejected: AssemblyRejection; readonly detail?: string } | undefined {
  const call = block.head.kind === 'tool_call'
  if (call && part.kind === 'tool_call_incomplete')
    return { rejected: 'block', detail: 'incomplete' }
  if (part.kind !== block.head.kind && !(call && part.kind === 'tool_call_unparsed')) {
    return { rejected: 'conflict' }
  }
  if (call && hasTrim(state, block)) return { rejected: 'block', detail: 'trimmed' }
  if (!sameHead(block.head, part) || bodyConflicts(block, part)) return { rejected: 'conflict' }
  return undefined
}

function seal(state: LiveState, block: OpenBlock, part: MessagePart): Applied {
  const refusal = sealRefusal(state, block, part)
  if (refusal !== undefined) return refusal
  const closed: ClosedBlock = { slot: 'closed', index: block.index, part }
  return { state: { ...state, blocks: replaceBlock(state.blocks, closed) } }
}

/** The part that the head and the fragments make, for a close that has no block. */
function fragmentsOf(block: OpenBlock): Readonly<Record<string, unknown>> {
  const { head } = block
  const base = { kind: head.kind, id: head.id, visibility: { ...head.visibility }, ...head.rest }
  const field = BODY[block.kind].field
  return field === undefined ? base : { ...base, [field]: block.body }
}

function applyClose(state: LiveState, step: CloseStep): Applied {
  const block = blockAt(state, step.index)
  if (block === undefined) return { rejected: 'unopened' }
  if (block.slot !== 'open') return { rejected: 'closed' }
  if (step.block !== undefined) return seal(state, block, step.block)
  const judged = judgePart(fragmentsOf(block))
  if ('rejected' in judged) return { rejected: 'block', detail: judged.rejected }
  return seal(state, block, judged.ok)
}

function applyTrim(state: LiveState, step: TrimStep): Applied {
  const block = blockAt(state, step.index)
  if (block === undefined) return { rejected: 'unopened' }
  if (block.slot !== 'open') return { rejected: 'closed' }
  const record: TrimRecord = { index: step.index, removed: step.removed, reason: step.reason }
  return { state: { ...state, trims: [...state.trims, record] } }
}

/** The positions of the reasoning state parts among the sealed parts, in order. */
function reasoningStateAt(blocks: readonly MessagePart[]): readonly number[] {
  return blocks.flatMap((part, at) => (part.kind === 'reasoning_state' ? [at] : []))
}

/** The message input for `judgeMessage`. `replay` is in it only when the `finish` carried it. */
function messageInput(state: LiveState, blocks: readonly MessagePart[], step: FinishStep) {
  const { id, role } = state.target
  if (step.replay === undefined) return { id, role, blocks }
  const { scope, format } = step.replay
  return { id, role, blocks, replay: { scope, format, at: reasoningStateAt(blocks) } }
}

function applyFinish(state: LiveState, step: FinishStep): Applied {
  if (state.blocks.some(block => block.slot === 'open')) return { rejected: 'open' }
  const blocks = closedParts(state)
  if (blocks.length === 0) return { rejected: 'empty' }
  const judged = judgeMessage(messageInput(state, blocks, step))
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
  finish: (state, step) =>
    step.step === 'finish' ? applyFinish(state, step) : { rejected: 'step' },
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
  if ('rejected' in parsed) return reject(parsed.rejected, at, fold.published, parsed.detail)
  const key = stepKey(parsed.step)
  const fp = fingerprint(parsed.step)
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
