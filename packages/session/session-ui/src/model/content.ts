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
  anchor: string
}>

export type LiveStatus =
  | Readonly<{ kind: 'gap'; reason: 'buffer' | 'source-history' }>
  | Readonly<{ kind: 'refreshing' }>
  | null

export type Content = Readonly<{
  entries: readonly HistoryEntry[]
  live: Live | null
  liveStatus: LiveStatus
  readThrough: string | null
}>

export const EMPTY_CONTENT: Content = {
  entries: [],
  live: null,
  liveStatus: null,
  readThrough: null,
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

export function reachesKnown(content: Content, page: readonly WireEntry[]): boolean {
  if (content.entries.length === 0) return false
  const known = new Set(content.entries.map(entry => entry.entryId))
  return page.some(entry => known.has(entry.entryId))
}

export function mergeHistory(content: Content, page: readonly WireEntry[]): Content {
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
  }
}

export function readThroughTo(content: Content, upper: string): Content {
  return { ...content, readThrough: maxDecimal(content.readThrough, upper) }
}

export function settleLive(content: Content, revision: string): Content {
  if (content.live === null)
    return content.liveStatus === null ? content : { ...content, liveStatus: null }
  if (content.readThrough === null) return content
  return compareDecimal(content.readThrough, revision) >= 0
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
  | Readonly<{ kind: 'base-mismatch' }>
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
