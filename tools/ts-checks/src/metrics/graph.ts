import { isTestPath, type SourceFile } from '../rule.ts'
import { lineAt } from '../source-text.ts'
import { syntaxImports, syntaxOf } from '../syntax.ts'

const SCOPE = '@omne-harness-lite/'

/** workspace 成员：`packages/<组>/<包>`、`apps/<应用>`、`examples/<示例>`。 */
export interface Member {
  /** 仓库相对路径，也是图节点的键。 */
  readonly path: string
  /** `packages/<组>`、`apps` 或 `examples`。键用路径，`packages/tools` 不与根 `tools/` 混淆。 */
  readonly group: string
  /** 目录名；本仓库里等于包名去掉 scope。 */
  readonly name: string
}

export interface ImportSite {
  readonly path: string
  readonly line: number
  readonly specifier: string
}

export interface MemberEdge {
  readonly from: string
  readonly to: string
  readonly sites: readonly ImportSite[]
}

export interface MemberGraph {
  readonly members: readonly Member[]
  readonly edges: readonly MemberEdge[]
}

/** 路径相对于仓库根。 */
export function memberOf(path: string): Member | undefined {
  const match =
    /^(packages\/[^/]+)\/([^/]+)\//u.exec(path) ?? /^(apps|examples)\/([^/]+)\//u.exec(path)
  const group = match?.[1]
  const name = match?.[2]
  if (group === undefined || name === undefined) return undefined
  return { path: `${group}/${name}`, group, name }
}

function isProductSource(path: string, member: Member): boolean {
  return path.startsWith(`${member.path}/src/`) && !isTestPath(path)
}

/** 由产品源码（不含测试）的字面导入得到成员间的边；自导入不算边。 */
export function memberGraph(files: readonly SourceFile[]): MemberGraph {
  const members = new Map<string, Member>()
  for (const file of files) {
    const member = memberOf(file.path)
    if (member !== undefined && !members.has(member.path)) members.set(member.path, member)
  }
  return {
    members: [...members.values()].sort((a, b) => a.path.localeCompare(b.path)),
    edges: memberEdges(files, [...members.values()]),
  }
}

/**
 * 这些文件里的产品源码指向给定成员的边，按 `from`、`to` 排好。导入按包名对到 `members`，
 * 同名的成员以后出现的为准；`files` 可以只是部分文件（例如某个提交上的改动文件）。
 */
export function memberEdges(
  files: readonly SourceFile[],
  members: readonly Member[],
): MemberEdge[] {
  const byName = new Map<string, Member>()
  for (const member of members) byName.set(member.name, member)

  const edges = new Map<string, { from: string; to: string; sites: ImportSite[] }>()
  for (const file of files) {
    const from = memberOf(file.path)
    if (from === undefined || !isProductSource(file.path, from)) continue
    for (const ref of syntaxImports(syntaxOf(file))) {
      const specifier = ref.specifier
      if (specifier === undefined || !specifier.startsWith(SCOPE)) continue
      const target = byName.get(specifier.slice(SCOPE.length).split('/')[0] ?? '')
      if (target === undefined || target.path === from.path) continue
      const key = `${from.path}\u0000${target.path}`
      let edge = edges.get(key)
      if (edge === undefined) {
        edge = { from: from.path, to: target.path, sites: [] }
        edges.set(key, edge)
      }
      edge.sites.push({ path: file.path, line: lineAt(file.text, ref.index), specifier })
    }
  }
  return [...edges.values()].sort((a, b) =>
    a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
  )
}

/** 强连通分量里节点数大于一的那些，即环；节点按字典序。 */
export function cycles(
  nodes: readonly string[],
  edges: readonly { readonly from: string; readonly to: string }[],
): string[][] {
  const next = new Map<string, string[]>()
  for (const node of nodes) next.set(node, [])
  for (const edge of edges) next.get(edge.from)?.push(edge.to)

  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []

  const connect = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)
    for (const target of next.get(node) ?? []) {
      if (!index.has(target)) {
        connect(target)
        low.set(node, Math.min(low.get(node) ?? 0, low.get(target) ?? 0))
      } else if (onStack.has(target)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(target) ?? 0))
      }
    }
    if (low.get(node) !== index.get(node)) return
    const component: string[] = []
    for (;;) {
      const top = stack.pop()
      if (top === undefined) break
      onStack.delete(top)
      component.push(top)
      if (top === node) break
    }
    if (component.length > 1) found.push(component.sort())
  }
  for (const node of [...nodes].sort()) if (!index.has(node)) connect(node)
  return found.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
}

