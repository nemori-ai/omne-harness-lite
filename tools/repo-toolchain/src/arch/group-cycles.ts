// 具名组环例外：schema 3 `constraints.json` 的 `groupCycleExceptions` 对依赖图组环发现的判定。
// `omne-deps` 与回路状态的硬线都从这里算，输入是同一份可信 runner 的例外与同一张依赖图（deps/graph.ts）。
// 只放行组集合完全相同的组环；成员环、文件环与规则违规不受影响；没有命中任何组环的例外本身是一条发现。
import type { DependencyFinding } from '../deps/graph.ts'
import type { ArchitectureGroupCycleException } from './conformance-model.ts'
import type { RunnerConstraints } from './constraints.ts'

/** 登记了却没有命中任何组环的例外：例外过期后残留，照常失败。 */
export type GroupCycleExceptionFinding = DependencyFinding<'unused-group-cycle-exception'>

/** 一个按例外放行的组环与它命中的例外。 */
export interface ExceptedGroupCycle {
  readonly finding: DependencyFinding
  readonly exception: ArchitectureGroupCycleException
}

export interface GroupCycleJudgement {
  /** 照常失败的发现：原发现去掉放行的组环，原顺序不变。 */
  readonly findings: readonly DependencyFinding[]
  readonly excepted: readonly ExceptedGroupCycle[]
  /** 每条没有命中的例外一条，按例外在文件里的顺序。 */
  readonly unused: readonly GroupCycleExceptionFinding[]
}

/** runner 的例外；runner 没有 `constraints.json` 或文件是 schema 1、2 时没有例外。 */
export function runnerGroupCycleExceptions(
  constraints: RunnerConstraints,
): readonly ArchitectureGroupCycleException[] {
  return constraints.kind === 'missing' ? [] : (constraints.value.groupCycleExceptions ?? [])
}

const setKey = (groups: readonly string[]) => [...groups].sort().join('\u0000')

export function judgeGroupCycles(
  findings: readonly DependencyFinding[],
  exceptions: readonly ArchitectureGroupCycleException[],
): GroupCycleJudgement {
  const bySet = new Map(exceptions.map(exception => [setKey(exception.groups), exception]))
  const kept: DependencyFinding[] = []
  const excepted: ExceptedGroupCycle[] = []
  const hit = new Set<string>()
  for (const finding of findings) {
    const exception =
      finding.kind === 'group-cycle' && finding.groups !== undefined
        ? bySet.get(setKey(finding.groups))
        : undefined
    if (exception === undefined) {
      kept.push(finding)
      continue
    }
    excepted.push({ finding, exception })
    hit.add(exception.id)
  }
  const unused = exceptions
    .filter(exception => !hit.has(exception.id))
    .map((exception): GroupCycleExceptionFinding => ({
      kind: 'unused-group-cycle-exception',
      rule: 'unused-group-cycle-exception',
      message: `组环例外 ${exception.id} 没有命中任何组环：${exception.groups.join('、')}（裁定 ${exception.ruling}）。组环已经消失或变了范围，删掉或改写这条例外`,
      sites: [],
      edges: [],
    }))
  return { findings: kept, excepted, unused }
}

/** 给人看的一行：哪个组环按哪条例外放行，带裁定链接。 */
export function exceptedLine(item: ExceptedGroupCycle): string {
  return `组环 ${item.exception.groups.join('、')} 按例外 ${item.exception.id} 放行（裁定 ${item.exception.ruling}）：${item.exception.reason}`
}
