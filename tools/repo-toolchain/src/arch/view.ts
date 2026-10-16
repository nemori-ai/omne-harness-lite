import { dirname } from 'node:path'
import { bandOf, spread, type Bands, type Band } from '../metrics/report.ts'
import type { ActualArchitecture, ActualArchitectureDocument, ObservedFact } from './actual.ts'
import type { SourceCoordinates } from './source.ts'
import type { Fact, PackageImport } from './actual-model.ts'

export const RELATIONS = {
  'runtime-import': '运行导入',
  'type-import': '类型导入',
  defines: '服务定义',
  provides: '候选提供',
  injects: '必需服务',
  optional: '可选服务',
  'event-declaration': '事件定义',
  emits: '发布事件',
  listens: '订阅事件',
  contributes: '注册贡献',
  composition: '装配声明',
} as const
export type RelationKind = keyof typeof RELATIONS
export type Change = 'present' | 'added' | 'removed'
export interface ViewNode {
  readonly id: string
  readonly label: string
  readonly kind: 'member' | 'service' | 'event' | 'external' | 'group'
  readonly change: Change
  readonly member?: string
  readonly group?: string
  readonly category?: 'product' | 'development'
  readonly count?: number
  readonly complexity?: {
    readonly functions: number
    readonly risk: number
    readonly max: number
    readonly band: Band
  }
  readonly fanIn?: number
  readonly fanOut?: number
}
export interface ViewEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly kind: RelationKind
  readonly label: string
  readonly change: Change
  readonly evidence: readonly {
    readonly id: string
    readonly version: 'current' | 'baseline'
    readonly occurrences: readonly (Fact | PackageImport)[]
  }[]
}
export interface ArchitectureView {
  readonly conformance?: import('./conformance-model.ts').Conformance
  readonly schemaVersion: 1
  readonly kind: 'architecture-view'
  readonly source: SourceCoordinates
  readonly baseline?: SourceCoordinates
  readonly generatedAt: string
  readonly relations: typeof RELATIONS
  readonly groups: readonly (ViewNode & { readonly members: readonly string[] })[]
  readonly nodes: readonly ViewNode[]
  readonly edges: readonly ViewEdge[]
  readonly overviewEdges: readonly ViewEdge[]
  readonly document: ActualArchitectureDocument
  readonly measurement: { readonly bands: Bands; readonly configSource: string }
}
export interface ViewSelection {
  readonly conformance?: boolean
  readonly group: string
  readonly focus: string
  readonly neighbors: boolean
  readonly changes: 'current' | 'all' | 'added' | 'removed' | 'changed'
  readonly relations: readonly RelationKind[]
  readonly complexity: boolean
  readonly coupling: boolean
}
export interface SelectedArchitecture {
  readonly conformance?: import('./conformance-model.ts').Conformance
  readonly schemaVersion: 1
  readonly kind: 'architecture-selection'
  readonly source: SourceCoordinates
  readonly baseline?: SourceCoordinates
  readonly selection: ViewSelection
  readonly overview: boolean
  readonly nodes: readonly ViewNode[]
  readonly edges: readonly ViewEdge[]
}

const nodeId = (kind: string, key: string) => JSON.stringify([kind, key])
const memberId = (path: string) => nodeId('member', path)
const groupOf = (path: string) => (path.startsWith('apps/') ? path : dirname(path))

/** Collapse only observed member-to-member edges. Shared keys cannot establish group bindings. */
function overviewEdges(nodes: readonly ViewNode[], edges: readonly ViewEdge[]): ViewEdge[] {
  const groups = new Map(
    nodes
      .filter(node => node.category === 'product' && node.group !== undefined)
      .map(node => [node.id, nodeId('group', node.group ?? '')]),
  )
  const result = new Map<string, ViewEdge>()
  for (const edge of edges) {
    const from = groups.get(edge.from),
      to = groups.get(edge.to)
    if (from === undefined || to === undefined || from === to) continue
    const id = JSON.stringify(['overview', from, to, edge.kind, edge.change])
    const previous = result.get(id)
    result.set(id, {
      id,
      from,
      to,
      kind: edge.kind,
      label: '',
      change: edge.change,
      evidence: [...(previous?.evidence ?? []), ...edge.evidence],
    })
  }
  return [...result.values()]
}

function memberNodes(
  current: ActualArchitecture,
  baseline: ActualArchitecture | undefined,
  bands: Bands,
): ViewNode[] {
  const old = new Set(baseline?.members.map(member => member.id))
  const next = new Set(current.members.map(member => member.id))
  const members = [
    ...current.members,
    ...(baseline?.members.filter(member => !next.has(member.id)) ?? []),
  ]
  return members.map(member => {
    const removed = !next.has(member.id)
    const scores =
      (removed ? baseline : current)?.complexity.functions
        .filter(fn => fn.member === member.path)
        .map(fn => fn.complexity) ?? []
    const stats = spread(scores)
    return {
      id: memberId(member.path),
      label: member.name,
      kind: 'member',
      member: member.path,
      group: groupOf(member.path),
      category: member.category,
      change: removed
        ? 'removed'
        : baseline !== undefined && !old.has(member.id)
          ? 'added'
          : 'present',
      complexity: {
        functions: scores.length,
        risk: stats.risk,
        max: stats.max,
        band: bandOf(stats.risk, bands),
      },
    }
  })
}

