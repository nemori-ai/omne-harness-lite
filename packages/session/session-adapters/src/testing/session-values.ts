import { createHash } from 'node:crypto'
import {
  judgeMessage,
  parseRecordEntryRef,
  type Message,
  type CompactionContext,
  type CoveredEntry,
} from '@omne-harness/message'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  forkPointBefore,
  isAcceptedInputRecord,
  openWork,
  type ForkPointRead,
  type HistoryEntry,
  type ModelViewBasis,
  type ModelViewRead,
  type ModelViewRow,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { canonical } from './canonical.ts'
export { canonical }
export const digestOf = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex')
export function plain(value: JsonValue): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'string':
    case 'boolean':
      return value.value
    case 'number':
      return Number(value.lexeme)
    case 'array':
      return value.items.map(plain)
    case 'object':
      return Object.fromEntries(value.entries.map(item => [item.key, plain(item.value)]))
  }
}
export function rowData(row: HistoryEntry): Readonly<Record<string, unknown>> {
  const value = plain(row.payload)
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('invalid committed Session payload')
  return value as Readonly<Record<string, unknown>>
}
export function decodedRow(row: HistoryEntry): {
  ok: { kind: string; targets?: readonly string[] }
} {
  const value = rowData(row)
  if (
    row.kind === 'history.annotated' &&
    Array.isArray(value['targets']) &&
    value['targets'].every(item => typeof item === 'string')
  )
    return { ok: { kind: row.kind, targets: value['targets'] } }
  return { ok: { kind: row.kind } }
}
export function messageOf(row: HistoryEntry): Message | null {
  const value = rowData(row)
  if (!('message' in value)) return null
  const judged = judgeMessage(value['message'])
  if ('rejected' in judged) throw new TypeError('invalid committed Session message')
  return judged.ok
}
export type MaterializedModelView = Readonly<{ epoch: string; rows: readonly ModelViewRow[] }>
export function materializeModelView(
  previous: MaterializedModelView,
  committed: readonly HistoryEntry[],
  history: readonly HistoryEntry[],
): MaterializedModelView {
  let epoch = previous.epoch
  let rows = [...previous.rows]
  for (const [index, entry] of committed.entries()) {
    const message = isAcceptedInputRecord(committed, index) ? null : messageOf(entry)
    if (
      message === null ||
      message.role === 'tool_internal' ||
      !message.blocks.some(block => block.visibility.toModel)
    )
      continue
    if (message.role === 'compaction') {
      const boundary = history.findIndex(row => row.id === String(message.covers.to))
      rows = [
        ...rows.filter(row => message.retained.some(ref => String(ref) === row.entry)),
        { seq: '', entry: entry.id, bytes: 0, prefixDigest: '', message },
        ...rows.filter(row => history.findIndex(entry => entry.id === row.entry) > boundary),
      ]
      epoch = `epoch:${entry.id}`
    } else rows.push({ seq: '', entry: entry.id, bytes: 0, prefixDigest: '', message })
  }
  let prefix = ''
  rows = rows.map((row, index) => {
    prefix = digestOf({ prefix, entry: row.entry, message: row.message })
    return {
      ...row,
      seq: String(index + 1),
      bytes: Buffer.byteLength(JSON.stringify(row.message)),
      prefixDigest: prefix,
    }
  })
  return { epoch, rows }
}
export function compactionReads(
  entries: readonly HistoryEntry[],
  snapshot: WorkSnapshot,
  through: string,
): CompactionContext | null {
  const end = entries.findIndex(row => row.id === through)
  const first = entries[0]
  if (end < 0 || !first) return null
  const origin = parseRecordEntryRef(first.id)
  if (origin === null) return null
  const covered: CoveredEntry[] = []
  const after: CoveredEntry[] = []
  for (const [index, entry] of entries.entries()) {
    const ref = parseRecordEntryRef(entry.id)
    if (ref === null) return null
    const message = isAcceptedInputRecord(entries, index) ? null : messageOf(entry)
    ;(index <= end ? covered : after).push({ ref, message })
  }
  const previous = covered.filter(row => row.message?.role === 'compaction').at(-1)
  let window = covered
  if (previous?.message?.role === 'compaction') {
    const message = previous.message
    const boundary = covered.findIndex(row => row.ref === message.covers.to)
    window = covered.filter((row, index) => index > boundary || message.retained.includes(row.ref))
  }
  const original = [...covered, ...after]
  const pairings = [...window, ...after].flatMap(row => {
    if (row.message?.role !== 'tool') return []
    const marker = row.message.blocks.find(block => block.kind === 'tool_result')
    if (marker?.kind !== 'tool_result') return []
    const before = original
      .slice(
        0,
        original.findIndex(item => item.ref === row.ref),
      )
      .reverse()
      .find(candidate =>
        candidate.message?.blocks.some(
          block =>
            (block.kind === 'tool_call' || block.kind === 'tool_call_unparsed') &&
            block.callId === marker.callId,
        ),
      )
    return [{ result: row.ref, call: before?.ref ?? null }]
  })
  const work = openWork(snapshot),
    index = snapshot.workEntryIndex,
    required = new Set<string>()
  for (const wait of work.unassociatedWaiting ?? []) {
    const call = index?.calls.find(item => item.consumption === wait.consumption)
    const selected = index?.controls
      .flatMap(item => item.selected)
      .find(item => item.consumption === wait.consumption && item.position === wait.position)
    const registered = call?.registered ?? selected?.registered
    const waiting =
      call?.waits.find(item => item.position === wait.position)?.entry ?? selected?.waiting
    if (!registered || !waiting) return null
    required.add(registered)
    required.add(waiting)
    const association = call?.association ?? selected?.association
    if (association) required.add(association)
  }
  for (const operation of work.unsettledControls ?? []) {
    const control = index?.controls.find(item => item.operation === operation)
    if (!control) return null
    required.add(control.intent)
    if (control.progress) required.add(control.progress)
    for (const selected of control.selected) {
      required.add(selected.registered)
      required.add(selected.waiting)
      if (selected.association) required.add(selected.association)
    }
  }
  if ([...required].some(ref => !entries.some(entry => entry.id === ref))) return null
  const open = entries.flatMap(entry => {
    const value = rowData(entry)
    // An input that is still alive keeps its delivery in the context.
    const relevant =
      required.has(entry.id) ||
      (entry.kind === 'message.delivered' &&
        typeof value['input'] === 'string' &&
        [...snapshot.pending, ...(snapshot.taken ?? [])].some(input => input === value['input'])) ||
      (entry.kind === 'call.bound' &&
        snapshot.consumptions.some(
          item =>
            item.id === value['consumption'] &&
            item.results.every(result => result.completion === null),
        ))
    const ref = parseRecordEntryRef(entry.id)
    return relevant && ref !== null ? [ref] : []
  })
  return {
    origin,
    base:
      previous === undefined
        ? { kind: 'initial', pairings }
        : { kind: 'previous', record: previous.ref, pairings },
    covered: window,
    after,
    open: [...new Set(open)],
  }
}

