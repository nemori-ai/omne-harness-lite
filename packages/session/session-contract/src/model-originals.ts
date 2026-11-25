import { decodeEntry } from './entries.ts'
import type { HistoryEntry, ModelViewRow } from './faces.ts'
import { projectModelMessage } from './model-projection.ts'
import { projectModelProvenance } from './model-provenance.ts'

/** Rebuild the uncompacted view only when a summary's sources cease to qualify. */
export function originalModelRows(
  inherited: readonly ModelViewRow[],
  entries: readonly HistoryEntry[],
  denied: ReadonlySet<string>,
): readonly ModelViewRow[] {
  const rows = [...inherited]
  const lastWithdrawal = new Map<string, bigint>()
  for (const [index, entry] of entries.entries()) {
    if (entry.kind === 'session.model-projected') {
      const event = decodeEntry(entry)
      if (!('ok' in event) || event.ok.kind !== 'session.model-projected')
        throw new Error('unreadable model projection in original history')
      for (const block of event.ok.blocks) lastWithdrawal.set(block, BigInt(entry.id))
      continue
    }
    if (!entry.kind.startsWith('message.') || entry.kind === 'message.compaction') continue
    const next = entries[index + 1]
    if (next?.kind === 'intake.routed' && BigInt(next.id) === BigInt(entry.id) + 1n) continue
    const event = decodeEntry(entry)
    if (!('ok' in event) || !('message' in event.ok))
      throw new Error('unreadable original model message')
    const { message } = event.ok
    if (message.role === 'tool_internal' || !message.blocks.some(block => block.visibility.toModel))
      continue
    const provenance =
      'provenance' in event.ok
        ? event.ok.provenance
        : message.role === 'system_reminder'
          ? undefined
          : []
    rows.push({
      entry: entry.id,
      message,
      seq: '',
      bytes: 0,
      prefixDigest: '',
      ...(provenance === undefined ? {} : { provenance }),
    })
  }
  return rows.flatMap(row => {
    if (row.message.role === 'compaction')
      throw new Error('the fork did not inherit the originals behind this summary')
    if (row.message.role !== 'system_reminder') return [row]
    const removed = new Set(
      row.message.blocks
        .filter(
          block =>
            denied.has(block.id) || (lastWithdrawal.get(block.id) ?? -1n) >= BigInt(row.entry),
        )
        .map(block => String(block.id)),
    )
    const message = projectModelMessage(row.message, removed)
    if (message === null) return []
    const provenance = projectModelProvenance(row.provenance, removed)
    return [{ ...row, message, ...(provenance === undefined ? {} : { provenance }) }]
  })
}