function factTarget(
  fact: ObservedFact,
): { kind: 'member' | 'service' | 'event'; key: string } | undefined {
  if (fact.kind === 'plugin') return undefined
  if (fact.kind === 'composition')
    return fact.target === undefined ? undefined : { kind: 'member', key: fact.target }
  if (['event-declaration', 'emits', 'listens'].includes(fact.kind))
    return { kind: 'event', key: fact.key }
  return { kind: 'service', key: fact.key }
}

/** A derived browsing projection. Same service/event name never asserts runtime binding. */
export function buildArchitectureView(
  document: ActualArchitectureDocument,
  bands: Bands,
  configSource = 'tools/repo-toolchain/metrics.config.json (running tool)',
): ArchitectureView {
  const nodes = new Map(
    memberNodes(document.current, document.baseline, bands).map(node => [node.id, node]),
  )
  const edges = new Map<string, ViewEdge & { evidence: ViewEdge['evidence'][number][] }>()
  const add = (
    from: string,
    to: string,
    kind: RelationKind,
    label: string,
    change: Change,
    evidence: ViewEdge['evidence'][number],
  ): void => {
    if (from === to) return
    const id = JSON.stringify([from, to, kind, label, change])
    const existing = edges.get(id)
    if (existing !== undefined) existing.evidence.push(evidence)
    else edges.set(id, { id, from, to, kind, label, change, evidence: [evidence] })
  }
  const ensure = (
    kind: 'service' | 'event' | 'external' | 'member',
    key: string,
    change: Change,
  ): string => {
    const id = nodeId(kind, key)
    const existing = nodes.get(id)
    if (existing === undefined) nodes.set(id, { id, kind, label: key, change })
    else if (existing.change === 'removed' && change !== 'removed')
      nodes.set(id, { ...existing, change })
    return id
  }
  const read = (value: ActualArchitecture, version: 'current' | 'baseline'): void => {
    const removedFacts = new Set(document.difference?.facts.removed.map(item => item.id))
    const removedImports = new Set(document.difference?.imports.removed.map(item => item.id))
    const addedFacts = new Set(document.difference?.facts.added.map(item => item.id))
    const addedImports = new Set(document.difference?.imports.added.map(item => item.id))
    for (const fact of value.facts) {
      if (version === 'baseline' && !removedFacts.has(fact.id)) continue
      const target = factTarget(fact)
      if (target === undefined) continue
      const change =
        version === 'baseline' ? 'removed' : addedFacts.has(fact.id) ? 'added' : 'present'
      const to = ensure(target.kind, target.key, change)
      const kind = fact.kind
      if (kind === 'plugin') continue
      add(
        memberId(fact.member),
        to,
        kind,
        fact.key + (fact.mode === undefined ? '' : ` [${fact.mode}]`),
        change,
        { id: fact.id, version, occurrences: fact.occurrences },
      )
    }
    for (const item of value.imports) {
      if (version === 'baseline' && !removedImports.has(item.id)) continue
      if (item.target.kind === 'unresolved-local') continue
      const change =
        version === 'baseline' ? 'removed' : addedImports.has(item.id) ? 'added' : 'present'
      const to =
        item.target.kind === 'workspace'
          ? ensure('member', item.target.member, change)
          : ensure('external', item.specifier, change)
      add(memberId(item.member), to, item.type ? 'type-import' : 'runtime-import', '', change, {
        id: item.id,
        version,
        occurrences: item.occurrences,
      })
    }
  }
  read(document.current, 'current')
  if (document.baseline !== undefined) read(document.baseline, 'baseline')
  // Named keys are shared graph ports. A new reference to an old key does not make the key new.
  if (document.baseline !== undefined) {
    const oldKeys = new Set(
      document.baseline.facts.flatMap(fact => {
        const target = factTarget(fact)
        return target === undefined ? [] : [nodeId(target.kind, target.key)]
      }),
    )
    for (const item of document.baseline.imports)
      if (item.target.kind === 'external') oldKeys.add(nodeId('external', item.specifier))
    for (const [id, node] of nodes)
      if (node.change === 'added' && oldKeys.has(id)) nodes.set(id, { ...node, change: 'present' })
  }
  const incoming = new Map<string, Set<string>>(),
    outgoing = new Map<string, Set<string>>()
  for (const edge of edges.values()) {
    if (edge.change === 'removed') continue
    const inc = incoming.get(edge.to) ?? new Set<string>(),
      out = outgoing.get(edge.from) ?? new Set<string>()
    inc.add(edge.from)
    out.add(edge.to)
    incoming.set(edge.to, inc)
    outgoing.set(edge.from, out)
  }
  const all = [...nodes.values()].map(node => ({
    ...node,
    fanIn: incoming.get(node.id)?.size ?? 0,
    fanOut: outgoing.get(node.id)?.size ?? 0,
  }))
  const grouped = new Map<string, ViewNode[]>()
  for (const node of all) {
    if (node.category !== 'product' || node.group === undefined) continue
    const group = grouped.get(node.group) ?? []
    group.push(node)
    grouped.set(node.group, group)
  }
  const groups = [...grouped]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, items]) => ({
      id: nodeId('group', group),
      kind: 'group' as const,
      label: group,
      group,
      count: items.filter(item => item.change !== 'removed').length,
      change: items.every(item => item.change === 'removed')
        ? ('removed' as const)
        : items.every(item => item.change === 'added')
          ? ('added' as const)
          : ('present' as const),
      members: items.map(item => item.id),
      complexity: {
        functions: items.reduce((sum, item) => sum + (item.complexity?.functions ?? 0), 0),
        risk: Math.max(0, ...items.map(item => item.complexity?.risk ?? 0)),
        max: Math.max(0, ...items.map(item => item.complexity?.max ?? 0)),
        band: bandOf(Math.max(0, ...items.map(item => item.complexity?.risk ?? 0)), bands),
      },
      fanIn: new Set(items.flatMap(item => [...(incoming.get(item.id) ?? [])])).size,
      fanOut: new Set(items.flatMap(item => [...(outgoing.get(item.id) ?? [])])).size,
    }))
  return {
    schemaVersion: 1,
    kind: 'architecture-view',
    source: document.current.source,
    ...(document.baseline === undefined ? {} : { baseline: document.baseline.source }),
    generatedAt: document.generatedAt,
    relations: RELATIONS,
    groups,
    nodes: all,
    edges: [...edges.values()],
    overviewEdges: overviewEdges(all, [...edges.values()]),
    document,
    measurement: { bands, configSource },
  }
}

