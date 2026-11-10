// 收工钩子量读数的子进程：先只跑 git 看这次变更碰没碰产品源码，碰了再量。
// 量的过程是同步的，放在子进程里主进程才能按时限整组终止它；输入与发回的消息见 hook-process.ts。
import { readMetricsConfig } from '../metrics/config.ts'
import { cachedBaselineReader } from './baseline-cache.ts'
import { readLoopConfig } from './config.ts'
import { measureForHook, touchedBase } from './hook-measure.ts'
import { jobOf, type ChildMessage } from './hook-process.ts'

const send = (message: ChildMessage, then: (error: Error | null) => void = () => {}) => {
  if (process.send === undefined)
    throw new Error('量读数的子进程要由 hook-process.ts 起，带消息通道')
  process.send(message, then)
}

const job = jobOf(process.argv[2])
const base = touchedBase(job.root, job.primaryBranch)
let result: ChildMessage
if (base === undefined) result = { kind: 'result', touched: false }
else {
  const config = readLoopConfig()
  // 架构观测与依赖图两份基线都取到之后才说「已备好」：只备好一份就超时，下次还要算另一份。
  let architecturePrepared = false
  const readBaseline = cachedBaselineReader(job.home, config.sensors.architecture, {
    onPrepared: () => {
      architecturePrepared = true
    },
  })
  result = {
    kind: 'result',
    touched: true,
    readings: measureForHook(
      job.root,
      base,
      config,
      readMetricsConfig(),
      readBaseline,
      (commit, graphPrepared) => {
        if (architecturePrepared || graphPrepared) send({ kind: 'prepared', commit })
      },
    ),
  }
}
// 发完就退出：消息通道开着时进程不会自己结束。
send(result, () => process.exit(0))
