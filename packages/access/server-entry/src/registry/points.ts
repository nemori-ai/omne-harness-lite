import { CATALOG, list, type Contract, type Registry } from '@omne-harness/dynamis'
import type { PointFact } from './registry.ts'

/** What the points are read from: the declarations, and what is put on the points with public keys. */
function sources(registry: Registry, open: ReadonlySet<string>): readonly unknown[] {
  const read = registry.placed.filter(placed => placed.point === CATALOG || open.has(placed.point))
  return [registry.retiring.length, ...read]
}

export type Points = Readonly<{ facts: readonly PointFact[]; from: readonly unknown[] }>

export const noPoints: Points = Object.freeze({ facts: Object.freeze([]), from: Object.freeze([]) })

/** The points declared on this tree, by name; the keys now on a point only where it makes them public. */
export function points(registry: Registry, last: Points = noPoints): Points {
  const open = new Set(last.facts.filter(fact => fact.keys !== undefined).map(fact => fact.name))
  const from = sources(registry, open)
  // Nothing they are read from changed: the same facts, without reading the catalog again.
  if (from.length === last.from.length && from.every((each, index) => each === last.from[index]))
    return last
  const declared = list<Contract>(registry, CATALOG, null, [])
  // Unread is not empty: the catalog keeps what was last read, a point that is unread tells no keys.
  if (declared.kind !== 'read') return { facts: last.facts, from }
  const facts = declared.items.map(({ entry }): PointFact => {
    const { name, version: major, revision, keys } = entry.item
    const fact = { name, major, revision, rules: entry.digest }
    if (keys !== 'public') return fact
    const listing = list(registry, name, null, [])
    if (listing.kind !== 'read') return fact
    return { ...fact, keys: [...new Set(listing.items.map(item => item.entry.key))].sort() }
  })
  facts.sort((left, right) => (left.name < right.name ? -1 : 1))
  const now = new Set(facts.filter(fact => fact.keys !== undefined).map(fact => fact.name))
  return { facts, from: sources(registry, now) }
}