/** Self-contained function also used by the offline browser; selection and exports share one oracle. */
export function selectArchitectureView(
  graph: ArchitectureView,
  selection: ViewSelection,
): SelectedArchitecture {
  const matches = (change: Change) =>
    selection.changes === 'all' ||
    (selection.changes === 'current'
      ? change !== 'removed'
      : selection.changes === 'changed'
        ? change !== 'present'
        : change === selection.changes)
  const overview = selection.group === '' && selection.focus === ''
  const edges = graph.edges.filter(
    edge => selection.relations.includes(edge.kind) && matches(edge.change),
  )
  let nodes: readonly ViewNode[]
  let selectedEdges: readonly ViewEdge[] = []
  if (overview) {
    selectedEdges = graph.overviewEdges.filter(
      edge => selection.relations.includes(edge.kind) && matches(edge.change),
    )
    nodes = graph.groups.filter(
      group =>
        matches(group.change) ||
        group.members.some(id => edges.some(edge => edge.from === id || edge.to === id)),
    )
  } else {
    const seeds = new Set(
      selection.focus !== ''
        ? [selection.focus]
        : (graph.groups.find(group => group.group === selection.group)?.members ?? []),
    )
    const visible = new Set(seeds)
    const ports = new Set<string>()
    if (selection.neighbors) {
      for (const edge of edges) {
        if (seeds.has(edge.from)) visible.add(edge.to)
        if (seeds.has(edge.to)) visible.add(edge.from)
      }
      // A service/event name can expose declarations on both sides without selecting a provider.
      for (const id of graph.nodes
        .filter(node => visible.has(node.id) && ['service', 'event'].includes(node.kind))
        .map(node => node.id))
        ports.add(id)
      for (const edge of edges) if (ports.has(edge.to)) visible.add(edge.from)
    }
    selectedEdges = edges.filter(
      edge =>
        visible.has(edge.from) &&
        visible.has(edge.to) &&
        (seeds.has(edge.from) || seeds.has(edge.to) || ports.has(edge.to)),
    )
    const endpoints = new Set(selectedEdges.flatMap(edge => [edge.from, edge.to]))
    nodes = graph.nodes.filter(
      node => visible.has(node.id) && (matches(node.change) || endpoints.has(node.id)),
    )
    const ids = new Set(nodes.map(node => node.id))
    selectedEdges = selectedEdges.filter(edge => ids.has(edge.from) && ids.has(edge.to))
  }
  const visibleIds = new Set(
    nodes.flatMap(node =>
      node.kind === 'group'
        ? (graph.groups.find(group => group.id === node.id)?.members ?? [])
        : [node.id],
    ),
  )
  const visibleMembers = new Set(
    graph.nodes
      .filter(node => visibleIds.has(node.id))
      .flatMap(node => (node.member === undefined ? [] : [node.member])),
  )
  return {
    schemaVersion: 1,
    kind: 'architecture-selection',
    ...(graph.conformance === undefined
      ? {}
      : {
          conformance: {
            ...graph.conformance,
            rows: graph.conformance.rows.filter(
              row => visibleMembers.has(row.member) || visibleMembers.has(row.targetMember ?? ''),
            ),
          },
        }),
    source: graph.source,
    ...(graph.baseline === undefined ? {} : { baseline: graph.baseline }),
    selection,
    overview,
    nodes,
    edges: selectedEdges,
  }
}
