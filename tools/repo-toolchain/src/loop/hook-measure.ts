// 收工钩子要的静态读数：与 `pnpm run loop:status --base …` 同一套步骤，但只跑度量报告、稳定依赖、
// 改动过的测试里没有断言的用例与新增依赖；不跑重复代码（全仓要二十多秒）、覆盖率、工作树与 topic 那几项。
// 只在量读数的子进程里加载（它带进 TypeScript 解析器），钩子的主进程不碰。
import { baselines, readTaskContext } from '../core/task-context.ts'
import type { MetricsConfig } from '../metrics/config.ts'
import { changedFiles } from '../core/git.ts'
import { memberOf } from '../deps/graph.ts'
import { isMeasuredSource } from '../metrics/report.ts'
import { collectMemberSources } from '../metrics/sources.ts'
import type { LoopConfig } from './config.ts'
import { nearestBase } from './hook-base.ts'
import { hookGraph, RESOLUTION_NOTE } from './hook-graph.ts'
import type { HookReadings } from './hook.ts'
import { noData } from './reading.ts'
import {
  observeBaselineAt,
  readArchitectureSensors,
  type BaselineReader,
} from './sensors/conformance.ts'
import { CONSTRAINT_PATHS, constraintDependencies } from '../arch/constraints.ts'
import {
  changeSince,
  directionLines,
  loopGroupCycleExceptions,
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
 * 这次变更碰了产品源码时，返回量读数用的基线：有 task context 用它的 taskBase；否则是主线与活跃轨道里离 HEAD
 * 最近的合并点（见 hook-base.ts），一个也求不出就是 HEAD，只看未提交的。没碰 → undefined。只跑 git。
 */
export function touchedBase(root: string, primaryBranch: string): string | undefined {
  const selected = baselines(root)
  if (selected.state === 'bound') {
    const base = readTaskContext(root).ownerTask?.taskBase ?? selected.targetBase
    if (base === undefined) throw new Error('Missing hook baseline in the task context')
    return base
  }
  const base = nearestBase(root, primaryBranch)
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

/**
 * `readBaseline` 给出架构传感器 BASE 一侧的观测；收工钩子传按提交缓存的那一份（loop/baseline-cache.ts）。
 * 它与基线依赖图最先跑：只取决于基线提交，这次即使超过时限被终止，已经存下的下次也只读。两者都取到之后调
 * `baselineReady`，`graphPrepared` 说基线依赖图是不是这次现算存下的。
 * 依赖图只换改过的文件的边（loop/hook-graph.ts）；解析配置变了就不量依赖项，读数里只留那一句。
 */
export function measureForHook(
  root: string,
  base: string,
  config: LoopConfig,
  metrics: MetricsConfig,
  readBaseline: BaselineReader = observeBaselineAt,
  baselineReady: (commit: string, graphPrepared: boolean) => void = () => {},
): HookReadings {
  const change = changeSince(root, base)
  if (config.sensors.architecture.enabled) readBaseline(root, change.mergeBase)
  const dependencies = hookGraph(root, change)
  baselineReady(dependencies.commit, dependencies.prepared)
  const measured = dependencies.kind === 'graph'
  const files = collectMemberSources(root)
  const { graph } = dependencies
  const report = measuredReport(root, files, metrics, change, graph)
  // 只要改动过的测试文件里的：全仓的测试文件逐个解析要一秒多，而要解释的红项本来就只看改动过的。
  const changedTests = files.filter(file => change.paths.has(file.path))
  const explain = explainOf(
    root,
    report,
    {
      stability: measured
        ? readStability(report, config.sensors.stability)
        : noData(RESOLUTION_NOTE),
      assertions: readAssertions(changedTests, config.sensors.assertions),
      newEdges: measured
        ? readNewEdges(root, report, change, config.sensors.newEdges.enabled)
        : noData(RESOLUTION_NOTE),
      duplication: noData('收工钩子不跑重复代码'),
    },
    change,
  )
  const { conformance, assemblyDelta } = readArchitectureSensors(
    root,
    config.sensors.architecture,
    change.mergeBase,
    graph,
    readBaseline,
  )
  return {
    explain: {
      ...explain,
      conformance,
      assemblyDelta,
    },
    hardLines: measured
      ? directionLines(report, loopGroupCycleExceptions(root))
      : { direction: [], cycles: [] },
    alert: metrics.thresholds.alert,
    ...(measured ? {} : { dependencyNote: RESOLUTION_NOTE }),
  }
}
