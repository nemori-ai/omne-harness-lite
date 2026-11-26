import type { Context } from '@deepseek-ai/cordis'
import { edgesOf, startsAfter, stopsAfter, type RowEdges } from '@omne-harness/assembly'
import { liveEdges, type StartOrder } from '@omne-harness/assembly-cordis/cordis'
import type { LoadedRow } from './readiness.ts'
import type { RowId, RowManifest } from './types.ts'

type Declared = Readonly<{ row: Readonly<{ id: RowId }>; manifest: RowManifest }>

const declaredEdges = (rows: readonly Declared[]): RowEdges =>
  edgesOf(
    rows.map(({ row, manifest }) => ({
      name: row.id,
      provides: manifest.provides,
      injects: manifest.injects,
    })),
  )

export type RowOrder = Readonly<{
  edges: RowEdges
  /** `consumer>provider` for every edge the live tree has and no manifest declares. */
  undeclared: readonly string[]
}>

/** What the rows declare, joined with what the live tree has: a manifest does not list what a child fiber injects. */
export function rowOrder(
  rows: readonly Declared[],
  live?: Readonly<{ root: Context; loaded: readonly LoadedRow[] }>,
): RowOrder {
  const declared = declaredEdges(rows)
  if (live === undefined) return { edges: declared, undeclared: [] }
  const seen = liveEdges(live.root, live.loaded)
  const undeclared: string[] = []
  const edges = new Map(
    [...declared].map(([row, needed]) => {
      const extra = (seen.get(row) ?? []).filter(other => !needed.includes(other))
      undeclared.push(...extra.map(other => `${row}>${other}`))
      return [row, [...needed, ...extra]]
    }),
  )
  return { edges, undeclared }
}

/** A row starts after the rows it needs; the rows that open admission start once every other has. */
export function startOrderOf(order: RowOrder, rows: readonly Declared[]): StartOrder {
  const admission = rows.filter(({ manifest }) => manifest.phase === 'entry')
  return { after: startsAfter(order.edges), last: new Set(admission.map(({ row }) => row.id)) }
}

export const stopOrderOf = (order: RowOrder): ReadonlyMap<RowId, readonly RowId[]> =>
  stopsAfter(order.edges) as ReadonlyMap<RowId, readonly RowId[]>
