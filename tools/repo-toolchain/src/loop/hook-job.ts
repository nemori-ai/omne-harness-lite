import { readMetricsConfig } from '../metrics/config.ts'
import { cachedBaselineReader } from './baseline-cache.ts'
import { readLoopConfig } from './config.ts'
import { measureForHook, touchedBase } from './hook-measure.ts'
import type { ChildJob, ChildMessage } from './hook-process.ts'

export function resultOf(
  job: ChildJob,
  onPrepared: (commit: string) => void,
): Extract<ChildMessage, { kind: 'result' }> {
  const base = touchedBase(job.root, job.primaryBranch)
  if (base === undefined) return { kind: 'result', touched: false }
  const config = readLoopConfig()
  // 架构观测与依赖图两份基线都取到之后才说「已备好」：只备好一份就超时，下次还要算另一份。
  let architecturePrepared = false
  const readBaseline = cachedBaselineReader(job.home, config.sensors.architecture, {
    onPrepared: () => {
      architecturePrepared = true
    },
  })
  return {
    kind: 'result',
    touched: true,
    readings: measureForHook(
      job.root,
      base,
      config,
      readMetricsConfig(),
      readBaseline,
      (commit, graphPrepared) => {
        if (architecturePrepared || graphPrepared) onPrepared(commit)
      },
    ),
  }
}
