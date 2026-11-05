// The read shapes of the memory doubles (agent-contract SPEC "日志条目" and "扩展、卡片与材料"): the
// page of `AgentJournalEntries.read`, the `received` entries of one consumption, and the digest and
// size of a material addressed by content. A durable provider computes them from its own storage.
import { createHash } from 'node:crypto'
import type {
  AgentJournalEntry,
  ConsumptionId,
  JournalEntryPage,
  Material,
  MaterialDescription,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { canonical } from '../canonical.ts'

/**
 * The page after `after` of the committed `entries`, in commit order. A cursor that is not a
 * position of the list, or a limit below 1, answers `undefined`: the caller maps it to `invalid`.
 */
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

/** Every `received` entry of `consumption`, in commit order. */
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

/** The digest of a material's content: the same content has the same digest. */
export function materialDigest(value: Material<ContentBlock>): string {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`
}

/** What `describe` answers for a kept material: its digest, its size in bytes and its kind. */
export function describeMaterial(value: Material<ContentBlock>): MaterialDescription {
  return {
    digest: materialDigest(value),
    size: Buffer.byteLength(canonical(value), 'utf8'),
    kind: value.kind,
  }
}
