import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ConsumptionId } from './identity.ts'
import type { Material, MaterialDescription } from './passages.ts'
import type { AgentJournalEntry, JournalEntryPage, ReceivedEntry } from './receiving.ts'
import { canonicalText } from './testing-case.ts'

export function entryPage(
  entries: readonly AgentJournalEntry[],
  after: string | null,
  limit: number,
): JournalEntryPage | undefined {
  if (!Number.isSafeInteger(limit) || limit < 1) return undefined
  const from = after === null ? 0 : Number(after)
  if (after !== null && (!/^(0|[1-9][0-9]*)$/.test(after) || from > entries.length))
    return undefined
  const items = entries.slice(from, from + limit).map((entry, index) => ({
    sequence: String(from + index + 1),
    entry: structuredClone(entry),
  }))
  const last = items.at(-1)
  return {
    items,
    next: last === undefined ? after : last.sequence,
    caughtUp: from + items.length >= entries.length,
  }
}

export function receivedEntriesOf(
  entries: readonly AgentJournalEntry[],
  consumption: ConsumptionId,
): readonly ReceivedEntry[] {
  return entries
    .filter(
      (entry): entry is ReceivedEntry =>
        entry.kind === 'received' && entry.consumption === consumption,
    )
    .map(entry => structuredClone(entry))
}

export function materialDigest<B extends ContentBlock>(value: Material<B>): string {
  return `sha256:${createHash('sha256').update(canonicalText(value)).digest('hex')}`
}

export function describeMaterial<B extends ContentBlock>(value: Material<B>): MaterialDescription {
  return {
    digest: materialDigest(value),
    size: Buffer.byteLength(canonicalText(value), 'utf8'),
    kind: value.kind,
  }
}
