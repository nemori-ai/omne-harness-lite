import type { RecordEntryRef } from './compaction-shape.ts'
import {
  isCompactionMessage,
  judgeMessage,
  type CompactionMessage,
  type Message,
} from './message.ts'

/** One entry of the compacted range, in log order. `message` is null for an entry that carries no message. */
export type CoveredEntry = Readonly<{ ref: RecordEntryRef; message: Message | null }>

export type CompactionContext = Readonly<{
  covered: readonly CoveredEntry[]
  after: readonly Message[]
  open: readonly RecordEntryRef[]
}>

export type CompactionRejection =
  | 'message'
  | 'range'
  | 'retained-outside'
  | 'retained-order'
  | 'retained-not-model'
  | 'pairing'
  | 'open-work'

export type CompactionJudgment =
  | Readonly<{ ok: CompactionMessage }>
  | Readonly<{ rejected: CompactionRejection; ref: RecordEntryRef | null }>

type Failure = Extract<CompactionJudgment, { rejected: CompactionRejection }>

function fail(rejected: CompactionRejection, ref: RecordEntryRef | null): Failure {
  return { rejected, ref }
}

/** A model-readable message is not `tool_internal` and has a block that goes to the model. */
function isModelReadable(message: Message): boolean {
  return message.role !== 'tool_internal' && message.blocks.some(part => part.visibility.toModel)
}

function hasDuplicate(refs: readonly RecordEntryRef[]): boolean {
  return new Set(refs).size !== refs.length
}

function rangeFailure(message: CompactionMessage, context: CompactionContext): Failure | undefined {
  const { covered, after } = context
  const first = covered[0]
  const last = covered[covered.length - 1]
  const broken =
    first === undefined ||
    last === undefined ||
    first.ref !== message.covers.from ||
    last.ref !== message.covers.to ||
    hasDuplicate(covered.map(entry => entry.ref)) ||
    after.some(later => later.role === 'compaction')
  return broken ? fail('range', null) : undefined
}

/** Walks `retained` in order against the position of each covered entry. */
function retainedFailure(
  message: CompactionMessage,
  covered: readonly CoveredEntry[],
): Failure | undefined {
  const position = new Map<string, number>(covered.map((entry, at) => [entry.ref, at]))
  let previous = -1
  for (const ref of message.retained) {
    const at = position.get(ref)
    if (at === undefined) return fail('retained-outside', ref)
    if (at <= previous) return fail('retained-order', ref)
    const kept = covered[at]?.message ?? null
    if (kept === null || !isModelReadable(kept)) return fail('retained-not-model', ref)
    previous = at
  }
  return undefined
}

/** A message with a flag that says whether the model sees it once the range is summarized. */
interface Placed {
  readonly message: Message
  /** Null for a message after the range, which has no reference in the context. */
  readonly ref: RecordEntryRef | null
  readonly inView: boolean
}

/** The messages of the range that carry one, then the messages after it, in history order. */
function placeHistory(context: CompactionContext, retained: ReadonlySet<string>): Placed[] {
  const placed: Placed[] = []
  for (const { ref, message } of context.covered) {
    if (message !== null) placed.push({ message, ref, inView: retained.has(ref) })
  }
  for (const message of context.after) placed.push({ message, ref: null, inView: true })
  return placed
}

/** The `callId` of each call that a tool message can answer. An incomplete call is not one. */
function answerableCallIds(message: Message): readonly string[] {
  if (message.role !== 'assistant') return []
  const ids: string[] = []
  for (const part of message.blocks) {
    if (part.kind === 'tool_call' || part.kind === 'tool_call_unparsed') ids.push(part.callId)
  }
  return ids
}

/** The `callId` a tool message answers, from its marker. */
function answeredCallId(message: Message): string | undefined {
  const marker = message.role === 'tool' ? message.blocks[0] : undefined
  return marker?.kind === 'tool_result' ? marker.callId : undefined
}

/** The pair member that the failure points at: the one in the range, the kept one if both are. */
function pairRef(call: Placed, answer: Placed): RecordEntryRef | null {
  if (call.ref !== null && answer.ref !== null) return call.inView ? call.ref : answer.ref
  return call.ref ?? answer.ref
}

/** Each tool message is paired with the nearest earlier call of the same `callId`. */
function pairingFailure(placed: readonly Placed[]): Failure | undefined {
  const nearest = new Map<string, Placed>()
  for (const entry of placed) {
    for (const callId of answerableCallIds(entry.message)) nearest.set(callId, entry)
    const answered = answeredCallId(entry.message)
    const call = answered === undefined ? undefined : nearest.get(answered)
    if (call !== undefined && call.inView !== entry.inView) {
      return fail('pairing', pairRef(call, entry))
    }
  }
  return undefined
}

function openWorkFailure(
  covered: readonly CoveredEntry[],
  open: readonly RecordEntryRef[],
  retained: ReadonlySet<string>,
): Failure | undefined {
  const pending = new Set<string>(open)
  const entry = covered.find(({ ref }) => pending.has(ref) && !retained.has(ref))
  return entry === undefined ? undefined : fail('open-work', entry.ref)
}

/**
 * Judge a compaction record against the history the holder supplies. `message` goes through
 * `judgeMessage` first, and the later steps read only its success value. The order of checks is:
 * the range, the retained set, the pairing of calls and results, then the open work. The first
 * failure is returned. The cost is linear in the number of entries.
 */
export function judgeCompaction(message: unknown, context: CompactionContext): CompactionJudgment {
  const judged = judgeMessage(message)
  if ('rejected' in judged || !isCompactionMessage(judged.ok)) return fail('message', null)
  const admitted = judged.ok
  const retained = new Set<string>(admitted.retained)
  return (
    rangeFailure(admitted, context) ??
    retainedFailure(admitted, context.covered) ??
    pairingFailure(placeHistory(context, retained)) ??
    openWorkFailure(context.covered, context.open, retained) ?? { ok: admitted }
  )
}
