import {
  equalNodes,
  LockfileSyntaxError,
  parseLockfileYaml,
  type YamlMap,
  type YamlNode,
} from './pnpm-lockfile.ts'

export interface LockfileAffectedMember {
  readonly path: string
  readonly importerChanged: boolean
  readonly packages: readonly string[]
}

export type LockfileImpact =
  | { readonly kind: 'unchanged'; readonly reason: string }
  | {
      readonly kind: 'members'
      readonly members: readonly LockfileAffectedMember[]
      readonly reason: string
    }
  | { readonly kind: 'full'; readonly reason: string }

const SECTION_KEYS = new Set(['importers', 'packages', 'snapshots'])
const DERIVED_KEYS = new Set(['catalogs'])

interface Lockfile {
  readonly topLevel: ReadonlyMap<string, YamlNode>
  readonly importers: ReadonlyMap<string, YamlNode>
  readonly packages: ReadonlyMap<string, YamlNode>
  readonly snapshots: ReadonlyMap<string, YamlNode>
}

class UnmappableLockfile extends Error {
  readonly detail: string

  constructor(detail: string) {
    super(detail)
    this.name = 'UnmappableLockfile'
    this.detail = detail
  }
}

function sectionOf(root: YamlMap, name: string): ReadonlyMap<string, YamlNode> {
  const section = root.get(name)
  if (section === undefined) return new Map()
  if (!(section instanceof Map)) throw new UnmappableLockfile(`顶层 ${name} 不是映射`)
  return section
}

function readLockfile(source: string): Lockfile {
  const root = parseLockfileYaml(source)
  return {
    topLevel: new Map(
      [...root].filter(([key]) => !SECTION_KEYS.has(key) && !DERIVED_KEYS.has(key)),
    ),
    importers: sectionOf(root, 'importers'),
    packages: sectionOf(root, 'packages'),
    snapshots: sectionOf(root, 'snapshots'),
  }
}

function changedKeys(
  base: ReadonlyMap<string, YamlNode>,
  head: ReadonlyMap<string, YamlNode>,
): string[] {
  const keys = new Set([...base.keys(), ...head.keys()])
  return [...keys]
    .filter(key => {
      const left = base.get(key)
      const right = head.get(key)
      return left === undefined || right === undefined || !equalNodes(left, right)
    })
    .sort()
}

function list(items: readonly string[], top = 5): string {
  return items.length <= top
    ? items.join('、')
    : `${items.slice(0, top).join('、')} 等 ${items.length} 个`
}

const IMPORTER_DEPENDENCY_KEYS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const
const SNAPSHOT_DEPENDENCY_KEYS = ['dependencies', 'optionalDependencies'] as const

const packageIdOf = (snapshotId: string): string => snapshotId.split('(', 1)[0] ?? snapshotId

function snapshotIdOf(
  owner: string,
  name: string,
  version: string,
  snapshots: ReadonlyMap<string, YamlNode>,
): string | undefined {
  if (version.startsWith('link:')) return undefined
  const plain = `${name}@${version}`
  if (snapshots.has(plain)) return plain
  const head = version.split('(', 1)[0] ?? version
  if (head.indexOf('@', 1) !== -1 && snapshots.has(version)) return version
  throw new UnmappableLockfile(`${owner} 依赖的 ${name}@${version} 在 snapshots 里没有条目`)
}

function importerDependencies(path: string, entry: YamlNode): { name: string; version: string }[] {
  if (!(entry instanceof Map)) throw new UnmappableLockfile(`importer ${path} 不是映射`)
  return IMPORTER_DEPENDENCY_KEYS.flatMap(section => {
    const block = entry.get(section)
    if (block === undefined) return []
    if (!(block instanceof Map))
      throw new UnmappableLockfile(`importer ${path} 的 ${section} 不是映射`)
    return [...block].map(([name, item]) => {
      const version = item instanceof Map ? item.get('version') : undefined
      if (typeof version !== 'string')
        throw new UnmappableLockfile(`importer ${path} 的 ${section}.${name} 没有 version`)
      return { name, version }
    })
  })
}

