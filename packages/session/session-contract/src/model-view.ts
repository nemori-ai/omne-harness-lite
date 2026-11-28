import { originalModelRows } from './model-originals.ts'
import { summarizeModelProvenance, projectModelProvenance } from './model-provenance.ts'
import { projectModelMessage } from './model-projection.ts'
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
import { writesCall } from './run-closure.ts'
import { digestOf } from './operations.ts'
import type { WorkSnapshot } from './values.ts'

export type MaterializedModelView = Readonly<{
  epoch: string
  rows: readonly ModelViewRow[]
  /** The rows of the epochs the view left: a compaction writes a new epoch, the old rows stay. */
  past?: ReadonlyMap<string, readonly ModelViewRow[]>
}>
function messageOf(row: HistoryEntry): Message | null {
  const decoded = decodeEntry(row)
  return 'ok' in decoded && 'message' in decoded.ok ? decoded.ok.message : null
}

/** An input's message as accepted, the entry before its `intake.routed`: a record for people. */
export function isAcceptedInputRecord(
  entries: readonly Pick<HistoryEntry, 'kind'>[],
  index: number,
): boolean {
  return entries[index + 1]?.kind === 'intake.routed'
}

/** The message an entry gives the model view; an input is there from its delivery. */
export function viewMessageOf(entries: readonly HistoryEntry[], index: number): Message | null {
  const entry = entries[index]
  if (entry === undefined || isAcceptedInputRecord(entries, index)) return null
  return messageOf(entry)
}

function numbered(rows: readonly ModelViewRow[]): ModelViewRow[] {
  let prefix = ''
  return rows.map((row, index) => {
    prefix = digestOf({
      prefix,
      entry: row.entry,
      message: row.message,
      ...(row.provenance?.length ? { provenance: row.provenance } : {}),
    })
    return {
      ...row,
      seq: String(index + 1),
      bytes: Buffer.byteLength(JSON.stringify(row.message)),
      prefixDigest: prefix,
    }
  })
}

export function materializeModelView(
  previous: MaterializedModelView,
  committed: readonly HistoryEntry[],
  originals?: () => { inherited: readonly ModelViewRow[]; entries: readonly HistoryEntry[] },
): MaterializedModelView {
  let epoch = previous.epoch
  let rows = [...previous.rows]
  let past = previous.past
  for (const [index, entry] of committed.entries()) {
    const decoded = decodeEntry(entry)
    if ('ok' in decoded && decoded.ok.kind === 'session.model-projected') {
      const blocks = new Set(decoded.ok.blocks)
      past = new Map(past).set(epoch, numbered(rows))
      if (decoded.ok.restoreOriginals) {
        const source = originals?.()
        if (source === undefined)
          throw new Error('original history is unavailable for model projection')
        rows = [
          ...originalModelRows(
            source.inherited,
            [...source.entries, ...committed.slice(0, index)],
            blocks,
          ),
        ]
        epoch = `epoch:${entry.id}`
        continue
      }
      rows = rows.flatMap(row => {
        const message = projectModelMessage(row.message, blocks)
        const provenance = projectModelProvenance(row.provenance, blocks)
        return message === null
          ? []
          : [{ ...row, message, ...(provenance === undefined ? {} : { provenance }) }]
      })
      epoch = `epoch:${entry.id}`
      continue
    }
    const message = viewMessageOf(committed, index)
    if (
      message === null ||
      message.role === 'tool_internal' ||
      !message.blocks.some(block => block.visibility.toModel)
    )
      continue
    if (message.role === 'compaction') {
      const covers = BigInt(String(message.covers.to))
      const byEntry = new Map(rows.map(row => [row.entry, row]))
      const retained = message.retained.flatMap(ref => {
        const row = byEntry.get(String(ref) as HistoryEntry['id'])
        return row === undefined ? [] : [row]
      })
      const after = rows.filter(row => BigInt(row.entry) > covers)
      past = new Map(past).set(epoch, numbered(rows))
      rows = [
        ...retained,
        {
          seq: '',
          entry: entry.id,
          bytes: 0,
          prefixDigest: '',
          message,
          provenance: summarizeModelProvenance(
            rows.map(row => row.provenance),
            message.blocks.map(block => block.id),
          ),
        },
        ...after,
      ]
      epoch = `epoch:${entry.id}`
    } else {
      const provenance =
        'ok' in decoded && 'provenance' in decoded.ok
          ? decoded.ok.provenance
          : message.role === 'system_reminder'
            ? undefined
            : []
      rows.push({
        seq: '',
        entry: entry.id,
        bytes: 0,
        prefixDigest: '',
        message,
        ...(provenance === undefined ? {} : { provenance }),
      })
    }
  }
  return { epoch, rows: numbered(rows), ...(past === undefined ? {} : { past }) }
}

