import type { RecordEntryRef } from './compaction-shape.ts'
import { judgeMessage, type CompactionMessage, type Message } from './message.ts'
import type { MessagePart, ToolPart } from './parts.ts'
import { hasDuplicates } from './values.ts'

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

function rangeFailure(message: CompactionMessage, context: CompactionContext): Failure | undefined {
  const { covered, after } = context
  const refs = covered.map(entry => entry.ref)
  const broken =
    refs.at(0) !== message.covers.from ||
    refs.at(-1) !== message.covers.to ||
    hasDuplicates(refs) ||
    after.some(later => later.role === 'compaction')
  return broken ? fail('range', null) : undefined
}

/**
 * Walks `retained` in order against the position of each covered entry. `judgeMessage` has
 * refused a repeated reference, so a position that is not after the previous one is earlier.
 */
function retainedFailure(
  message: CompactionMessage,
  covered: readonly CoveredEntry[],
): Failure | undefined {
  const found = new Map(covered.map((entry, at) => [entry.ref, { entry, at }] as const))
  let previous = -1
  for (const ref of message.retained) {
    const hit = found.get(ref)
    if (hit === undefined) return fail('retained-outside', ref)
    if (hit.at <= previous) return fail('retained-order', ref)
    const { message: kept } = hit.entry
    if (kept === null || !isModelReadable(kept)) return fail('retained-not-model', ref)
    previous = hit.at
  }
  return undefined
}

/** A message with a flag that says whether the model sees it once the range is summarized. */
interface ViewEntry {
  readonly message: Message
  /** Null for a message after the range, which has no reference in the context. */
  readonly ref: RecordEntryRef | null
  readonly inView: boolean
}

/** The messages of the range that carry one, then the messages after it, in history order. */
function layoutHistory(
  context: CompactionContext,
  retained: ReadonlySet<RecordEntryRef>,
): ViewEntry[] {
  const layout: ViewEntry[] = []
  for (const { ref, message } of context.covered) {
    if (message !== null) layout.push({ message, ref, inView: retained.has(ref) })
  }
  for (const message of context.after) layout.push({ message, ref: null, inView: true })
  return layout
}

/**
 * The `callId` of each part of one of these kinds. The context messages passed `judgeMessage`,
 * so a call part is only in an `assistant` message and a marker only in a `tool` message.
 */
function callIdsOf(message: Message, kinds: readonly string[]): string[] {
  const blocks: readonly MessagePart[] = message.blocks
  return blocks
    .filter((part): part is ToolPart => kinds.includes(part.kind))
    .map(part => part.callId)
}

/** An incomplete call is not one a tool message can answer. */
const ANSWERABLE: readonly string[] = ['tool_call', 'tool_call_unparsed']
const MARKER: readonly string[] = ['tool_result']

/**
 * The pair member that the failure points at: the one in the range, the kept one if both are.
 * A failed pair is never two messages after the range, and a call is before its answer, so the
 * call is in the range.
 */
function pairRef(call: ViewEntry, answer: ViewEntry): RecordEntryRef | null {
  return answer.ref !== null && !call.inView ? answer.ref : call.ref
}

/** Each tool message is paired with the nearest earlier call of the same `callId`. */
function pairingFailure(layout: readonly ViewEntry[]): Failure | undefined {
  const nearest = new Map<string, ViewEntry>()
  for (const entry of layout) {
    for (const callId of callIdsOf(entry.message, ANSWERABLE)) nearest.set(callId, entry)
    for (const callId of callIdsOf(entry.message, MARKER)) {
      const call = nearest.get(callId)
      if (call !== undefined && call.inView !== entry.inView) {
        return fail('pairing', pairRef(call, entry))
      }
    }
  }
  return undefined
}

function openWorkFailure(
  covered: readonly CoveredEntry[],
  open: readonly RecordEntryRef[],
  retained: ReadonlySet<RecordEntryRef>,
): Failure | undefined {
  const pending = new Set<RecordEntryRef>(open)
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
  if ('rejected' in judged || judged.ok.role !== 'compaction') return fail('message', null)
  const admitted = judged.ok
  const retained = new Set<RecordEntryRef>(admitted.retained)
  return (
    rangeFailure(admitted, context) ??
    retainedFailure(admitted, context.covered) ??
    pairingFailure(layoutHistory(context, retained)) ??
    openWorkFailure(context.covered, context.open, retained) ?? { ok: admitted }
  )
}