function snapshotDependencies(id: string, entry: YamlNode): { name: string; version: string }[] {
  if (!(entry instanceof Map)) throw new UnmappableLockfile(`snapshot ${id} 不是映射`)
  return SNAPSHOT_DEPENDENCY_KEYS.flatMap(section => {
    const block = entry.get(section)
    if (block === undefined) return []
    if (!(block instanceof Map))
      throw new UnmappableLockfile(`snapshot ${id} 的 ${section} 不是映射`)
    return [...block].map(([name, version]) => {
      if (typeof version !== 'string')
        throw new UnmappableLockfile(`snapshot ${id} 的 ${section}.${name} 不是字符串`)
      return { name, version }
    })
  })
}

interface ReverseGraph {
  readonly dependents: ReadonlyMap<string, ReadonlySet<string>>
  readonly importers: ReadonlyMap<string, ReadonlySet<string>>
}

function addEdge(graph: Map<string, Set<string>>, to: string, from: string): void {
  const set = graph.get(to) ?? new Set<string>()
  set.add(from)
  graph.set(to, set)
}

function reverseGraph(lockfile: Lockfile): ReverseGraph {
  const dependents = new Map<string, Set<string>>()
  const importers = new Map<string, Set<string>>()
  for (const [path, entry] of lockfile.importers)
    for (const { name, version } of importerDependencies(path, entry)) {
      const id = snapshotIdOf(`importer ${path}`, name, version, lockfile.snapshots)
      if (id !== undefined) addEdge(importers, id, path)
    }
  for (const [id, entry] of lockfile.snapshots)
    for (const { name, version } of snapshotDependencies(id, entry)) {
      const target = snapshotIdOf(`snapshot ${id}`, name, version, lockfile.snapshots)
      if (target !== undefined) addEdge(dependents, target, id)
    }
  return { dependents, importers }
}

function importersDependingOn(seed: string, graph: ReverseGraph): Set<string> {
  const found = new Set<string>()
  const seen = new Set([seed])
  const queue = [seed]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const importer of graph.importers.get(next) ?? []) found.add(importer)
    for (const dependent of graph.dependents.get(next) ?? [])
      if (!seen.has(dependent)) {
        seen.add(dependent)
        queue.push(dependent)
      }
  }
  return found
}

function snapshotsOfChangedPackages(
  changedPackages: readonly string[],
  base: Lockfile,
  head: Lockfile,
): string[] {
  const all = [...new Set([...base.snapshots.keys(), ...head.snapshots.keys()])]
  return changedPackages.flatMap(packageId => {
    const matching = all.filter(id => packageIdOf(id) === packageId)
    if (matching.length === 0)
      throw new UnmappableLockfile(`packages 里变化的 ${packageId} 在 snapshots 里没有条目`)
    return matching
  })
}

function importersOfSeeds(
  seeds: readonly string[],
  base: Lockfile,
  head: Lockfile,
): Map<string, Set<string>> {
  const graphs = [reverseGraph(base), reverseGraph(head)]
  const byImporter = new Map<string, Set<string>>()
  for (const seed of seeds) {
    const importers = new Set(graphs.flatMap(graph => [...importersDependingOn(seed, graph)]))
    if (importers.size === 0)
      throw new UnmappableLockfile(`变化的 ${seed} 没有任何 importer 直接或间接依赖它`)
    for (const importer of importers) addEdge(byImporter, importer, seed)
  }
  return byImporter
}

const ROOT_IMPORTER = '.'

