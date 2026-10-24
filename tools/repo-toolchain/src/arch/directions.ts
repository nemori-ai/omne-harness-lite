// 方向规则：schema 3 `constraints.json` 的 `directions` 对依赖图里文件级事实的判定。
// `omne-deps` 的方向发现与架构符合性报告的 `DIRECTION` 行都从这里算，输入是同一份可信 runner 的方向行与
// 同一份 dependency-cruiser 依赖事实（deps/graph.ts），不另走 arch/extract.ts 的静态抽取。
import { execFileSync } from 'node:child_process'
import { lstatSync, readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import { repositoryEnv } from '../core/git-environment.ts'
import {
  DependencyGraphUnavailable,
  memberOf,
  revisionGraph,
  workingGraph,
  type DependencyFinding,
  type DependencyGraph,
  type FileDependency,
} from '../deps/graph.ts'
import type {
  ArchitectureConstraints,
  ArchitectureDirection,
  ArchitectureRole,
  ConformanceRow,
} from './conformance-model.ts'
import { matchesRolePath, readRunnerConstraints, roleMember } from './constraints.ts'
import type { SourceCoordinates } from './source.ts'

/** 方向行按成员对展开：每条方向行 × 每个 from 角色 × 每个 to 角色一对。 */
export interface DirectionPair {
  readonly direction: ArchitectureDirection
  readonly from: ArchitectureRole
  readonly to: ArchitectureRole
  readonly fromMember: string
  readonly toMember: string
}
export interface DirectionHit {
  readonly pair: DirectionPair
  readonly dependency: FileDependency
}
export type DirectionPolicy = Pick<ArchitectureConstraints, 'roles' | 'directions'>
/** `omne-deps` 的方向发现：命中一条方向行，或源角色、目标角色在被检树里没有文件、不能判方向。 */
export type DirectionFinding = DependencyFinding<'direction-rule' | 'direction-unknown'>

export function directionPairs(policy: DirectionPolicy): DirectionPair[] {
  const roles = new Map(policy.roles.map(role => [role.id, role]))
  const role = (id: string): ArchitectureRole => {
    const found = roles.get(id)
    // parseConstraints 已经核对过每个引用；走到这里是把没校验过的值当成了策略。
    if (found === undefined)
      throw new Error(`Unvalidated direction policy: role ${id} not declared`)
    return found
  }
  return (policy.directions ?? []).flatMap(direction =>
    direction.from.map(role).flatMap(from =>
      direction.to.map(role).map(to => ({
        direction,
        from,
        to,
        fromMember: roleMember(from),
        toMember: roleMember(to),
      })),
    ),
  )
}

/** 成员对去重后的个数：`omne-deps` 汇总行用。 */
export function memberPairCount(pairs: readonly DirectionPair[]): number {
  return new Set(pairs.map(pair => `${pair.fromMember}\u0000${pair.toMember}`)).size
}

/** 文件按角色的 `paths` 落在角色里。命中判定与「角色有没有文件」都只用这一条规则，不取最精确的角色。 */
export const inRole = (path: string, role: ArchitectureRole): boolean =>
  role.paths.some(pattern => matchesRolePath(path, pattern))

const byPosition = (a: DirectionHit, b: DirectionHit): number =>
  a.dependency.path.localeCompare(b.dependency.path) ||
  a.dependency.line - b.dependency.line ||
  a.pair.direction.id.localeCompare(b.pair.direction.id) ||
  a.pair.from.id.localeCompare(b.pair.from.id) ||
  a.pair.to.id.localeCompare(b.pair.to.id)

/**
 * 命中：依赖所在模块落在某对的 from 角色的 `paths` 里，解析后的目标文件所在成员等于该对的 to 成员。
 * 目标在 `src/`、`dist/` 或声明文件里都算同一成员。一处依赖同时命中几对就记几次。
 */
function hitsOf(
  dependencies: readonly FileDependency[],
  pairs: readonly DirectionPair[],
): DirectionHit[] {
  const hits: DirectionHit[] = []
  for (const dependency of dependencies) {
    const target = memberOf(dependency.resolved)?.path
    if (target === undefined) continue
    for (const pair of pairs)
      if (pair.toMember === target && inRole(dependency.path, pair.from))
        hits.push({ pair, dependency })
  }
  return hits.sort(byPosition)
}

/** 一对里在被检树中匹配不到任何文件的角色，以及它在这一对里是源还是目标。 */
export interface EmptyRole {
  readonly side: 'source' | 'target'
  readonly role: ArchitectureRole
}
/** 一对的判定：哪些角色在被检树里没有文件（有一个就不能判方向），以及命中了哪些依赖。 */
export interface DirectionJudgement {
  readonly pair: DirectionPair
  readonly empty: readonly EmptyRole[]
  readonly hits: readonly DirectionHit[]
}
/**
 * `omne-deps` 与报告共用的判定：同一份方向行、全部角色、同一张图。源角色与目标角色有没有文件用同一条规则判：
 * 图的 `modules` 里有没有文件落在角色的 `paths` 里。成员改名或迁走后，两边都不能以「命中 0 处」通过。
 */
export function judgeDirections(
  policy: DirectionPolicy,
  graph: Pick<DependencyGraph, 'modules' | 'dependencies'>,
): DirectionJudgement[] {
  const pairs = directionPairs(policy)
  const hits = hitsOf(graph.dependencies, pairs)
  const populated = new Map<string, boolean>()
  const isEmpty = (role: ArchitectureRole): boolean => {
    const known = populated.get(role.id)
    if (known !== undefined) return !known
    const found = graph.modules.some(path => inRole(path, role))
    populated.set(role.id, found)
    return !found
  }
  return pairs.map(pair => {
    const sides: readonly EmptyRole[] = [
      { side: 'source', role: pair.from },
      { side: 'target', role: pair.to },
    ]
    return {
      pair,
      empty: sides.filter(item => isEmpty(item.role)),
      hits: hits.filter(hit => hit.pair === pair),
    }
  })
}

const SIDE_LABEL: Record<EmptyRole['side'], string> = { source: '源角色', target: '目标角色' }
/** 角色没有文件时给人看的原因；`omne-deps` 的发现与报告的未知行用同一句。 */
const emptyReason = ({ side, role }: EmptyRole): string =>
  `${SIDE_LABEL[side]} ${role.id} 的 paths 在被检树中匹配不到任何文件，不能判方向`

/**
 * `omne-deps` 的发现：每处命中一条 `direction-rule`，`rule` 是方向行 id，`sites` 是导入处；
 * 源角色或目标角色没有文件的每个（方向行，角色）一条 `direction-unknown`。
 */
export function directionFindings(judgements: readonly DirectionJudgement[]): DirectionFinding[] {
  const unknown = new Map<string, DirectionFinding>()
  for (const { pair, empty } of judgements)
    for (const item of empty) {
      const key = `${pair.direction.id}\u0000${item.side}\u0000${item.role.id}`
      if (!unknown.has(key))
        unknown.set(key, {
          kind: 'direction-unknown',
          rule: pair.direction.id,
          message: `[${pair.direction.id}] ${emptyReason(item)}：${pair.direction.source}`,
          sites: [],
          edges: [],
        })
    }
  const hits = judgements
    .flatMap(judgement => judgement.hits)
    .sort(byPosition)
    .map(({ pair, dependency }): DirectionFinding => ({
      kind: 'direction-rule',
      rule: pair.direction.id,
      message: `[${pair.direction.id}] ${dependency.path} 依赖了 ${dependency.resolved}（${pair.from.id} → ${pair.to.id}）：${pair.direction.source}`,
      sites: [{ path: dependency.path, line: dependency.line, specifier: dependency.specifier }],
      edges: [{ from: pair.fromMember, to: pair.toMember }],
    }))
  return [...unknown.values(), ...hits]
}

/** 报告能拿到的依赖事实：有图，或者说明为什么没有。 */
export type DirectionFacts =
  | { readonly kind: 'graph'; readonly graph: Pick<DependencyGraph, 'modules' | 'dependencies'> }
  | { readonly kind: 'unavailable'; readonly reason: string }

/** 只把 dependency-cruiser 或 Git 的已知失败记成不可得；别的异常照常抛出。 */
export function directionFacts(read: () => DependencyGraph): DirectionFacts {
  try {
    return { kind: 'graph', graph: read() }
  } catch (error) {
    if (error instanceof DependencyGraphUnavailable)
      return { kind: 'unavailable', reason: error.message }
    throw error
  }
}

/** 某个版本的依赖图：工作树取当前树（含未提交的改动），历史版本取那个提交。取哪一版只在这里决定。 */
export function versionGraph(
  root: string,
  source: Pick<SourceCoordinates, 'kind' | 'commit'>,
): DependencyGraph {
  return source.kind === 'worktree' ? workingGraph(root) : revisionGraph(root, source.commit)
}

/** 有图时一对的状态与原因：有角色没有文件为 unknown，没有命中为 converged，有命中为 deviation。 */
function judgedState({
  empty,
  hits,
}: Pick<DirectionJudgement, 'empty' | 'hits'>): [ConformanceRow['state'], string] {
  if (empty.length > 0) return ['unknown', empty.map(emptyReason).join('；')]
  if (hits.length === 0)
    return ['converged', '该成员对的已解析源码导入没有指向目标成员；不表示整体符合']
  return [
    'deviation',
    `${hits.length} 处依赖了目标成员：${hits
      .map(hit => `${hit.dependency.path}:${hit.dependency.line} → ${hit.dependency.resolved}`)
      .join('；')}`,
  ]
}

/**
 * 架构符合性报告的方向行：每对一行。没有命中为 converged；有命中为 deviation，`reason` 逐处列源文件、
 * 目标文件与行号；源角色或目标角色在被检版本里没有文件、或依赖事实不可得时为 unknown 并写明原因。`age` 一律 unjudged，
 * 由 `directionConformance` 对基线判。
 */
export function directionRows(policy: DirectionPolicy, facts: DirectionFacts): ConformanceRow[] {
  const judgements =
    facts.kind === 'graph'
      ? judgeDirections(policy, facts.graph)
      : directionPairs(policy).map(pair => ({ pair, empty: [], hits: [] }))
  return judgements.map(judgement => {
    const { pair, hits } = judgement
    const { direction, from, to } = pair
    const [state, reason]: [ConformanceRow['state'], string] =
      facts.kind === 'unavailable'
        ? ['unknown', `依赖事实不可得：${facts.reason}`]
        : judgedState(judgement)
    return {
      id: JSON.stringify(['DIRECTION', direction.id, from.id, to.id]),
      rule: 'DIRECTION',
      state,
      age: 'unjudged',
      member: pair.fromMember,
      targetMember: pair.toMember,
      key: `${direction.id} ${from.id} → ${to.id}`,
      reason,
      expected: direction.source,
      sites: hits.map(hit => ({ path: hit.dependency.path, line: hit.dependency.line })),
    }
  })
}

/** 读某个版本依赖图的函数；默认是 `versionGraph`，测试可以换成计数的读法。 */
export type GraphReader = (
  root: string,
  source: Pick<SourceCoordinates, 'kind' | 'commit'>,
) => DependencyGraph

/** 读文件清单时的已知「没有」：路径不存在，或路径上某一段不是目录。别的失败都按「可能有文件」处理。 */
const absent = (error: unknown): boolean => {
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * 工作树里落在角色 `paths` 下的文件有没有：按每条 `paths` 的静态前缀查磁盘，找到一个就停。经过符号链接的路径照常
 * 跟进（dependency-cruiser 也走进链接的目录）；遇到不是目录的项（文件、链接、别的）就算有。读不了的目录按有处理。
 */
function workingTreeHasFiles(root: string, role: ArchitectureRole): boolean {
  const walk = (directory: string): boolean => {
    let entries: Dirent[]
    try {
      entries = readdirSync(join(root, directory), { withFileTypes: true })
    } catch (error) {
      return !absent(error)
    }
    return entries.some(entry => {
      const path = `${directory}/${entry.name}`
      return entry.isDirectory() ? walk(path) : inRole(path, role)
    })
  }
  return role.paths.some(pattern => {
    if (pattern.endsWith('/**')) return walk(pattern.slice(0, -3))
    try {
      lstatSync(join(root, pattern))
      return true
    } catch (error) {
      return !absent(error)
    }
  })
}

/** `a/b/c` 与它的上级目录：`a`、`a/b`、`a/b/c`。 */
const withAncestors = (path: string): string[] =>
  path.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))

