import { isAbsolute, normalize } from 'node:path'
import { compareArchitecture, type IntentChange } from '../../arch/compare.ts'
import { extractArchitecture } from '../../arch/extract.ts'
import { readIntents, semanticIntent } from '../../arch/intent.ts'
import type {
  Comparison,
  ComparisonResult,
  Extraction,
  IntentNode,
  Snapshot,
} from '../../arch/model.ts'
import { readSnapshot } from '../../arch/snapshot.ts'
import { data, noData, type Reading } from '../reading.ts'

export interface Reflexion {
  readonly current: Extraction
  /** Current source against merge-base intent: HEAD intent cannot remove deviations. */
  readonly comparison: ComparisonResult
  readonly newDeviations: Reading<readonly Comparison[]>
  readonly intentChanges: Reading<readonly IntentChange[]>
  readonly missing: readonly Comparison[]
  readonly nodeRoot: string
  readonly staticScope: string
}
export interface ReflexionReadings {
  readonly reflexion: Reading<Reflexion>
  /** Declaration differences remain observable without current comparison declarations. */
  readonly intentChanges: Reading<readonly IntentChange[]>
}
function intentChangesBetween(
  headNodes: readonly IntentNode[],
  baseNodes: readonly IntentNode[] | undefined,
): Reading<readonly IntentChange[]> {
  if (baseNodes === undefined) return noData('没给基线')
  const before = new Map(baseNodes.map(node => [node.member, node])),
    after = new Map(headNodes.map(node => [node.member, node]))
  const value = (node: IntentNode | undefined): string | null =>
    node === undefined || (node.assembly === undefined && node.composition === undefined)
      ? null
      : semanticIntent(node)
  const changes: IntentChange[] = []
  for (const member of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const oldNode = before.get(member),
      newNode = after.get(member)
    const oldValue = value(oldNode),
      newValue = value(newNode)
    if (oldValue !== newValue)
      changes.push({
        member,
        path: (newNode ?? oldNode)?.path ?? '',
        before: oldValue,
        after: newValue,
      })
  }
  return data(changes)
}
export function compareRevisions(
  head: Snapshot,
  base: Snapshot | undefined,
  nodeRoot: string,
): Reflexion {
  const current = extractArchitecture(head),
    headNodes = readIntents(head, nodeRoot)
  const baseNodes = base === undefined ? undefined : readIntents(base, nodeRoot)
  const comparison = compareArchitecture(current, baseNodes ?? headNodes)
  const baseline =
    base === undefined ? undefined : compareArchitecture(extractArchitecture(base), baseNodes ?? [])
  const historical = new Set(
    baseline?.comparisons.filter(item => item.state === 'deviation').map(item => item.id),
  )
  return {
    current,
    comparison,
    newDeviations:
      baseline === undefined
        ? noData('没给基线')
        : data(
            comparison.comparisons.filter(
              item => item.state === 'deviation' && !historical.has(item.id),
            ),
          ),
    intentChanges: intentChangesBetween(headNodes, baseNodes),
    missing: comparison.comparisons.filter(item => item.state === 'missing'),
    nodeRoot,
    staticScope:
      'Static TypeScript AST and version-local workspace exports; tests/examples excluded; no dynamic loading, isolation or same-commit guarantee proved',
  }
}
export function readReflexion(
  root: string,
  config: { readonly enabled: boolean; readonly nodeRoot: string },
  mergeBase?: string,
): ReflexionReadings {
  if (!config.enabled)
    return { reflexion: noData('配置里关了'), intentChanges: noData('配置里关了') }
  if (isAbsolute(config.nodeRoot) || normalize(config.nodeRoot).startsWith('..'))
    throw new Error('sensors.reflexion.nodeRoot must be relative to the measured repository')
  const head = readSnapshot(root, config.nodeRoot)
  const nodes = readIntents(head, config.nodeRoot)
  const base = mergeBase === undefined ? undefined : readSnapshot(root, config.nodeRoot, mergeBase)
  if (!nodes.some(node => node.assembly !== undefined || node.composition !== undefined))
    return {
      reflexion: noData(
        nodes.length === 0
          ? `${config.nodeRoot} 缺失或没有 realization 节点`
          : `${config.nodeRoot} 完全没有 assembly/composition 声明`,
      ),
      intentChanges: intentChangesBetween(
        nodes,
        base === undefined ? undefined : readIntents(base, config.nodeRoot),
      ),
    }
  const result = compareRevisions(head, base, config.nodeRoot)
  return { reflexion: data(result), intentChanges: result.intentChanges }
}
