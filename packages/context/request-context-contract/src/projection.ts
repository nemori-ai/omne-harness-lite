import {
  projectMessage as filterMessage,
  type Message,
  type RecordEntryRef,
} from '@omne-harness/message'
import type { EpochId, HistorySequence } from './refs.js'
import type { HistoryRow } from './ports.js'
export type { ProjectedMessage, ProjectedHistory } from './values.js'
import type {
  ProjectedMessage,
  ProjectedHistory,
  SourcedMessage,
  TenantModelCall,
} from './values.js'
export type HumanProjection = Readonly<{
  entries: readonly Readonly<{
    seq: HistorySequence
    entry: RecordEntryRef
    message: Message
    summarized: 'retained' | 'summarized' | 'after' | null
  }>[]
}>
export function projectMessageForModel(message: Message): Message | null {
  return filterMessage(message, 'toModel')?.message ?? null
}
export function sourced(message: Message, call: TenantModelCall | undefined): SourcedMessage {
  if (message.role !== 'assistant') return { message }
  return call === undefined ? { message } : { message, sourceCall: call }
}
function projectRow(row: HistoryRow): ProjectedMessage | null {
  const filtered = filterMessage(row.message, 'toModel')
  return filtered === null
    ? null
    : {
        seq: row.seq,
        entry: row.entry,
        prefixDigest: row.prefixDigest,
        dropped: filtered.dropped,
        ...sourced(filtered.message, row.sourceCall),
      }
}
export function project(rows: readonly HistoryRow[], epoch: EpochId): ProjectedHistory {
  const latest = [...rows].reverse().find(r => r.message.role === 'compaction')
  const compact = latest?.message.role === 'compaction' ? latest.message : null
  const retained = new Set(compact?.retained)
  const coveredEnd = compact === null ? -1 : rows.findIndex(r => r.entry === compact.covers.to)
  const messages: ProjectedMessage[] = []
  for (const [i, row] of rows.entries()) {
    if (compact !== null && i <= coveredEnd && !retained.has(row.entry)) continue
    if (row.message.role === 'compaction' && row !== latest && !retained.has(row.entry)) continue
    const projected = projectRow(row)
    if (projected !== null) messages.push(projected)
  }
  return {
    epoch,
    messages,
    compaction: latest === undefined ? null : { seq: latest.seq, entry: latest.entry },
  }
}
export function appendProjection(
  previous: ProjectedHistory,
  addedRows: readonly HistoryRow[],
  epoch: EpochId,
): ProjectedHistory | null {
  if (previous.epoch !== epoch) return null
  const messages: ProjectedMessage[] = [...previous.messages]
  for (const row of addedRows) {
    if (row.message.role === 'compaction') return null
    const projected = projectRow(row)
    if (projected !== null) messages.push(projected)
  }
  return { epoch, messages, compaction: previous.compaction }
}
export function projectForHuman(rows: readonly HistoryRow[]): HumanProjection {
  const compact = [...rows].reverse().find(r => r.message.role === 'compaction')?.message
  const retained = new Set(compact?.role === 'compaction' ? compact.retained : [])
  const end =
    compact?.role === 'compaction' ? rows.findIndex(r => r.entry === compact.covers.to) : -1
  return {
    entries: rows.flatMap((row, i) => {
      const filtered = filterMessage(row.message, 'toHuman')
      return filtered === null
        ? []
        : [
            {
              seq: row.seq,
              entry: row.entry,
              message: filtered.message,
              summarized:
                compact === undefined
                  ? null
                  : i > end
                    ? 'after'
                    : retained.has(row.entry)
                      ? 'retained'
                      : 'summarized',
            },
          ]
    }),
  }
}
