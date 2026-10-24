// 方向规则：schema 3 `constraints.json` 的 `directions` 对依赖图里文件级事实的判定。
// `omne-deps` 的 `direction-rule` 发现与架构符合性报告的 `DIRECTION` 行都从这里算，输入是同一份
// dependency-cruiser 依赖事实（deps/graph.ts 的 `dependencies`），不另走 arch/extract.ts 的静态抽取。
import { memberOf, type DependencyFinding, type FileDependency } from '../deps/graph.ts'
import type {
  ArchitectureConstraints,
  ArchitectureDirection,
  ArchitectureRole,
  ConformanceRow,
} from './conformance-model.ts'
import { matchesRolePath, roleAt, roleMember } from './constraints.ts'

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

export function directionPairs(policy: DirectionPolicy): DirectionPair[] {
  const roles = new Map(policy.roles.map(role => [role.id, role]))
  const role = (id: string): ArchitectureRole => {
    const found = roles.get(id)
    if (found === undefined) throw new Error(`Architecture direction references unknown role ${id}`)
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

const byPosition = (a: DirectionHit, b: DirectionHit): number =>
  a.dependency.path.localeCompare(b.dependency.path) ||
  a.dependency.line - b.dependency.line ||
  a.pair.direction.id.localeCompare(b.pair.direction.id) ||
  a.pair.from.id.localeCompare(b.pair.from.id) ||
  a.pair.to.id.localeCompare(b.pair.to.id)

/**
 * 命中：依赖所在模块按 `roleAt`（对全部角色，取最精确的）落在某对的 from 角色，解析后的目标文件所在成员等于该对的
 * to 成员。目标在 `src/`、`dist/` 或声明文件里都算同一成员。一处依赖同时命中几对就记几次。
 */
export function directionHits(
  dependencies: readonly FileDependency[],
  pairs: readonly DirectionPair[],
  roles: readonly ArchitectureRole[],
): DirectionHit[] {
  const hits: DirectionHit[] = []
  for (const dependency of dependencies) {
    const source = roleAt(dependency.path, roles)
    const target = memberOf(dependency.resolved)?.path
    if (source === undefined || target === undefined) continue
    for (const pair of pairs)
      if (pair.from.id === source.id && pair.toMember === target) hits.push({ pair, dependency })
  }
  return hits.sort(byPosition)
}

/** `omne-deps` 的发现：`rule` 是方向行 id，`sites` 是导入处。 */
export function directionFindings(hits: readonly DirectionHit[]): DependencyFinding[] {
  return hits.map(({ pair, dependency }) => ({
    kind: 'direction-rule',
    rule: pair.direction.id,
    message: `[${pair.direction.id}] ${dependency.path} 依赖了 ${dependency.resolved}（${pair.from.id} → ${pair.to.id}）：${pair.direction.source}`,
    sites: [{ path: dependency.path, line: dependency.line, specifier: dependency.specifier }],
    edges: [{ from: pair.fromMember, to: pair.toMember }],
  }))
}

/** 报告能拿到的依赖事实：有图，或者说明为什么没有。 */
export type DirectionFacts =
  | { readonly kind: 'graph'; readonly dependencies: readonly FileDependency[] }
  | { readonly kind: 'unavailable'; readonly reason: string }

/**
 * 架构符合性报告的方向行：每对一行。没有命中为 converged；有命中为 deviation，`reason` 逐处列源文件、
 * 目标文件与行号；源角色的 `paths` 在被检树里匹配不到文件、或依赖事实不可得时为 unknown 并写明原因。
 */
export function directionRows(
  policy: DirectionPolicy,
  facts: DirectionFacts,
  files: Iterable<string>,
): ConformanceRow[] {
  const pairs = directionPairs(policy)
  if (pairs.length === 0) return []
  const paths = [...files]
  const hits = facts.kind === 'graph' ? directionHits(facts.dependencies, pairs, policy.roles) : []
  return pairs.map(pair => {
    const { direction, from, to } = pair
    const own = hits.filter(hit => hit.pair === pair)
    const populated = paths.some(path => from.paths.some(pattern => matchesRolePath(path, pattern)))
    const [state, reason]: [ConformanceRow['state'], string] = !populated
      ? ['unknown', `源角色 ${from.id} 的 paths 在被检树中匹配不到任何文件，不能判方向`]
      : facts.kind === 'unavailable'
        ? ['unknown', `依赖事实不可得：${facts.reason}`]
        : own.length === 0
          ? ['converged', '该成员对的已解析源码导入没有指向目标成员；不表示整体符合']
          : [
              'deviation',
              `${own.length} 处依赖了目标成员：${own
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
      sites: own.map(hit => ({ path: hit.dependency.path, line: hit.dependency.line })),
    }
  })
}
