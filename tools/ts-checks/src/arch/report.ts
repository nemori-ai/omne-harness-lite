import {
  actualArchitectureOf,
  compareActualArchitectures,
  type ActualArchitectureDocument,
  type ActualArchitectureInput,
} from './actual.ts'
import { readArchitectureSource } from './source.ts'
import { productSource } from './resolve.ts'
import { buildReport, type Report } from '../metrics/report.ts'
import { GROUP_DIRECTION_POLICY } from '../rules/group-direction.ts'
import type { MetricsConfig } from '../metrics/config.ts'

/** Read each version once. Architecture and function differences use the exact same snapshots. */
export function readArchitectureReport(
  input: ActualArchitectureInput,
  config: MetricsConfig,
): { document: ActualArchitectureDocument; report: Report } {
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
  return {
    document,
    report: buildReport({
      files,
      policy: GROUP_DIRECTION_POLICY,
      thresholds: config.thresholds,
      bands: config.bands,
      ...(baselineSource === undefined ? {} : { changed, baseTexts }),
    }),
  }
}
