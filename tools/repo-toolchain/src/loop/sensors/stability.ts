import type { ImportSite } from '../../deps/graph.ts'

export interface StabilityEdge {
  readonly from: string
  readonly fromInstability: number
  readonly to: string
  readonly toInstability: number
  readonly site: ImportSite | undefined
}

export function stableOnUnstable(
  members: readonly { readonly path: string; readonly instability: number }[],
  edges: readonly {
    readonly from: string
    readonly to: string
    readonly sites: readonly ImportSite[]
  }[],
  margin: number,
): StabilityEdge[] {
  const instability = new Map(members.map(member => [member.path, member.instability]))
  const found: StabilityEdge[] = []
  for (const edge of edges) {
    const from = instability.get(edge.from)
    const to = instability.get(edge.to)
    if (from === undefined || to === undefined || !(to - from > margin)) continue
    found.push({
      from: edge.from,
      fromInstability: from,
      to: edge.to,
      toInstability: to,
      site: edge.sites[0],
    })
  }
  return found.sort(
    (a, b) =>
      b.toInstability - b.fromInstability - (a.toInstability - a.fromInstability) ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to),
  )
}
