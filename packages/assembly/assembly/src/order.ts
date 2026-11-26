/** For each row, the rows it depends on directly. */
export type RowEdges = ReadonlyMap<string, readonly string[]>

type Declared = Readonly<{
  name: string
  provides: readonly string[]
  injects: readonly string[]
}>

export function edgesOf(rows: readonly Declared[]): RowEdges {
  const providers = new Map<string, string[]>()
  for (const { name, provides } of rows)
    for (const key of provides) providers.set(key, [...(providers.get(key) ?? []), name])
  return new Map(
    rows.map(({ name, injects }) => [
      name,
      [...new Set(injects.flatMap(key => providers.get(key) ?? []))].filter(each => each !== name),
    ]),
  )
}

/** For each row, every row it needs: directly or through others. */
export function needsOf(edges: RowEdges): ReadonlyMap<string, ReadonlySet<string>> {
  const reach = (from: string): Set<string> => {
    const seen = new Set<string>()
    const pending = [...(edges.get(from) ?? [])]
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      if (seen.has(next) || next === from) continue
      seen.add(next)
      pending.push(...(edges.get(next) ?? []))
    }
    return seen
  }
  return new Map([...edges.keys()].map(row => [row, reach(row)]))
}

function ordered(
  edges: RowEdges,
  before: (needs: ReadonlyMap<string, ReadonlySet<string>>, row: string, other: string) => boolean,
): ReadonlyMap<string, readonly string[]> {
  const needs = needsOf(edges)
  const rows = [...edges.keys()]
  return new Map(
    rows.map(row => [row, rows.filter(other => other !== row && before(needs, row, other))]),
  )
}

const oneWay = (
  needs: ReadonlyMap<string, ReadonlySet<string>>,
  needy: string,
  needed: string,
): boolean => needs.get(needy)?.has(needed) === true && needs.get(needed)?.has(needy) !== true

/** A provider stops after whoever needs it. Rows that need each other have no order between them. */
export const stopsAfter = (edges: RowEdges): ReadonlyMap<string, readonly string[]> =>
  ordered(edges, (needs, row, other) => oneWay(needs, other, row))

/** A row starts after whatever it needs. */
export const startsAfter = (edges: RowEdges): ReadonlyMap<string, readonly string[]> =>
  ordered(edges, (needs, row, other) => oneWay(needs, row, other))
