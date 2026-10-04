// 相对基线新增的跨成员依赖。基线上的边集不另跑一遍全仓：
// HEAD 的边里，导入处全部落在改动过的文件里的那些先去掉，再并上「改动过的产品源码在合并点的文本」解析出的边。
// 没改动的文件在两边一样，所以这样得到的就是合并点上的边集。
import { memberEdges, type ImportSite, type Member, type MemberEdge } from '../../metrics/graph.ts'
import type { SourceFile } from '../../rule.ts'

export interface EdgeChange {
  readonly from: string
  readonly to: string
  /** 第一个导入处：新增的取 HEAD 上的，消失的取合并点上的。 */
  readonly site: ImportSite | undefined
}

export interface EdgeDelta {
  readonly added: readonly EdgeChange[]
  /** 参考：基线上有、现在没有的边。 */
  readonly removed: readonly EdgeChange[]
}

const key = (edge: { readonly from: string; readonly to: string }) => `${edge.from}\u0000${edge.to}`

/**
 * @param headEdges HEAD 上的边（导入处要全，不能截断）。
 * @param members HEAD 上的成员与只在基线上有的成员，用来把基线文本里的包名对到成员。
 * @param changedPaths 合并点到当前工作树改动过的全部路径，含删除。
 * @param baseFiles 改动过的产品源码在合并点的文本；基线上没有的文件不在其中。
 */
export function edgeDelta(input: {
  readonly headEdges: readonly MemberEdge[]
  readonly members: readonly Member[]
  readonly changedPaths: ReadonlySet<string>
  readonly baseFiles: readonly SourceFile[]
}): EdgeDelta {
  const kept = input.headEdges.filter(edge =>
    edge.sites.some(site => !input.changedPaths.has(site.path)),
  )
  const base = new Map<string, EdgeChange>()
  for (const edge of kept)
    base.set(key(edge), { from: edge.from, to: edge.to, site: edge.sites[0] })
  for (const edge of memberEdges(input.baseFiles, input.members))
    if (!base.has(key(edge)))
      base.set(key(edge), { from: edge.from, to: edge.to, site: edge.sites[0] })

  const head = new Set(input.headEdges.map(key))
  return {
    added: input.headEdges
      .filter(edge => !base.has(key(edge)))
      .map(edge => ({ from: edge.from, to: edge.to, site: edge.sites[0] })),
    removed: [...base.values()].filter(edge => !head.has(key(edge))),
  }
}