type Held = Readonly<{ modelView: MaterializedModelView; entries: readonly HistoryEntry[] }>
type Keyed = Outcome<string, SessionFailure>

/** The point before the asking message of the view of a memory session. */
export function forkPointRead(
  store: Outcome<Held, SessionFailure>,
  key: Keyed,
  asking: string,
): Outcome<ForkPointRead, SessionFailure> {
  if ('failure' in store) return fail(store.failure)
  if ('failure' in key) return fail(key.failure)
  const view = store.ok.modelView
  const row = view.rows.find(item => item.message.id === asking)
  const found = row === undefined ? undefined : { seq: row.seq, role: row.message.role }
  const tail = store.ok.entries.at(-1)?.id ?? '0'
  const point = forkPointBefore(`${key.ok}/${view.epoch}`, found, tail)
  return succeed(point === null ? { kind: 'none' } : { kind: 'point', point })
}

export function modelViewPage(
  view: MaterializedModelView,
  key: Keyed,
  input: Readonly<{
    basis: ModelViewBasis | null
    after: string | null
    pageBytes: number
    resumeAtEnd?: true
  }>,
): Outcome<ModelViewRead, SessionFailure> {
  if (!Number.isInteger(input.pageBytes) || input.pageBytes < 1)
    return fail({ kind: 'invalid', field: 'pageBytes', reason: 'not a positive integer' })
  if ('failure' in key) return fail(key.failure)
  const current = { epoch: `${key.ok}/${view.epoch}`, upper: String(view.rows.length) }
  if (input.basis !== null && !input.basis.epoch.startsWith(`${key.ok}/`))
    return fail({ kind: 'invalid', field: 'basis', reason: 'another session' })
  if (input.basis !== null && input.basis.epoch !== current.epoch)
    return succeed({ kind: 'epoch-changed', current })
  const basis = input.basis ?? current
  const after = input.after === null ? 0 : Number(input.after)
  const upper = Number(basis.upper)
  if (
    !Number.isInteger(after) ||
    !Number.isInteger(upper) ||
    after < 0 ||
    upper > view.rows.length ||
    after > upper
  )
    return fail({ kind: 'invalid', field: 'basis', reason: 'invalid model view bounds' })
  const rows = []
  let bytes = 0
  for (const row of view.rows.slice(after, upper)) {
    if (rows.length > 0 && bytes + row.bytes > input.pageBytes) break
    rows.push(row)
    bytes += row.bytes
  }
  const next = after + rows.length < upper ? String(after + rows.length) : null
  return succeed({
    kind: 'page',
    basis,
    rows,
    next,
    ...(next === null && input.resumeAtEnd ? { resume: basis.upper } : {}),
  })
}
