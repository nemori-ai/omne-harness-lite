import { isDeepStrictEqual } from 'node:util'
import type { PreflightResult } from './preflight.ts'
import type { SnapshotTable, SnapshotView } from './maintenance.ts'

function ordered(table: SnapshotTable): SnapshotTable {
  const byName = (a: { readonly name: string }, b: { readonly name: string }) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  return {
    ...table,
    columns: table.columns.toSorted(byName),
    indexes: table.indexes.toSorted(byName),
    foreignKeys: table.foreignKeys.toSorted((a, b) => {
      const left = JSON.stringify([a.table, a.from, a.to, a.onUpdate, a.onDelete])
      const right = JSON.stringify([b.table, b.from, b.to, b.onUpdate, b.onDelete])
      return left < right ? -1 : left > right ? 1 : 0
    }),
  }
}

/** Owner-specific expectations; assembly separately rejects unowned extra objects. */
export function checkSnapshotTables(
  view: Pick<SnapshotView, 'structure'>,
  expected: readonly SnapshotTable[],
  check: string,
): PreflightResult {
  for (const table of expected) {
    const found = view.structure.tables.filter(candidate => candidate.name === table.name)
    const actual = found[0]
    if (
      found.length !== 1 ||
      actual === undefined ||
      !isDeepStrictEqual(ordered(actual), ordered(table))
    )
      return { ok: false, check, detail: 'the snapshot does not have the expected owner structure' }
  }
  return { ok: true }
}
