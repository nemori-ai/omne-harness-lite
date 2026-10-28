import { requiredWorkEntries } from './work-entry-state.ts'
import { SessionValidationFailure } from './session-validation.ts'
import {
  parseRecordEntryRef,
  type CompactionContext,
  type CoveredEntry,
  type Message,
} from '@omne-harness/message'
import type { HistoryEntry, ModelViewRow } from './faces.ts'
import { decodeEntry } from './entries.ts'
import { digestOf } from './operations.ts'
import type { WorkSnapshot } from './values.ts'

export type MaterializedModelView = Readonly<{ epoch: string; rows: readonly ModelViewRow[] }>
function messageOf(row: HistoryEntry): Message | null {
  const decoded = decodeEntry(row)
  return 'ok' in decoded && 'message' in decoded.ok ? decoded.ok.message : null
}
export function materializeModelView(
  previous: MaterializedModelView,
  committed: readonly HistoryEntry[],
  history: readonly HistoryEntry[],
): MaterializedModelView {
  let epoch = previous.epoch
  let rows = [...previous.rows]
  for (const entry of committed) {
    const message = messageOf(entry)
    if (
      message === null ||
      message.role === 'tool_internal' ||
      !message.blocks.some(block => block.visibility.toModel)
    )
      continue
    if (message.role === 'compaction') {
      const boundary = history.findIndex(row => row.id === String(message.covers.to))
      const retained = rows.filter(row => message.retained.some(ref => String(ref) === row.entry))
      const after = rows.filter(
        row => history.findIndex(entry => entry.id === row.entry) > boundary,
      )
      rows = [
        ...retained,
        { seq: '', entry: entry.id, bytes: 0, prefixDigest: '', message },
        ...after,
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
  const end = entries.findIndex(entry => entry.id === through)
  const first = entries[0]
  if (end < 0 || first === undefined) return null
  const origin = parseRecordEntryRef(first.id)
  if (origin === null) return null
  const covered: CoveredEntry[] = []
  const after: CoveredEntry[] = []
  for (const [index, entry] of entries.entries()) {
    const ref = parseRecordEntryRef(entry.id)
    if (ref === null) return null
    const row = { ref, message: messageOf(entry) }
    ;(index <= end ? covered : after).push(row)
  }
  const previous = covered.filter(row => row.message?.role === 'compaction').at(-1)
  let window = covered
  if (previous?.message?.role === 'compaction') {
    const prior = previous.message
    const boundary = covered.findIndex(row => row.ref === prior.covers.to)
    window = covered.filter((row, index) => index > boundary || prior.retained.includes(row.ref))
  }
  // Pair witnesses come from the original history, including calls hidden by earlier compaction.
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
  let required: readonly string[]
  try {
    required = requiredWorkEntries(snapshot)
  } catch (error) {
    if (error instanceof SessionValidationFailure) return null
    throw error
  }
  if (required.some(ref => !entries.some(entry => entry.id === ref))) return null
  const open = entries.flatMap((entry, index) => {
    const decoded = decodeEntry(entry)
    if (!('ok' in decoded)) return []
    const value = decoded.ok
    const relevant =
      required.includes(entry.id) ||
      (value.kind === 'intake.routed' &&
        'input' in value &&
        (snapshot.pending.includes(value.input) || (snapshot.taken ?? []).includes(value.input))) ||
      (value.kind === 'call.bound' &&
        snapshot.consumptions.some(
          item =>
            item.id === value.consumption &&
            item.results.every(result => result.completion === null),
        ))
    const source =
      value.kind === 'intake.routed'
        ? entries
            .slice(0, index)
            .reverse()
            .find(row => row.kind === 'message.user')
        : entry
    const ref = source === undefined ? null : parseRecordEntryRef(source.id)
    return relevant && ref !== null ? [ref] : []
  })
  return {
    origin,
    base:
      previous === undefined
        ? { kind: 'initial' }
        : { kind: 'previous', record: previous.ref, pairings },
    covered: window,
    after,
    open: [...new Set(open)],
  }
}
