// 收工钩子量读数的子进程要做的事：先只跑 git 看这次变更碰没碰产品源码，碰了再量。
// 进程与消息通道的装配在 hook-child.ts；这里没有进程副作用，进程内可直接调用。
import { readMetricsConfig } from '../metrics/config.ts'
import { cachedBaselineReader } from './baseline-cache.ts'
import { readLoopConfig } from './config.ts'
import { measureForHook, touchedBase } from './hook-measure.ts'
import type { ChildJob, ChildMessage } from './hook-process.ts'

/**
 * 做一份任务，返回要发回的 `result` 消息。基线读数这次现算存下时，量的过程中调 `onPrepared` 报一次提交。
 */
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