/** `inherited` leading entries stand behind a forked prefix: they are referred to, never reduced. */
export function compactionReads(
  entries: readonly HistoryEntry[],
  snapshot: WorkSnapshot,
  through: string,
  inherited = 0,
  visible?: ReadonlySet<string>,
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
    const row = { ref, message: viewMessageOf(entries, index) }
    ;(index <= end ? covered : after).push(row)
  }
  const previous = covered
    .filter(row => row.message?.role === 'compaction' && (!visible || visible.has(row.ref)))
    .at(-1)
  let window = covered
  if (previous?.message?.role === 'compaction') {
    const prior = previous.message
    const boundary = covered.findIndex(row => row.ref === prior.covers.to)
    window = covered.filter((row, index) => index > boundary || prior.retained.includes(row.ref))
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
          block => writesCall(block) && block.callId === marker.callId,
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
  const open = entries.slice(inherited).flatMap(entry => {
    const decoded = decodeEntry(entry)
    if (!('ok' in decoded)) return []
    const value = decoded.ok
    // An input that is still alive keeps its delivery in the context.
    const relevant =
      required.includes(entry.id) ||
      (value.kind === 'message.delivered' &&
        (snapshot.pending.includes(value.input) || (snapshot.taken ?? []).includes(value.input))) ||
      (value.kind === 'call.bound' &&
        snapshot.consumptions.some(
          item =>
            item.id === value.consumption &&
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

export function compactionContextForView(
  entries: readonly HistoryEntry[],
  snapshot: WorkSnapshot,
  rows: readonly ModelViewRow[],
  upper: number | null,
  through: string | null,
  inherited = 0,
): CompactionContext | null {
  const currentRows = upper === null ? rows : rows.slice(0, upper)
  const selected = new Set(currentRows.map(row => String(row.entry)))
  through ??= entries.findLast(row => selected.has(row.id))?.id ?? null
  if (through === null) return null
  const value = compactionReads(entries, snapshot, through, inherited, selected)
  if (value === null) return null
  // A commit may end on an own journal fact between messages. It carries no model bytes.
  const ownAnchor =
    upper === null &&
    entries.some(
      (entry, index) =>
        index >= inherited && entry.id === through && !entry.kind.startsWith('message.'),
    )
  const keep = (row: CoveredEntry) =>
    (ownAnchor && row.ref === through) ||
    selected.has(row.ref) ||
    value.open.includes(row.ref) ||
    (value.base.kind === 'initial' && row.ref === value.origin)
  const projected = new Map(currentRows.map(row => [String(row.entry), row.message]))
  const visible = (row: CoveredEntry): CoveredEntry =>
    selected.has(row.ref)
      ? { ...row, message: projected.get(String(row.ref)) ?? row.message }
      : { ref: row.ref, message: null }
  const covered = value.covered.filter(keep).map(visible)
  const after = value.after.filter(keep).map(visible)
  if (covered.at(-1)?.ref !== through) return null
  return {
    ...value,
    covered,
    after,
    base: {
      ...value.base,
      pairings: value.base.pairings.filter(item => selected.has(item.result)),
    },
  }
}
