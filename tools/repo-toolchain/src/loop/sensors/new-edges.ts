// 相对基线新增的跨成员依赖：当前图与基线合并点上的图都由 dependency-cruiser 算，这里只比边集。
import type { ImportSite, MemberEdge } from '../../deps/graph.ts'

export interface EdgeChange {
  readonly from: string
  readonly to: string
  /** 第一个导入处：新增的取当前的，消失的取合并点上的。 */
  readonly site: ImportSite | undefined
}

export interface EdgeDelta {
  readonly added: readonly EdgeChange[]
  /** 参考：基线上有、现在没有的边。 */
  readonly removed: readonly EdgeChange[]
}

type Edge = Pick<MemberEdge, 'from' | 'to' | 'sites'>
const key = (edge: { readonly from: string; readonly to: string }) => `${edge.from}\u0000${edge.to}`
const change = (edge: Edge): EdgeChange => ({ from: edge.from, to: edge.to, site: edge.sites[0] })

export function edgeDelta(head: readonly Edge[], base: readonly Edge[]): EdgeDelta {
  const before = new Set(base.map(key))
  const after = new Set(head.map(key))
  return {
    added: head.filter(edge => !before.has(key(edge))).map(change),
    removed: base.filter(edge => !after.has(key(edge))).map(change),
  }
}