/**
 * 提交里落在角色 `paths` 下的文件有没有，清单是 `git ls-tree -r --name-only <commit>`。Git 不走进符号链接与子模块，
 * 依赖图的导出树却会走进链接的目录，所以前缀或它的某个上级在提交里不是目录（链接、子模块、文件）时按有处理。
 * 提交本身不在仓库里、或 Git 失败，也按有处理：交给取图，图取不到时照常记成依赖事实不可得。
 */
function commitHasFiles(root: string, commit: string, role: ArchitectureRole): boolean {
  /** 跑一条 git；起不来或退出码非零时为 undefined。 */
  const git = (args: readonly string[], input?: string): string | undefined => {
    try {
      return execFileSync('git', ['-C', root, ...args], {
        env: repositoryEnv(process.env),
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(input === undefined ? {} : { input }),
      })
    } catch {
      return undefined
    }
  }
  const patternHasFiles = (pattern: string): boolean => {
    const prefix = pattern.endsWith('/**') ? pattern.slice(0, -3) : undefined
    // 先确认提交在，再从最上一级往下看每一段在提交里是什么：缺了就没有；不是目录就按有处理
    // （链接、子模块，或精确路径本身就是文件）。
    const checked = git(
      ['cat-file', '--batch-check=%(objecttype)'],
      [`${commit}^{commit}`, ...withAncestors(prefix ?? pattern).map(path => `${commit}:${path}`)]
        .map(line => `${line}\n`)
        .join(''),
    )
    if (checked === undefined) return true
    const [self, ...types] = checked.split('\n').filter(line => line !== '')
    if (self !== 'commit') return true
    for (const type of types) {
      if (type.endsWith(' missing')) return false
      if (type !== 'tree') return true
    }
    // 精确路径是个目录：图的 `modules` 只有文件，不会等于它。
    if (prefix === undefined) return false
    const listed = git([
      '--literal-pathspecs',
      'ls-tree',
      '-r',
      '--name-only',
      '-z',
      commit,
      '--',
      prefix,
    ])
    return (
      listed === undefined || listed.split('\u0000').some(path => path !== '' && inRole(path, role))
    )
  }
  return role.paths.some(patternHasFiles)
}

