import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileAt } from '../../metrics/git.ts'
import { analyzeConformance, readConformance } from '../../arch/conformance.ts'
import { readArchitectureSource } from '../../arch/source.ts'
import { CONSTRAINT_PATH } from '../../arch/constraints.ts'
import type { Conformance } from '../../arch/conformance-model.ts'
import { data, noData, type Reading } from '../reading.ts'
import { compareObserved, readReflexion, type ReflexionReadings } from './reflexion.ts'

/** Keep both owners active without reading or parsing product source twice. */
export function readArchitectureSensors(
  root: string,
  config: { readonly enabled: boolean; readonly nodeRoot: string },
  base?: string,
): ReflexionReadings & { readonly conformance: Reading<Conformance> } {
  if (
    !config.enabled ||
    config.nodeRoot !== '.meta_harness/design/realization' ||
    (!existsSync(join(root, CONSTRAINT_PATH)) &&
      (base === undefined || fileAt(root, base, CONSTRAINT_PATH) === undefined))
  )
    return {
      ...readReflexion(root, config, base),
      conformance: readConformanceSensor(root, config.enabled, base),
    }
  const observed = analyzeConformance(
    root,
    readArchitectureSource(root),
    base === undefined ? undefined : readArchitectureSource(root, base),
  )
  const legacy = compareObserved(
    observed.headActual,
    observed.headNodes,
    observed.baseActual,
    observed.baseNodes,
    config.nodeRoot,
  )
  const declared = observed.headNodes.some(
    node => node.assembly !== undefined || node.composition !== undefined,
  )
  return {
    conformance: data(observed.conformance),
    reflexion: declared
      ? data(legacy)
      : noData(`${config.nodeRoot} 完全没有 assembly/composition 声明`),
    intentChanges: legacy.intentChanges,
  }
}

/** A missing new owner is not a migrated legacy owner. Keep the legacy sensor active. */
export function readConformanceSensor(
  root: string,
  enabled: boolean,
  base?: string,
): Reading<Conformance> {
  if (!enabled) return noData('配置里关了')
  if (
    !existsSync(join(root, CONSTRAINT_PATH)) &&
    (base === undefined || fileAt(root, base, CONSTRAINT_PATH) === undefined)
  )
    return noData('本批全局预期尚未发布；原节点声明仍由原传感器消费')
  return data(readConformance({ root, ...(base === undefined ? {} : { base }) }))
}
