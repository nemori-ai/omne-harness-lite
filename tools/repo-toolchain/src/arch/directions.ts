// 方向规则：schema 3 `constraints.json` 的 `directions` 对依赖图里文件级事实的判定。
// `omne-deps` 的方向发现与架构符合性报告的 `DIRECTION` 行都从这里算，输入是同一份可信 runner 的方向行与
// 同一份 dependency-cruiser 依赖事实（deps/graph.ts），不另走 arch/extract.ts 的静态抽取。
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
/** `omne-deps` 的方向发现：命中一条方向行，或源角色在被检树里没有文件、不能判方向。 */
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

/** 文件按角色的 `paths` 落在角色里。命中判定与「源角色有没有文件」都只用这一条规则，不取最精确的角色。 */
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

/** 一对的判定：from 角色在被检树里有没有文件（没有就不能判方向），以及命中了哪些依赖。 */
export interface DirectionJudgement {
  readonly pair: DirectionPair
  readonly populated: boolean
  readonly hits: readonly DirectionHit[]
}
/** `omne-deps` 与报告共用的判定：同一份方向行、全部角色、同一张图。 */
export function judgeDirections(
  policy: DirectionPolicy,
  graph: Pick<DependencyGraph, 'modules' | 'dependencies'>,
): DirectionJudgement[] {
  const pairs = directionPairs(policy)
  const hits = hitsOf(graph.dependencies, pairs)
  return pairs.map(pair => ({
    pair,
    populated: graph.modules.some(path => inRole(path, pair.from)),
    hits: hits.filter(hit => hit.pair === pair),
  }))
}

/**
 * `omne-deps` 的发现：每处命中一条 `direction-rule`，`rule` 是方向行 id，`sites` 是导入处；
 * 源角色没有文件的每个（方向行，角色）一条 `direction-unknown`。
 */
export function directionFindings(judgements: readonly DirectionJudgement[]): DirectionFinding[] {
  const unknown = new Map<string, DirectionFinding>()
  for (const { pair, populated } of judgements) {
    if (populated) continue
    const key = `${pair.direction.id}\u0000${pair.from.id}`
    if (!unknown.has(key))
      unknown.set(key, {
        kind: 'direction-unknown',
        rule: pair.direction.id,
        message: `[${pair.direction.id}] 源角色 ${pair.from.id} 的 paths 在被检树中匹配不到任何文件，不能判方向：${pair.direction.source}`,
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
  | { readonly kind: 'graph'; readonly graph: DependencyGraph }
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

/**
 * 架构符合性报告的方向行：每对一行。没有命中为 converged；有命中为 deviation，`reason` 逐处列源文件、
 * 目标文件与行号；源角色在被检版本里没有文件、或依赖事实不可得时为 unknown 并写明原因。`age` 一律 unjudged，
 * 由 `directionConformance` 对基线判。
 */
export function directionRows(policy: DirectionPolicy, facts: DirectionFacts): ConformanceRow[] {
  const judgements =
    facts.kind === 'graph'
      ? judgeDirections(policy, facts.graph)
      : directionPairs(policy).map(pair => ({ pair, populated: false, hits: [] }))
  return judgements.map(({ pair, populated, hits }) => {
    const { direction, from, to } = pair
    const [state, reason]: [ConformanceRow['state'], string] =
      facts.kind === 'unavailable'
        ? ['unknown', `依赖事实不可得：${facts.reason}`]
        : !populated
          ? ['unknown', `源角色 ${from.id} 的 paths 在被检树中匹配不到任何文件，不能判方向`]
          : hits.length === 0
            ? ['converged', '该成员对的已解析源码导入没有指向目标成员；不表示整体符合']
            : [
                'deviation',
                `${hits.length} 处依赖了目标成员：${hits
                  .map(
                    hit =>
                      `${hit.dependency.path}:${hit.dependency.line} → ${hit.dependency.resolved}`,
                  )
                  .join('；')}`,
              ]
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

/**
 * 报告的方向行一节。方向行与角色只从可信 runner 的 `constraints.json` 读（全部角色，不按退休过滤），
 * 与 `omne-deps` 同一份；runner 没有文件或没有方向行就没有这一节，也不取依赖图。
 * 被检版本与基线版本都用这份方向行，依赖事实各取各的版本：`graph` 是调用方已经算好的被检版本的图。
 * 给了基线时偏离行判新旧；基线的图不可得就不判，`age` 留 unjudged。
 */
export function directionConformance(input: {
  readonly root: string
  readonly current: Pick<SourceCoordinates, 'kind' | 'commit'>
  readonly baseline?: Pick<SourceCoordinates, 'kind' | 'commit'> | undefined
  readonly graph?: DependencyGraph | undefined
}): ConformanceRow[] {
  const runner = readRunnerConstraints()
  if (runner.kind === 'missing' || (runner.value.directions ?? []).length === 0) return []
  const policy = runner.value
  const rows = directionRows(
    policy,
    directionFacts(() => input.graph ?? versionGraph(input.root, input.current)),
  )
  if (input.baseline === undefined) return rows
  const baseline = input.baseline
  const stock = directionFacts(() => versionGraph(input.root, baseline))
  const stockIds = new Set(
    stock.kind === 'graph'
      ? directionRows(policy, stock)
          .filter(row => row.state === 'deviation')
          .map(row => row.id)
      : [],
  )
  return rows.map(row => ({
    ...row,
    age:
      row.state !== 'deviation' || stock.kind === 'unavailable'
        ? 'unjudged'
        : stockIds.has(row.id)
          ? 'stock'
          : 'new',
  }))
}