function mapImpact(base: Lockfile, head: Lockfile, known: ReadonlySet<string>): LockfileImpact {
  const topLevel = changedKeys(base.topLevel, head.topLevel)
  if (topLevel.length > 0)
    return { kind: 'full', reason: `lockfile 顶层 ${list(topLevel)} 有变化，判为全量` }
  const importers = changedKeys(base.importers, head.importers)
  const packages = changedKeys(base.packages, head.packages)
  const snapshots = changedKeys(base.snapshots, head.snapshots)
  if (importers.length === 0 && packages.length === 0 && snapshots.length === 0)
    return { kind: 'unchanged', reason: '两份 pnpm-lock.yaml 解析后等价' }
  if (importers.includes(ROOT_IMPORTER))
    return { kind: 'full', reason: '根 importer（.）的依赖有变化，判为全量' }
  const seeds = [
    ...new Set([...snapshots, ...snapshotsOfChangedPackages(packages, base, head)]),
  ].sort()
  const bySeed = importersOfSeeds(seeds, base, head)
  if (bySeed.has(ROOT_IMPORTER))
    return {
      kind: 'full',
      reason: `根 importer（.）依赖的 ${list([...(bySeed.get(ROOT_IMPORTER) ?? [])])} 有变化，判为全量`,
    }
  const paths = [...new Set([...importers, ...bySeed.keys()])].sort()
  const unknown = paths.filter(path => !known.has(path))
  if (unknown.length > 0)
    return { kind: 'full', reason: `importer ${list(unknown)} 不在成员清单里，判为全量` }
  const members = paths.map(path => ({
    path,
    importerChanged: importers.includes(path),
    packages: [...(bySeed.get(path) ?? [])].sort(),
  }))
  return {
    kind: 'members',
    members,
    reason:
      `lockfile 改动按 importer 映射到 ${members.length} 个成员：${list(paths)}` +
      `（importer 条目变化 ${importers.length} 个、packages 变化 ${packages.length} 个、snapshots 变化 ${snapshots.length} 个）`,
  }
}

function readSide(side: string, source: string): Lockfile | string {
  try {
    return readLockfile(source)
  } catch (error) {
    if (error instanceof LockfileSyntaxError || error instanceof UnmappableLockfile)
      return `${side} pnpm-lock.yaml 解析失败（${error.message}），判为全量`
    throw error
  }
}

export function lockfileImpact(
  base: string,
  head: string,
  members: readonly { readonly path: string }[],
): LockfileImpact {
  const baseLockfile = readSide('基线的', base)
  if (typeof baseLockfile === 'string') return { kind: 'full', reason: baseLockfile }
  const headLockfile = readSide('HEAD 的', head)
  if (typeof headLockfile === 'string') return { kind: 'full', reason: headLockfile }
  try {
    return mapImpact(baseLockfile, headLockfile, new Set(members.map(member => member.path)))
  } catch (error) {
    if (error instanceof UnmappableLockfile)
      return { kind: 'full', reason: `lockfile 改动解释不了（${error.detail}），判为全量` }
    throw error
  }
}

const CATALOG_KEYS = new Set(['catalog', 'catalogs'])

export type WorkspaceImpact =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'catalog-only'; readonly reason: string }
  | { readonly kind: 'full'; readonly reason: string }

function readWorkspace(side: string, source: string): YamlMap | string {
  try {
    return parseLockfileYaml(source)
  } catch (error) {
    if (error instanceof LockfileSyntaxError)
      return `${side} pnpm-workspace.yaml 解析失败（${error.message}），判为全量`
    throw error
  }
}

export function workspaceImpact(base: string, head: string): WorkspaceImpact {
  if (base === head) return { kind: 'unchanged' }
  const baseRoot = readWorkspace('基线的', base)
  if (typeof baseRoot === 'string') return { kind: 'full', reason: baseRoot }
  const headRoot = readWorkspace('HEAD 的', head)
  if (typeof headRoot === 'string') return { kind: 'full', reason: headRoot }
  const changed = changedKeys(baseRoot, headRoot)
  if (changed.length === 0) return { kind: 'unchanged' }
  const others = changed.filter(key => !CATALOG_KEYS.has(key))
  if (others.length > 0)
    return { kind: 'full', reason: `pnpm-workspace.yaml 的 ${list(others)} 有变化，判为全量` }
  return { kind: 'catalog-only', reason: `pnpm-workspace.yaml 只有 ${list(changed)} 有变化` }
}