/** 某个版本里，方向行引用的角色有没有一个匹配得到文件；找到一个就停。 */
function anyRoleHasFiles(
  root: string,
  source: Pick<SourceCoordinates, 'kind' | 'commit'>,
  policy: DirectionPolicy,
): boolean {
  const seen = new Set<string>()
  return directionPairs(policy).some(({ from, to }) =>
    [from, to].some(role => {
      if (seen.has(role.id)) return false
      seen.add(role.id)
      return source.kind === 'worktree'
        ? workingTreeHasFiles(root, role)
        : commitHasFiles(root, source.commit, role)
    }),
  )
}

/** 方向行引用的角色都没有文件时的依赖事实：没有文件，也就没有依赖。 */
const NO_FILES: Pick<DependencyGraph, 'modules' | 'dependencies'> = {
  modules: [],
  dependencies: [],
}

/**
 * 报告的方向行一节。方向行与角色只从可信 runner 的 `constraints.json` 读（全部角色，不按退休过滤），
 * 与 `omne-deps` 同一份；runner 没有文件或没有方向行就没有这一节，也不取依赖图。
 * 被检版本与基线版本都用这份方向行，依赖事实各取各的版本：`graph` 是调用方已经算好的被检版本的图。
 * 没给 `graph` 时先按路径看：方向行引用的角色在这个版本的文件清单里都匹配不到文件，就不取图，每一行都是两边角色都没有
 * 文件的 unknown，与取图的结果逐字相同（清单覆盖图的 `modules`，清单里没有的图里也没有）。有一个角色有文件就照常取图。
 * 基线版本独立判断。给了基线时偏离行判新旧；基线的图不可得就不判，`age` 留 unjudged，每一行的 `reason` 末尾写明基线依赖事实不可得及原因。
 */
