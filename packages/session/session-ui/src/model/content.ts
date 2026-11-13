// What the conversation shows: the committed entries read from history, and at most one reply still
// being generated (the `model-output-v1` projection of the current main model call). History is the
// authority; the live reply is a projection that a committed assistant message replaces.
import {
  compareDecimal,
  isRecord,
  listOf,
  textOf,
  toPlain,
  type JsonTree,
  type Plain,
} from './plain.ts'

export type HistoryEntry = Readonly<{
  entryId: string
  revision: string
  kind: string
  payload: Plain
}>

/** One block of the live projection, as plain data. `index` orders the blocks. */
export type LiveBlock =
  | Readonly<{ kind: 'sealed'; index: string; block: Plain }>
  | Readonly<{
      kind: 'growing'
      index: string
      mode: 'append' | 'replace'
      content: string
      value: string
    }>

export type Live = Readonly<{
  cursor: string
  revision: string
  phase: string
  blocks: readonly LiveBlock[]
  /** The session revision the reply was seen at: a committed assistant message after it replaces it. */
  anchor: string
}>

/** Why the live reply is not moving: the observation reported a gap, or is refreshing. */
export type LiveStatus =
  | Readonly<{ kind: 'gap'; reason: 'buffer' | 'source-history' }>
  | Readonly<{ kind: 'refreshing' }>
  | null

export type Content = Readonly<{
  /** Committed entries in log order, unique by `entryId`. */
  entries: readonly HistoryEntry[]
  live: Live | null
  liveStatus: LiveStatus
  /** The highest session revision history has been read through, or null before the first read. */
  scannedThrough: string | null
}>

export const EMPTY_CONTENT: Content = {
  entries: [],
  live: null,
  liveStatus: null,
  scannedThrough: null,
}

export type WireEntry = Readonly<{
  entryId: string
  revision: string
  kind: string
  payload: JsonTree
}>

function byLogOrder(left: HistoryEntry, right: HistoryEntry): number {
  return (
    compareDecimal(left.revision, right.revision) || compareDecimal(left.entryId, right.entryId)
  )
}

function maxDecimal(left: string | null, right: string): string {
  return left === null || compareDecimal(left, right) < 0 ? right : left
}

/** Whether a page brings no entry the content does not have yet: catching up can stop there. */
export function reachesKnown(content: Content, page: readonly WireEntry[]): boolean {
  if (content.entries.length === 0) return false
  const known = new Set(content.entries.map(entry => entry.entryId))
  return page.some(entry => known.has(entry.entryId))
}

/**
 * Merges one history page. An entry already held is replaced by the page's copy. A committed
 * assistant message newer than the live reply's anchor means the reply was committed: it goes.
 */
export function mergeHistory(
  content: Content,
  page: readonly WireEntry[],
  scannedThrough: string,
): Content {
  const byId = new Map(content.entries.map(entry => [entry.entryId, entry]))
  for (const entry of page)
    byId.set(entry.entryId, {
      entryId: entry.entryId,
      revision: entry.revision,
      kind: entry.kind,
      payload: toPlain(entry.payload),
    })
  const entries = [...byId.values()].sort(byLogOrder)
  const live = content.live
  const committed =
    live !== null &&
    entries.some(
      entry =>
        entry.kind === 'message.assistant' && compareDecimal(entry.revision, live.anchor) > 0,
    )
  return {
    ...content,
    entries,
    live: committed ? null : live,
    liveStatus: committed ? null : content.liveStatus,
    scannedThrough: maxDecimal(content.scannedThrough, scannedThrough),
  }
}

/** When the run ended and history is read through its last revision, nothing is live any more. */
export function settleLive(content: Content, revision: string): Content {
  if (content.live === null || content.scannedThrough === null) return content
  return compareDecimal(content.scannedThrough, revision) >= 0
    ? { ...content, live: null, liveStatus: null }
    : content
}

function blockOf(value: Plain): LiveBlock | null {
  if (!isRecord(value)) return null
  const index = textOf(value['index'])
  if (index === undefined) return null
  if (value['kind'] === 'sealed') return { kind: 'sealed', index, block: value['block'] ?? null }
  const mode = value['mode']
  const content = textOf(value['content'])
  const text = textOf(value['value'])
  if (value['kind'] !== 'growing' || (mode !== 'append' && mode !== 'replace')) return null
  if (content === undefined || text === undefined) return null
  return { kind: 'growing', index, mode, content, value: text }
}

type Projection = Readonly<{
  cursor: string
  revision: string
  phase: string | undefined
  base: Readonly<{ cursor: string; revision: string }> | undefined
  blocks: readonly LiveBlock[]
}>

function projectionOf(tree: JsonTree): Projection | null {
  const value = toPlain(tree)
  if (!isRecord(value) || value['projection'] !== 'model-output-v1') return null
  const cursor = textOf(value['cursor'])
  const revision = textOf(value['revision'])
  if (cursor === undefined || revision === undefined) return null
  const blocks: LiveBlock[] = []
  for (const item of listOf(value['blocks'])) {
    const block = blockOf(item)
    if (block === null) return null
    blocks.push(block)
  }
  const base = value['base']
  const baseCursor = isRecord(base) ? textOf(base['cursor']) : undefined
  const baseRevision = isRecord(base) ? textOf(base['revision']) : undefined
  return {
    cursor,
    revision,
    phase: textOf(value['phase']),
    base:
      baseCursor === undefined || baseRevision === undefined
        ? undefined
        : { cursor: baseCursor, revision: baseRevision },
    blocks,
  }
}

export type LiveApplied =
  | Readonly<{ kind: 'applied'; content: Content }>
  /** The delta's base is not the reply held: the client does not apply it and observes again. */
  | Readonly<{ kind: 'base-mismatch' }>
  /** The value is not a `model-output-v1` projection the view can read. */
  | Readonly<{ kind: 'unreadable' }>

export function applySnapshot(content: Content, tree: JsonTree, anchor: string): LiveApplied {
  const projection = projectionOf(tree)
  if (projection === null || projection.phase === undefined || projection.base !== undefined)
    return { kind: 'unreadable' }
  return {
    kind: 'applied',
    content: {
      ...content,
      live: {
        cursor: projection.cursor,
        revision: projection.revision,
        phase: projection.phase,
        blocks: projection.blocks,
        anchor,
      },
      liveStatus: null,
    },
  }
}

/** A delta replaces the blocks it names by index and appends the new ones, after its base. */
export function applyDelta(content: Content, tree: JsonTree): LiveApplied {
  const projection = projectionOf(tree)
  if (projection === null || projection.base === undefined) return { kind: 'unreadable' }
  const live = content.live
  if (
    live === null ||
    live.cursor !== projection.base.cursor ||
    live.revision !== projection.base.revision
  )
    return { kind: 'base-mismatch' }
  const blocks = [...live.blocks]
  for (const block of projection.blocks) {
    const at = blocks.findIndex(held => held.index === block.index)
    if (at === -1) blocks.push(block)
    else blocks[at] = block
  }
  return {
    kind: 'applied',
    content: {
      ...content,
      live: {
        ...live,
        cursor: projection.cursor,
        revision: projection.revision,
        phase: projection.phase ?? live.phase,
        blocks,
      },
      liveStatus: null,
    },
  }
}

export function markLive(content: Content, status: LiveStatus): Content {
  return { ...content, liveStatus: status }
}
