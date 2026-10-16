import type { ActualExtraction, PackageImport, Site } from './actual-model.ts'
import type { Conformance, ConformanceRow } from './conformance-model.ts'
import { cycles } from '../deps/graph.ts'

export type OverlayRule = 'undeclared-dependency' | 'member-cycle'
export type DependencyRule = ConformanceRow['rule'] | OverlayRule
export interface DependencyRow {
  readonly id: string
  readonly rule: DependencyRule
  readonly state: 'deviation' | 'unknown' | 'converged'
  readonly age: 'new' | 'stock' | 'unjudged'
  readonly member: string
  readonly targetMember?: string
  readonly key: string
  readonly reason: string
  readonly expected: string
  readonly sites: readonly Site[]
  readonly relation?: PackageImport
}
/** Workspace path the checker can name. Create only writes the packages form. */
export type MemberPath = string & { readonly __memberPath: unique symbol }

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
const BLOCKS = ['dependencies', 'peerDependencies', 'devDependencies'] as const

interface DependencyEvidence {
  readonly actual: ActualExtraction
  readonly conformance: Conformance
}

export function parseMemberPath(value: string): MemberPath | undefined {
  const parts = value.split('/')
  const [root, group, leaf] = parts
  const packages = parts.length === 3 && root === 'packages' && kebab(group) && kebab(leaf)
  const apps = parts.length === 2 && root === 'apps' && kebab(group)
  return packages || apps ? (value as MemberPath) : undefined
}

export function declaredWorkspaceNames(
  manifest: Record<string, unknown>,
  memberNames: ReadonlySet<string>,
): ReadonlySet<string> {
  const names = new Set<string>()
  for (const block of BLOCKS) {
    const value = manifest[block]
    if (!object(value)) continue
    for (const [name, range] of Object.entries(value)) {
      if (typeof range !== 'string') continue
      if (range.startsWith('workspace:') || memberNames.has(name)) names.add(name)
    }
  }
  return names
}

export function dependencyRows(
  evidence: DependencyEvidence,
  manifests: ReadonlyMap<string, Record<string, unknown>>,
): readonly DependencyRow[] {
  const memberNames = packageNames(manifests)
  return [
    ...evidence.conformance.rows.map(project),
    ...undeclared(evidence.actual.packageImports, manifests, memberNames),
    ...memberCycles(evidence.actual),
  ].sort((left, right) => left.id.localeCompare(right.id))
}

function kebab(value: string | undefined): value is string {
  return value !== undefined && KEBAB.test(value)
}

function packageNames(
  manifests: ReadonlyMap<string, Record<string, unknown>>,
): ReadonlySet<string> {
  const names = new Set<string>()
  for (const manifest of manifests.values()) {
    if (typeof manifest['name'] === 'string') names.add(manifest['name'])
  }
  return names
}

function project(row: ConformanceRow): DependencyRow {
  return {
    id: row.id,
    rule: row.rule,
    state: row.state,
    age: row.age,
    member: row.member,
    key: row.key,
    reason: row.reason,
    expected: row.expected,
    sites: row.sites,
    ...(row.targetMember === undefined ? {} : { targetMember: row.targetMember }),
    ...(row.relation === undefined ? {} : { relation: row.relation }),
  }
}

function importedPackageName(specifier: string): string | undefined {
  if (specifier.startsWith('.')) return undefined
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/')
    return scope !== undefined && name !== undefined && name !== '' ? `${scope}/${name}` : undefined
  }
  const name = specifier.split('/')[0]
  return name === undefined || name === '' ? undefined : name
}

function endpoints(
  edge: PackageImport,
): { readonly from: MemberPath; readonly to: MemberPath } | undefined {
  if (edge.target.kind !== 'workspace' || edge.target.member === edge.member) return undefined
  const from = parseMemberPath(edge.member)
  const to = parseMemberPath(edge.target.member)
  return from === undefined || to === undefined ? undefined : { from, to }
}

function earlier(left: PackageImport, right: PackageImport): boolean {
  return left.path < right.path || (left.path === right.path && left.line < right.line)
}

function undeclared(
  imports: readonly PackageImport[],
  manifests: ReadonlyMap<string, Record<string, unknown>>,
  memberNames: ReadonlySet<string>,
): DependencyRow[] {
  const grouped = new Map<string, PackageImport[]>()
  for (const edge of imports) {
    const ends = endpoints(edge)
    const name = importedPackageName(edge.specifier)
    if (ends === undefined || name === undefined) continue
    const manifest = manifests.get(ends.from)
    const declared =
      manifest === undefined ? new Set<string>() : declaredWorkspaceNames(manifest, memberNames)
    if (declared.has(name)) continue
    const key = `${ends.from}\u0000${name}`
    grouped.set(key, [...(grouped.get(key) ?? []), edge])
  }
  return [...grouped].map(([key, edges]) => {
    const [member, name] = key.split('\u0000')
    const sites = [...edges].sort((left, right) => (earlier(left, right) ? -1 : 1))
    const first = sites[0]
    const target = first?.target.kind === 'workspace' ? first.target.member : undefined
    return {
      id: JSON.stringify(['undeclared-dependency', member, name]),
      rule: 'undeclared-dependency' as const,
      state: 'deviation' as const,
      age: 'unjudged' as const,
      member: member ?? '',
      ...(target === undefined ? {} : { targetMember: target }),
      key: name ?? '',
      reason: '源码引用 workspace 包但未在 dependencies、peerDependencies 或 devDependencies 声明',
      expected: 'dependencies、peerDependencies 或 devDependencies',
      sites: sites.map(edge => ({ path: edge.path, line: edge.line })),
      ...(first === undefined ? {} : { relation: first }),
    }
  })
}

function memberCycles(actual: ActualExtraction): DependencyRow[] {
  const pairs = new Map<string, PackageImport>()
  for (const edge of actual.packageImports) {
    const ends = endpoints(edge)
    if (ends === undefined) continue
    const key = `${ends.from}\u0000${ends.to}`
    const current = pairs.get(key)
    if (current === undefined || earlier(edge, current)) pairs.set(key, edge)
  }
  const nodes = [
    ...new Set([
      ...actual.members.map(member => member.path),
      ...[...pairs.keys()].flatMap(key => key.split('\u0000')),
    ]),
  ]
  const edges = [...pairs].map(([key]) => {
    const [from, to] = key.split('\u0000')
    return { from: from ?? '', to: to ?? '' }
  })
  return cycles(nodes, edges).flatMap(component => {
    const first = component[0]
    const second = component[1]
    if (first === undefined || second === undefined) return []
    const inside = [...pairs.values()]
      .filter(
        edge =>
          edge.target.kind === 'workspace' &&
          component.includes(edge.member) &&
          component.includes(edge.target.member),
      )
      .sort((left, right) => (earlier(left, right) ? -1 : 1))
    return [
      {
        id: JSON.stringify(['member-cycle', component]),
        rule: 'member-cycle' as const,
        state: 'deviation' as const,
        age: 'unjudged' as const,
        member: first,
        targetMember: second,
        key: component.join(' '),
        reason: `成员之间成环：${component.join('、')}`,
        expected: '成员依赖不成环',
        sites: inside.map(edge => ({ path: edge.path, line: edge.line })),
      },
    ]
  })
}
