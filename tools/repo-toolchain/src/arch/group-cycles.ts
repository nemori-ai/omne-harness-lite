// 具名组环例外：schema 3 `constraints.json` 的 `groupCycleExceptions` 对依赖图组环发现的判定。
// `omne-deps` 与回路状态的硬线都从这里算，输入是同一份可信 runner 的例外与同一张依赖图（deps/graph.ts）。
// 例外登记的是裁定过的成员边：组环的每一条跨组成员边都登记了才放行，有一条没登记就照常失败；
// 成员环、文件环与规则违规不受影响；登记的边没有出现在任何组环里，例外本身是一条发现，
// 但只在被检树就是登记例外的 runner 自己时判：跨树检查时被检树的组环说明不了例外有没有过期。
import type { DependencyFinding, FindingEdge, GroupCycleFinding } from '../deps/graph.ts'
import type {
  ArchitectureGroupCycleEdge,
  ArchitectureGroupCycleException,
} from './conformance-model.ts'
import type { RunnerConstraints } from './constraints.ts'

/** 登记了却没有出现在任何组环里的边：例外过期、边被删或边不再属于组环，照常失败。 */
export type GroupCycleExceptionFinding = DependencyFinding<'unused-group-cycle-exception'>

/** 放行一个组环所用的一条登记边，与登记它的例外。 */
export interface ReleasedEdge {
  readonly edge: ArchitectureGroupCycleEdge
  readonly exception: ArchitectureGroupCycleException
}

/** 一个按例外放行的组环：环上的每条跨组成员边都登记了，`released` 是这些边与登记它们的例外。 */
export interface ExceptedGroupCycle {
  readonly finding: GroupCycleFinding
  readonly released: readonly ReleasedEdge[]
}

export interface GroupCycleJudgement {
  /** 照常失败的发现：原发现去掉放行的组环，原顺序不变。 */
  readonly findings: readonly DependencyFinding[]
  readonly excepted: readonly ExceptedGroupCycle[]
  /** 每条有边没用上的例外一条，按例外在文件里的顺序。 */
  readonly unused: readonly GroupCycleExceptionFinding[]
}

/** runner 的例外；runner 没有 `constraints.json` 或文件是 schema 1、2 时没有例外。 */
export function runnerGroupCycleExceptions(
  constraints: RunnerConstraints,
): readonly ArchitectureGroupCycleException[] {
  return constraints.kind === 'missing' ? [] : (constraints.value.groupCycleExceptions ?? [])
}

const edgeKey = (edge: FindingEdge) => `${edge.from}\u0000${edge.to}`
const arrow = (edge: FindingEdge) => `${edge.from} → ${edge.to}`

/**
 * `judgeUnused` 为假时不报没用上的例外：例外登记在 runner 的树里，被检树是另一棵树时，
 * 登记的边不在被检树的组环里不说明例外过期。放行规则不受影响。
 */
export function judgeGroupCycles(
  findings: readonly DependencyFinding[],
  exceptions: readonly ArchitectureGroupCycleException[],
  judgeUnused: boolean = true,
): GroupCycleJudgement {
  const registered = new Map<string, ReleasedEdge>()
  for (const exception of exceptions)
    for (const edge of exception.edges) registered.set(edgeKey(edge), { edge, exception })
  const kept: DependencyFinding[] = []
  const excepted: ExceptedGroupCycle[] = []
  const appearing = new Set<string>()
  for (const finding of findings) {
    if (finding.kind !== 'group-cycle') {
      kept.push(finding)
      continue
    }
    const released: ReleasedEdge[] = []
    const unregistered: FindingEdge[] = []
    for (const edge of finding.edges) {
      appearing.add(edgeKey(edge))
      const hit = registered.get(edgeKey(edge))
      if (hit === undefined) unregistered.push(edge)
      else released.push(hit)
    }
    if (released.length === 0) kept.push(finding)
    else if (unregistered.length > 0)
      kept.push({
        ...finding,
        message: `${finding.message}；环上未登记为例外的边：${unregistered.map(arrow).join('、')}`,
      })
    else excepted.push({ finding, released })
  }
  const unused: GroupCycleExceptionFinding[] = []
  for (const exception of judgeUnused ? exceptions : []) {
    const lost = exception.edges.filter(edge => !appearing.has(edgeKey(edge)))
    if (lost.length > 0)
      unused.push({
        kind: 'unused-group-cycle-exception',
        rule: 'unused-group-cycle-exception',
        message: `组环例外 ${exception.id} 登记的边没有出现在任何组环里：${lost.map(arrow).join('、')}（裁定 ${exception.ruling}）。组环已经消失或这条边不在环上，删掉或改写这条例外`,
        sites: [],
        edges: lost,
      })
  }
  return { findings: kept, excepted, unused }
}

/** 给人看的一行：哪个组环靠哪条例外的哪些边放行，带裁定链接。 */
export function exceptedLine(item: ExceptedGroupCycle): string {
  const byException = new Map<
    string,
    { exception: ArchitectureGroupCycleException; edges: ArchitectureGroupCycleEdge[] }
  >()
  for (const { edge, exception } of item.released) {
    const entry = byException.get(exception.id) ?? { exception, edges: [] }
    entry.edges.push(edge)
    byException.set(exception.id, entry)
  }
  const used = [...byException.values()].map(
    ({ exception, edges }) =>
      `例外 ${exception.id}（裁定 ${exception.ruling}）放行 ${edges.map(arrow).join('、')}：${exception.reason}`,
  )
  return `组环 ${item.finding.groups.join('、')} 按${used.join('；')}`
}
