import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileAt, git } from '../../core/git.ts'
import { analyzeConformance, readConformance } from '../../arch/conformance.ts'
import { readArchitectureSource } from '../../arch/source.ts'
import { CONSTRAINT_PATH, CONSTRAINT_PATHS } from '../../arch/constraints.ts'
import type { Conformance, ConstraintChange } from '../../arch/conformance-model.ts'
import type { DependencyGraph } from '../../deps/graph.ts'
import { data, noData, type Reading } from '../reading.ts'
import { observeAssembly, type AssemblyDelta, type AssemblyObservations } from './assembly.ts'

export interface ArchitectureReadings {
  readonly architecture: Reading<AssemblyObservations>
  readonly assemblyDelta: Reading<AssemblyDelta>
  readonly architectureChanges: Reading<readonly ConstraintChange[]>
  readonly conformance: Reading<Conformance>
}
/**
 * Read each complete source version once. No manual node declaration oracle remains.
 * `graph` 是调用方已经算过的工作树依赖图：符合性的方向行读它，不再跑一次 dependency-cruiser。
 */
export function readArchitectureSensors(
  root: string,
  config: { readonly enabled: boolean },
  base?: string,
  graph?: DependencyGraph,
): ArchitectureReadings {
  if (!config.enabled)
    return {
      architecture: noData('配置里关了'),
      assemblyDelta: noData('配置里关了'),
      architectureChanges: noData('配置里关了'),
      conformance: noData('配置里关了'),
    }
  const baselineHasWorkspace =
    base === undefined ||
    git(root, ['ls-tree', '--name-only', '-z', `${base}^{commit}`, '--', 'pnpm-workspace.yaml'])
      .split('\0')
      .includes('pnpm-workspace.yaml')
  const currentSource = existsSync(join(root, 'pnpm-workspace.yaml'))
    ? readArchitectureSource(root)
    : undefined
  const baselineSource =
    base !== undefined && baselineHasWorkspace ? readArchitectureSource(root, base) : undefined
  // Validate each present version before reporting the other version's absence.
  if (currentSource === undefined || (base !== undefined && baselineSource === undefined)) {
    const reason =
      currentSource === undefined
        ? '当前源码缺 pnpm-workspace.yaml，无法解析实际 workspace'
        : 'BASE 源码缺 pnpm-workspace.yaml，不能借 HEAD 配置补齐'
    return {
      architecture: noData(reason),
      assemblyDelta: noData(reason),
      architectureChanges: noData(reason),
      conformance: noData(reason),
    }
  }
  const observed = analyzeConformance(root, currentSource, baselineSource, graph)
  const assembly = observeAssembly(observed.headActual, observed.baseActual)
  return {
    architecture:
      observed.conformance.current.value === null || observed.conformance.baseline?.value === null
        ? noData(`全局架构预期不可用：${CONSTRAINT_PATH}`)
        : data(assembly),
    assemblyDelta: assembly.delta,
    architectureChanges:
      base === undefined ? noData('没给基线') : data(observed.conformance.changes),
    conformance: data(observed.conformance),
  }
}
export function readConformanceSensor(
  root: string,
  enabled: boolean,
  base?: string,
): Reading<Conformance> {
  if (!enabled) return noData('配置里关了')
  if (
    !CONSTRAINT_PATHS.some(
      path =>
        existsSync(join(root, path)) ||
        (base !== undefined && fileAt(root, base, path) !== undefined),
    )
  )
    return noData('全局架构预期未提供')
  const result = readConformance({ root, ...(base === undefined ? {} : { base }) })
  return result.current.value === null || result.baseline?.value === null
    ? noData('当前或BASE架构预期缺失，无法判断符合性')
    : data(result)
}
