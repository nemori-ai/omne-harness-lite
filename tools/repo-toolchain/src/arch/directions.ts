import { filePresence } from '../core/version-files.ts'
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
export type DirectionFinding = DependencyFinding<'direction-rule' | 'direction-unknown'>

export function directionPairs(policy: DirectionPolicy): DirectionPair[] {
  const roles = new Map(policy.roles.map(role => [role.id, role]))
  const role = (id: string): ArchitectureRole => {
    const found = roles.get(id)
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

export function memberPairCount(pairs: readonly DirectionPair[]): number {
  return new Set(pairs.map(pair => `${pair.fromMember}\u0000${pair.toMember}`)).size
}

export const inRole = (path: string, role: ArchitectureRole): boolean =>
  role.paths.some(pattern => matchesRolePath(path, pattern))

const byPosition = (a: DirectionHit, b: DirectionHit): number =>
  a.dependency.path.localeCompare(b.dependency.path) ||
  a.dependency.line - b.dependency.line ||
  a.pair.direction.id.localeCompare(b.pair.direction.id) ||
  a.pair.from.id.localeCompare(b.pair.from.id) ||
  a.pair.to.id.localeCompare(b.pair.to.id)

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

export interface EmptyRole {
  readonly side: 'source' | 'target'
  readonly role: ArchitectureRole
}
export interface DirectionJudgement {
  readonly pair: DirectionPair
  readonly empty: readonly EmptyRole[]
  readonly hits: readonly DirectionHit[]
}
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
const emptyReason = ({ side, role }: EmptyRole): string =>
  `${SIDE_LABEL[side]} ${role.id} 的 paths 在被检树中匹配不到任何文件，不能判方向`

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

export type DirectionFacts =
  | { readonly kind: 'graph'; readonly graph: Pick<DependencyGraph, 'modules' | 'dependencies'> }
  | { readonly kind: 'unavailable'; readonly reason: string }

export function directionFacts(read: () => DependencyGraph): DirectionFacts {
  try {
    return { kind: 'graph', graph: read() }
  } catch (error) {
    if (error instanceof DependencyGraphUnavailable)
      return { kind: 'unavailable', reason: error.message }
    throw error
  }
}

export function versionGraph(
  root: string,
  source: Pick<SourceCoordinates, 'kind' | 'commit'>,
): DependencyGraph {
  return source.kind === 'worktree' ? workingGraph(root) : revisionGraph(root, source.commit)
}

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

export type GraphReader = (
  root: string,
  source: Pick<SourceCoordinates, 'kind' | 'commit'>,
) => DependencyGraph

function anyRoleHasFiles(
  root: string,
  source: Pick<SourceCoordinates, 'kind' | 'commit'>,
  policy: DirectionPolicy,
): boolean {
  const roles = new Map(
    directionPairs(policy)
      .flatMap(({ from, to }) => [from, to])
      .map(role => [role.id, role]),
  )
  const present = filePresence(root, source)
  return [...roles.values()].some(role => present(role.paths))
}

const NO_FILES: Pick<DependencyGraph, 'modules' | 'dependencies'> = {
  modules: [],
  dependencies: [],
}

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
