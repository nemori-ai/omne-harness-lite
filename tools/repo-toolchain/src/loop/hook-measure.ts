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
  explainOf,
  measuredReport,
  readAssertions,
  readNewEdges,
  readStability,
} from './run.ts'

export function isProductSource(path: string): boolean {
  const member = memberOf(path)
  return member !== undefined && member.group !== 'examples' && isMeasuredSource(path)
}

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
    hardLines: measured ? directionLines(report) : { direction: [], cycles: [] },
    alert: metrics.thresholds.alert,
    ...(measured ? {} : { dependencyNote: RESOLUTION_NOTE }),
  }
}