/** 组的层位与装配独占；每条判据的权威是 `source` 指向的设计正文，这里只是它的机检投影。 */
export interface GroupDirectionPolicy {
  /** 内层在前。依赖只能指向同层或更内层；同层之间只查环。 */
  readonly layers: readonly { readonly groups: readonly string[]; readonly source: string }[]
  /** 只许最外层与本组自己依赖的组。 */
  readonly assemblyOnly: readonly { readonly group: string; readonly source: string }[]
  /** 现存且明确记下来的例外：成员路径到成员路径。 */
  readonly exceptions: readonly {
    readonly from: string
    readonly to: string
    readonly reason: string
  }[]
}

export type DirectionFindingKind =
  'unregistered-group' | 'outward-dependency' | 'assembly-only' | 'member-cycle' | 'group-cycle'

export interface DirectionFinding {
  readonly kind: DirectionFindingKind
  readonly message: string
  /** 可定位的导入处；环取环上各边的首个导入处。 */
  readonly sites: readonly ImportSite[]
  /** 涉及的成员边；组未登记时为空。 */
  readonly edges: readonly { readonly from: string; readonly to: string }[]
}

export function evaluateDirection(
  graph: MemberGraph,
  policy: GroupDirectionPolicy,
): DirectionFinding[] {
  const layerOf = new Map<string, number>()
  policy.layers.forEach((layer, index) => {
    for (const group of layer.groups) layerOf.set(group, index)
  })
  const outermost = policy.layers.length - 1
  const assemblyOnly = new Set(policy.assemblyOnly.map(entry => entry.group))
  const excepted = new Set(policy.exceptions.map(entry => `${entry.from}\u0000${entry.to}`))
  const groupOf = new Map(graph.members.map(member => [member.path, member.group]))
  const findings: DirectionFinding[] = []

  const unregistered = [...new Set(graph.members.map(member => member.group))]
    .filter(group => !layerOf.has(group))
    .sort()
  for (const group of unregistered)
    findings.push({
      kind: 'unregistered-group',
      message: `组 ${group} 没有登记层位；先在设计正文定它的层位，再登记进方向策略`,
      sites: [],
      edges: [],
    })

  for (const edge of graph.edges) {
    const fromGroup = groupOf.get(edge.from)
    const toGroup = groupOf.get(edge.to)
    if (fromGroup === undefined || toGroup === undefined) continue
    const fromLayer = layerOf.get(fromGroup)
    const toLayer = layerOf.get(toGroup)
    if (fromLayer === undefined || toLayer === undefined) continue
    if (excepted.has(`${edge.from}\u0000${edge.to}`)) continue
    const pair = [{ from: edge.from, to: edge.to }]
    if (fromLayer < toLayer)
      findings.push({
        kind: 'outward-dependency',
        message: `${edge.from} 依赖了更外层的 ${edge.to}；依赖只能指向同层或更内层`,
        sites: edge.sites,
        edges: pair,
      })
    else if (assemblyOnly.has(toGroup) && fromGroup !== toGroup && fromLayer !== outermost)
      findings.push({
        kind: 'assembly-only',
        message: `${edge.from} 直接依赖了 ${edge.to}；${toGroup} 只由装配层选用`,
        sites: edge.sites,
        edges: pair,
      })
  }

  const firstSite = (from: string, to: string): ImportSite[] => {
    const site = graph.edges.find(edge => edge.from === from && edge.to === to)?.sites[0]
    return site === undefined ? [] : [site]
  }
  for (const component of cycles(
    graph.members.map(member => member.path),
    graph.edges,
  )) {
    const inside = graph.edges.filter(
      edge => component.includes(edge.from) && component.includes(edge.to),
    )
    findings.push({
      kind: 'member-cycle',
      message: `成员之间成环：${component.join('、')}`,
      sites: inside.flatMap(edge => firstSite(edge.from, edge.to)),
      edges: inside.map(edge => ({ from: edge.from, to: edge.to })),
    })
  }

  const groupEdges = new Map<string, { from: string; to: string }>()
  for (const edge of graph.edges) {
    const from = groupOf.get(edge.from)
    const to = groupOf.get(edge.to)
    if (from !== undefined && to !== undefined && from !== to)
      groupEdges.set(`${from}\u0000${to}`, { from, to })
  }
  for (const component of cycles([...new Set(groupOf.values())], [...groupEdges.values()])) {
    const inside = graph.edges.filter(edge => {
      const from = groupOf.get(edge.from)
      const to = groupOf.get(edge.to)
      return (
        from !== undefined &&
        to !== undefined &&
        from !== to &&
        component.includes(from) &&
        component.includes(to)
      )
    })
    findings.push({
      kind: 'group-cycle',
      message: `组之间成环：${component.join('、')}`,
      sites: inside.flatMap(edge => firstSite(edge.from, edge.to)),
      edges: inside.map(edge => ({ from: edge.from, to: edge.to })),
    })
  }
  return findings
}
