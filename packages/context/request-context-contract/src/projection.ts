import {
  judgeMessage,
  type Message,
  type MessagePart,
  type RecordEntryRef,
} from '@omne-harness/message'
import type { BlockId } from '@omne-harness/content-block'
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
function filterMessage(
  message: Message,
  side: 'toHuman' | 'toModel',
): { message: Message; dropped: readonly BlockId[] } | null {
  if (side === 'toModel' && message.role === 'tool_internal') return null
  const kept: MessagePart[] = message.blocks.filter(
    block =>
      block.visibility[side] === true &&
      !(side === 'toModel' && block.kind === 'tool_call_incomplete'),
  )
  const ids = new Set(kept.map(b => b.id))
  const blocks = kept.map(b =>
    b.kind === 'reasoning_state' ? { ...b, pairs: b.pairs.filter(id => ids.has(id)) } : b,
  )
  if (!blocks.length) return null
  let raw: unknown = { ...message, blocks }
  if (message.role === 'assistant' && message.replay !== undefined) {
    const at = blocks.flatMap((b, i) => (b.kind === 'reasoning_state' ? [i] : []))
    const { replay, ...base } = message
    raw =
      at.length || blocks.some(b => b.kind === 'thinking')
        ? { ...base, blocks, replay: { ...replay, at } }
        : { ...base, blocks }
  }
  const judged = judgeMessage(raw)
  if ('rejected' in judged) return null
  return { message: judged.ok, dropped: message.blocks.filter(b => !ids.has(b.id)).map(b => b.id) }
}
/** Keeps the source call only on an assistant message (J48). */
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
/**
 * Appends the projection of rows that continue the rows of `previous` in the same epoch. It gives
 * the same view as `project` over all rows, and only reads the added rows. A compaction record among
 * the added rows, or another epoch, cannot be appended: it answers null and the caller projects
 * every row again.
 */
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
