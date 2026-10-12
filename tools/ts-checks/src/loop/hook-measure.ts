// 收工钩子要的静态读数：与 `make loop-status BASE=…` 同一套步骤，但只跑度量报告、稳定依赖、
// 改动过的测试里没有断言的用例与新增依赖；不跑重复代码（全仓要二十多秒）、覆盖率、工作树与 topic 那几项。
// 只在量读数的线程里加载（它带进 TypeScript 解析器），主线程不碰。
import { baselines, loadIntegration } from '../integration/context.ts'
import type { MetricsConfig } from '../metrics/config.ts'
import { changedFiles, git } from '../metrics/git.ts'
import { memberOf } from '../metrics/graph.ts'
import { isMeasuredSource } from '../metrics/report.ts'
import { collectMemberSources } from '../metrics/sources.ts'
import type { LoopConfig } from './config.ts'
import type { HookReadings } from './hook.ts'
import { noData } from './reading.ts'
import { readArchitectureSensors } from './sensors/conformance.ts'
import { CONSTRAINT_PATHS, constraintDependencies } from '../arch/constraints.ts'
import {
  changeSince,
  directionLines,
  explainOf,
  measuredReport,
  readAssertions,
  readNewEdges,
  readStability,
} from './run.ts'

/** 落在 `packages/`、`apps/` 成员被度量的源码范围内（与度量判「被度量的源」同一个函数）。 */
export function isProductSource(path: string): boolean {
  const member = memberOf(path)
  return member !== undefined && member.group !== 'examples' && isMeasuredSource(path)
}

/**
 * 这次变更碰了产品源码时，返回量读数用的基线：与主线的合并点；求不出（没有这个分支、历史不相交）就是 HEAD，
 * 只看未提交的。没碰 → undefined。只跑 git。
 */
export function touchedBase(root: string, primaryBranch: string): string | undefined {
  const selected = baselines(root)
  if (selected.state === 'adopted') {
    const state = loadIntegration(root)
    if (state.kind !== 'adopted' || state.context === null)
      throw new Error('Missing adopted hook context')
    const base = state.context.ownerTask?.taskBase ?? selected.targetBase
    if (base === undefined) throw new Error('Missing adopted hook baseline')
    return base
  }
  let base = 'HEAD'
  try {
    base = git(root, ['merge-base', primaryBranch, 'HEAD'])
  } catch {
    // 求不出合并点：只看未提交的改动。
  }
  const changed = changedFiles(root, base)
  if (changed.some(path => isProductSource(path) || CONSTRAINT_PATHS.some(input => input === path)))
    return base
  if (!changed.some(path => path.endsWith('.md'))) return undefined
  const dependencies = new Set([
    ...constraintDependencies(root),
    ...constraintDependencies(root, base),
  ])
  return changed.some(path => dependencies.has(path)) ? base : undefined
}

export function measureForHook(
  root: string,
  base: string,
  config: LoopConfig,
  metrics: MetricsConfig,
): HookReadings {
  const files = collectMemberSources(root)
  const change = changeSince(root, base)
  const report = measuredReport(root, files, metrics, change)
  // 只要改动过的测试文件里的：全仓的测试文件逐个解析要一秒多，而要解释的红项本来就只看改动过的。
  const changedTests = files.filter(file => change.paths.has(file.path))
  const explain = explainOf(
    root,
    report,
    {
      stability: readStability(report, config.sensors.stability),
      assertions: readAssertions(changedTests, config.sensors.assertions),
      newEdges: readNewEdges(files, change, config.sensors.newEdges.enabled),
      duplication: noData('收工钩子不跑重复代码'),
    },
    change,
  )
  const { conformance, assemblyDelta } = readArchitectureSensors(
    root,
    config.sensors.architecture,
    change.mergeBase,
  )
  return {
    explain: {
      ...explain,
      conformance,
      assemblyDelta,
    },
    hardLines: directionLines(report),
    alert: metrics.thresholds.alert,
  }
}
