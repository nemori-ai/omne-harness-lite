// 锁文件的影响面：基线与 HEAD 两份 `pnpm-lock.yaml` 的差异落到哪些工作区成员上。纯函数，不读外部状态。
//
// 三种结论：两份等价（无影响）；差异能按 importer 映射到成员；判不准就全量，并写明为什么。
// 映射规则（卡「准入增量化」T3）：`importers:` 下有变化的条目，对应成员受影响；`packages:`、`snapshots:` 下有变化的包，
// 沿 snapshot 的 `dependencies`、`optionalDependencies` 反向走传递闭包，找到直接或间接依赖它的 importer。
// 顶层 `lockfileVersion`、`settings`、`overrides`、`patchedDependencies`、`catalogs` 有变化，或任一份解析失败，判全量；
// 其余顶层键（`packageExtensionsChecksum`、`pnpmfileChecksum` 等）这里不认识它们的影响范围，有变化同样判全量。
// 根 importer（`.`）的依赖是全仓的工具，它变了判全量；importer 不在成员清单里、依赖引用的 snapshot 找不到、
// 变化的包没有任何 importer 依赖它——这些都是这里解释不了的锁文件，判全量，不按猜的范围少跑。
//
// 结果只含锁文件里直接受影响的 importer（种子）。它们在工作区里的下游（经 `link:` 依赖它们的成员）不在这里展开：
// 成员间的依赖图只有 turbo 一份（scope.ts 的 `dependents`），调用方按它展开。
import {
  equalNodes,
  LockfileSyntaxError,
  parseLockfileYaml,
  type YamlMap,
  type YamlNode,
} from './pnpm-lockfile.ts'

/** 一个受影响的成员与原因：importer 条目本身变了，或它直接、间接依赖了这些变化的 snapshot。 */
export interface LockfileAffectedMember {
  readonly path: string
  readonly importerChanged: boolean
  /** 它依赖的、有变化的 snapshot（`名字@版本(peer…)`），按字典序。 */
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

/** 顶层这些键变了判全量；其余顶层键（除三个映射段外）变了也判全量，原因里写出键名。 */
const SECTION_KEYS = new Set(['importers', 'packages', 'snapshots'])

/** 解析后的一份锁文件：三段映射与其余顶层键。 */
interface Lockfile {
  readonly topLevel: ReadonlyMap<string, YamlNode>
  readonly importers: ReadonlyMap<string, YamlNode>
  readonly packages: ReadonlyMap<string, YamlNode>
  readonly snapshots: ReadonlyMap<string, YamlNode>
}

/** 锁文件里解释不了的结构：`detail` 写进全量的原因。 */
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
    topLevel: new Map([...root].filter(([key]) => !SECTION_KEYS.has(key))),
    importers: sectionOf(root, 'importers'),
    packages: sectionOf(root, 'packages'),
    snapshots: sectionOf(root, 'snapshots'),
  }
}

/** 两份映射里值不同（含只在一边有）的键，按字典序。 */
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

/** 列出前几个，多了写总数。 */
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

/** `snapshots:` 的键去掉 peer 后缀，就是 `packages:` 的键。 */
const packageIdOf = (snapshotId: string): string => snapshotId.split('(', 1)[0] ?? snapshotId

/**
 * 依赖项的 `版本` 对应的 snapshot 键：通常是 `名字@版本`；别名依赖（`npm:` 写法）的版本本身已是 `别名@版本`。
 * 两种都查，找到哪种用哪种；都没有就是解释不了的引用。`link:` 指向工作区成员，没有 snapshot。
 */
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

/** importer 条目各依赖段下的 `名字: { specifier, version }`。 */
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

/** snapshot 条目各依赖段下的 `名字: 版本`。 */
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

/** 反向依赖图：每个 snapshot 被哪些 snapshot 依赖、被哪些 importer 直接依赖。 */
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

/** 从一个 snapshot 反向走到头，直接或间接依赖它的全部 importer。 */
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

/** 变化的 `packages:` 条目对应的全部 snapshot（两份里的都算）；一个都没有的包解释不了。 */
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

/** 每个变化的 snapshot 在基线与 HEAD 两张图里各找一遍依赖它的 importer：去掉的包按基线图算，新加的按 HEAD 图算。 */
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

/** 读一份锁文件；认不出就返回全量的原因。 */
function readSide(side: string, source: string): Lockfile | string {
  try {
    return readLockfile(source)
  } catch (error) {
    if (error instanceof LockfileSyntaxError || error instanceof UnmappableLockfile)
      return `${side} pnpm-lock.yaml 解析失败（${error.message}），判为全量`
    throw error
  }
}

/**
 * 基线与 HEAD 两份 `pnpm-lock.yaml` 文本的差异落到哪些成员上；`members` 是工作区成员清单（取 `path`）。
 * 解析失败、顶层设置变化、解释不了的结构都判全量并写明原因；两份等价判无影响。
 */
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
