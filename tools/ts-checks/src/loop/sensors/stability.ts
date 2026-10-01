// 稳定的成员依赖了不稳定的成员：一条边 from → to，若 I(to) − I(from) 大于 margin 就列出。
// I 是度量报告里成员的不稳定度 出 /（入 + 出），越接近 1 越容易被改动牵连。
import type { ImportSite } from '../../metrics/graph.ts'

export interface StabilityEdge {
  readonly from: string
  readonly fromInstability: number
  readonly to: string
  readonly toInstability: number
  /** 第一个导入处。 */
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