export function directionConformance(input: {
  readonly root: string
  readonly current: Pick<SourceCoordinates, 'kind' | 'commit'>
  readonly baseline?: Pick<SourceCoordinates, 'kind' | 'commit'> | undefined
  readonly graph?: DependencyGraph | undefined
  readonly readGraph?: GraphReader | undefined
}): ConformanceRow[] {
  const runner = readRunnerConstraints()
  if (runner.kind === 'missing' || (runner.value.directions ?? []).length === 0) return []
  const policy = runner.value
  const readGraph = input.readGraph ?? versionGraph
  const factsOf = (source: Pick<SourceCoordinates, 'kind' | 'commit'>): DirectionFacts =>
    anyRoleHasFiles(input.root, source, policy)
      ? directionFacts(() => readGraph(input.root, source))
      : { kind: 'graph', graph: NO_FILES }
  const rows = directionRows(
    policy,
    input.graph === undefined ? factsOf(input.current) : { kind: 'graph', graph: input.graph },
  )
  if (input.baseline === undefined) return rows
  const stock = factsOf(input.baseline)
  if (stock.kind === 'unavailable')
    return rows.map(row => ({
      ...row,
      reason: `${row.reason}；基线依赖事实不可得，偏离行未判新旧：${stock.reason}`,
    }))
  const stockIds = new Set(
    directionRows(policy, stock)
      .filter(row => row.state === 'deviation')
      .map(row => row.id),
  )
  return rows.map(row => ({
    ...row,
    age: row.state !== 'deviation' ? 'unjudged' : stockIds.has(row.id) ? 'stock' : 'new',
  }))
}
