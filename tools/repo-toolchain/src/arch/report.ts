import {
  actualArchitectureOf,
  compareActualArchitectures,
  type ActualArchitectureDocument,
  type ActualArchitectureInput,
} from './actual.ts'
import { readArchitectureSource } from './source.ts'
import { productSource } from './resolve.ts'
import { buildReport, type Report } from '../metrics/report.ts'
import type { MetricsConfig } from '../metrics/config.ts'
import { conformanceOf } from './conformance.ts'
import { versionGraph } from './directions.ts'
import type { Conformance } from './conformance-model.ts'

/** Read each version once. Architecture and function differences use the exact same snapshots. */
export function readArchitectureReport(
  input: ActualArchitectureInput,
  config: MetricsConfig,
): { document: ActualArchitectureDocument; report: Report; conformance: Conformance } {
  const currentSource = readArchitectureSource(input.root, input.revision)
  const baselineSource =
    input.base === undefined ? undefined : readArchitectureSource(input.root, input.base)
  const current = actualArchitectureOf(currentSource)
  const baseline = baselineSource === undefined ? undefined : actualArchitectureOf(baselineSource)
  const document: ActualArchitectureDocument = {
    schemaVersion: 1,
    kind: 'actual-architecture',
    generatedAt: new Date().toISOString(),
    current,
    ...(baseline === undefined
      ? {}
      : { baseline, difference: compareActualArchitectures(baseline, current) }),
  }
  const files = currentSource.members
    .filter(member => member.category === 'product')
    .flatMap(member =>
      member.sources.filter(productSource).map(path => {
        const text = currentSource.snapshot.texts.get(path)
        if (text === undefined) throw new Error(`Missing report source ${path}`)
        return { path, text }
      }),
    )
  const changed = new Map<string, [number, number][]>()
  const baseTexts = new Map<string, string | undefined>()
  if (baselineSource !== undefined) {
    for (const file of files) {
      const before = baselineSource.snapshot.texts.get(file.path)
      if (before !== file.text) {
        changed.set(file.path, [[1, Number.MAX_SAFE_INTEGER]])
        baseTexts.set(file.path, before)
      }
    }
  }
  // 与抽取同一个版本的图：符合性的方向行与度量读同一张。
  const graph = versionGraph(input.root, currentSource.source)
  return {
    document,
    conformance: conformanceOf(input.root, currentSource, baselineSource, graph),
    report: buildReport({
      files,
      graph,
      thresholds: config.thresholds,
      bands: config.bands,
      ...(baselineSource === undefined ? {} : { changed, baseTexts }),
    }),
  }
}
