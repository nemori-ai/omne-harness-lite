import type { ImportSite, MemberEdge } from '../../deps/graph.ts'

export interface EdgeChange {
  readonly from: string
  readonly to: string
  readonly site: ImportSite | undefined
}

export interface EdgeDelta {
  readonly added: readonly EdgeChange[]
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
