import type { RecordEntryRef } from './compaction-shape.ts'
import { judgeMessage, type CompactionMessage, type Message } from './message.ts'
import type { MessagePart, ToolPart } from './parts.ts'

export type CoveredEntry = Readonly<{ ref: RecordEntryRef; message: Message | null }>

export type PairingWitness = Readonly<{ result: RecordEntryRef; call: RecordEntryRef | null }>

export type CompactionBase =
  | Readonly<{ kind: 'initial' }>
  | Readonly<{ kind: 'previous'; record: RecordEntryRef; pairings: readonly PairingWitness[] }>

export type CompactionContext = Readonly<{
  origin: RecordEntryRef
  base: CompactionBase
  covered: readonly CoveredEntry[]
  after: readonly CoveredEntry[]
  open: readonly RecordEntryRef[]
}>

export type CompactionRejection =
  | 'message'
  | 'range'
  | 'source-evidence'
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

function isModelReadable(message: Message): boolean {
  return message.role !== 'tool_internal' && message.blocks.some(part => part.visibility.toModel)
}

function rangeFailure(message: CompactionMessage, context: CompactionContext): Failure | undefined {
  const { covered, after, base, origin } = context
  const refs = covered.map(entry => entry.ref)
  const broken =
    refs.length === 0 ||
    message.covers.from !== origin ||
    refs.at(-1) !== message.covers.to ||
    after.some(later => later.message?.role === 'compaction') ||
    (base.kind === 'initial' && refs[0] !== origin) ||
    (base.kind === 'previous' && !refs.includes(base.record))
  return broken ? fail('range', null) : undefined
}

function answeredCallId(message: Message): string | undefined {
  return callIdsOf(message, MARKER)[0]
}

function sourceEvidenceFailure(context: CompactionContext): Failure | undefined {
  const { covered, after, base, open, origin } = context
  const seen = new Set<RecordEntryRef>()
  for (const { ref } of [...covered, ...after]) {
    if (seen.has(ref)) return fail('source-evidence', ref)
    seen.add(ref)
  }
  if (base.kind === 'initial') {
    const prior = covered.find(entry => entry.message?.role === 'compaction')
    if (prior !== undefined) return fail('source-evidence', prior.ref)
  } else {
    const at = covered.findIndex(entry => entry.ref === base.record)
    const record = covered[at]?.message
    if (record?.role !== 'compaction') return fail('source-evidence', base.record)
    if (record.covers.from !== origin) return fail('source-evidence', base.record)
    const later = covered.slice(at + 1).find(entry => entry.message?.role === 'compaction')
    if (later !== undefined) return fail('source-evidence', later.ref)
    const revived = revivedFailure(covered.slice(0, at), record)
    if (revived !== undefined) return revived
    const witnessed = witnessFailure([...covered, ...after], base.pairings)
    if (witnessed !== undefined) return witnessed
  }
  const known = new Set([...covered, ...after].map(entry => entry.ref))
  const unknown = open.find(ref => !known.has(ref))
  return unknown === undefined ? undefined : fail('source-evidence', unknown)
}

function revivedFailure(
  before: readonly CoveredEntry[],
  record: CompactionMessage,
): Failure | undefined {
  const kept = new Set<RecordEntryRef>(record.retained)
  let last = -1
  for (const ref of record.retained) {
    const at = before.findIndex(entry => entry.ref === ref)
    if (at <= last) return fail('source-evidence', ref)
    last = at
  }
  const revived = before.find(
    (entry, at) => !kept.has(entry.ref) && (at < last || entry.ref === record.covers.to),
  )
  return revived === undefined ? undefined : fail('source-evidence', revived.ref)
}

function witnessFailure(
  window: readonly CoveredEntry[],
  pairings: readonly PairingWitness[],
): Failure | undefined {
  const position = new Map(window.map((entry, at) => [entry.ref, at] as const))
  const witnesses = new Map<RecordEntryRef, PairingWitness>()
  for (const witness of pairings) {
    const at = position.get(witness.result)
    if (witnesses.has(witness.result) || at === undefined || window[at]?.message?.role !== 'tool')
      return fail('source-evidence', witness.result)
    witnesses.set(witness.result, witness)
  }
  for (const [at, entry] of window.entries()) {
    if (entry.message?.role !== 'tool') continue
    const witness = witnesses.get(entry.ref)
    if (witness === undefined) return fail('source-evidence', entry.ref)
    if (witness.call === null) continue
    const callAt = position.get(witness.call)
    if (callAt === undefined) continue
    const call = window[callAt]?.message
    const callId = answeredCallId(entry.message)
    if (
      callAt >= at ||
      call === null ||
      call === undefined ||
      callId === undefined ||
      !callIdsOf(call, ANSWERABLE).includes(callId)
    )
      return fail('source-evidence', entry.ref)
  }
  return undefined
}

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

interface ViewEntry {
  readonly message: Message
  readonly ref: RecordEntryRef
  readonly covered: boolean
  readonly inView: boolean
}

function layoutHistory(
  context: CompactionContext,
  retained: ReadonlySet<RecordEntryRef>,
): ViewEntry[] {
  const layout: ViewEntry[] = []
  for (const { ref, message } of context.covered) {
    if (message !== null) layout.push({ message, ref, covered: true, inView: retained.has(ref) })
  }
  for (const { ref, message } of context.after) {
    if (message !== null) layout.push({ message, ref, covered: false, inView: true })
  }
  return layout
}

function callIdsOf(message: Message, kinds: readonly string[]): string[] {
  const blocks: readonly MessagePart[] = message.blocks
  return blocks
    .filter((part): part is ToolPart => kinds.includes(part.kind))
    .map(part => part.callId)
}

const ANSWERABLE: readonly string[] = ['tool_call', 'tool_call_unparsed']
const MARKER: readonly string[] = ['tool_result']

function pairRef(call: ViewEntry | null, answer: ViewEntry): RecordEntryRef {
  if (call === null) return answer.ref
  if (call.covered && answer.covered) return answer.inView ? answer.ref : call.ref
  return call.covered ? call.ref : answer.ref
}

function nearestPairingFailure(layout: readonly ViewEntry[]): Failure | undefined {
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

function witnessedPairingFailure(
  layout: readonly ViewEntry[],
  pairings: readonly PairingWitness[],
): Failure | undefined {
  const byRef = new Map(layout.map(entry => [entry.ref, entry] as const))
  const witness = new Map(pairings.map(item => [item.result, item.call] as const))
  for (const entry of layout) {
    if (entry.message.role !== 'tool') continue
    const callRef = witness.get(entry.ref) ?? null
    if (callRef === null) continue
    const call = byRef.get(callRef) ?? null
    if ((call?.inView ?? false) !== entry.inView) return fail('pairing', pairRef(call, entry))
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

export function judgeCompaction(message: unknown, context: CompactionContext): CompactionJudgment {
  const judged = judgeMessage(message)
  if ('rejected' in judged || judged.ok.role !== 'compaction') return fail('message', null)
  const admitted = judged.ok
  const retained = new Set<RecordEntryRef>(admitted.retained)
  const layout = layoutHistory(context, retained)
  const pairing = () =>
    context.base.kind === 'initial'
      ? nearestPairingFailure(layout)
      : witnessedPairingFailure(layout, context.base.pairings)
  return (
    rangeFailure(admitted, context) ??
    sourceEvidenceFailure(context) ??
    retainedFailure(admitted, context.covered) ??
    pairing() ??
    openWorkFailure(context.covered, context.open, retained) ?? { ok: admitted }
  )
}
