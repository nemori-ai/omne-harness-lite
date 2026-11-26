import { candidates, type Registry, type Scope } from '@omne-harness/dynamis'
import { RENDER_POINT, readChanges, type Known, type Names } from './change.ts'
import { standingDrawing, type DrawingSource } from './point.ts'

/** The points that draw by key and the parts whose drawings a projection lists. */
export type ProjectionRange = Readonly<{ points: readonly string[]; parts: readonly string[] }>

export type ProjectedDrawing = Readonly<{ point: string; key: string; source: DrawingSource }>

/** A drawing that counts here and has no source, so no other surface can make it. */
export type UnreachableDrawing = Readonly<{ point: string; key: string; by: readonly string[] }>

export type Projection = Readonly<{
  css: string
  drawings: readonly ProjectedDrawing[]
  unreachable: readonly UnreachableDrawing[]
}>

type Counted = Readonly<{
  point: string
  key: string
  source: DrawingSource | undefined
  by: readonly string[]
}>

function keysOn(registry: Registry, point: string, asker: Scope): readonly string[] {
  const read = candidates(registry, point, null, asker)
  return read.kind === 'read'
    ? Array.from(new Set(read.entries.map(entry => entry.key))).sort()
    : []
}

/** What the changes come to for one asker, as data another surface can take: the sheet, and each drawing in the range that counts, by its source. */
export function projectionOn(
  registry: Registry,
  asker: Scope,
  range: ProjectionRange,
  known: Known,
  names?: Names,
): Projection {
  const { changes, drawn } = readChanges(registry, asker, known, names)
  const byOf = (part: string): readonly string[] =>
    changes.standing.find(each => each.point === RENDER_POINT && each.key === part)?.by ?? []
  const parts = range.parts.flatMap((key): Counted[] => {
    const item = drawn.get(key)
    return item === undefined
      ? []
      : [{ point: RENDER_POINT, key, source: item.source, by: byOf(key) }]
  })
  const points = range.points.flatMap(point =>
    keysOn(registry, point, asker).flatMap((key): Counted[] => {
      const found = standingDrawing(registry, point, key, asker)
      return found === undefined ? [] : [{ point, key, source: found.item.source, by: found.by }]
    }),
  )
  const counted = [...parts, ...points]
  return {
    css: changes.css,
    drawings: counted.flatMap(({ point, key, source }) =>
      source === undefined ? [] : [{ point, key, source }],
    ),
    unreachable: counted.flatMap(({ point, key, source, by }) =>
      source === undefined ? [{ point, key, by }] : [],
    ),
  }
}
